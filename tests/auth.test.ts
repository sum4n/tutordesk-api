import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { signToken } from "../src/lib/jwt.js";

// Children before parents. Any other order hits a foreign key.
// Submission → Assignment → Batch → Class → User.
beforeEach(async () => {
  await prisma.submission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.class.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Creates a user directly in the database, bypassing /auth/register.
// Tests that are not about registration must not depend on it: if
// registration breaks, these tests should still tell you whether
// login and /me work.
async function createStudent(
  overrides: Partial<{ email: string; password: string; name: string }> = {},
) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? "student@test.local",
      password: await bcrypt.hash(overrides.password ?? "password123", 10),
      name: overrides.name ?? "Student One",
      role: "STUDENT",
    },
  });
}

describe("POST /auth/register", () => {
  it("creates a student, normalizes the email, and returns a token", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "  Student@Example.COM  ",
      password: "password123",
      name: "Student One",
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));

    // email was trimmed and lowercased BEFORE validation —
    // the ordering inside emailField is what this asserts.
    expect(res.body.user).toMatchObject({
      email: "student@example.com",
      name: "Student One",
      role: "student",
      classId: null,
      batchId: null,
    });

    // serializeUser is an allowlist. password must never appear.
    expect(res.body.user).not.toHaveProperty("password");
  });

  it("rejects a duplicate email with 409", async () => {
    await createStudent({ email: "dup@test.local" });

    const res = await request(app).post("/auth/register").send({
      email: "dup@test.local",
      password: "password123",
      name: "Another",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Email already registered");
  });

  it("rejects a short password with 400", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "short@test.local",
      password: "short",
      name: "Short",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(JSON.stringify(res.body.details)).toContain("password");
  });

  it("rejects a client-supplied role with 400", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "evil@test.local",
      password: "password123",
      name: "Evil",
      role: "teacher",
    });

    // registerSchema is a strict object: unknown keys are rejected,
    // not silently stripped. This is the test that proves the
    // privilege-escalation attempt fails.
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(JSON.stringify(res.body.details)).toContain("role");

    const count = await prisma.user.count();
    expect(count).toBe(0);
  });

  it("rejects an unknown classId with 404", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "noclass@test.local",
      password: "password123",
      name: "No Class",
      classId: "does-not-exist",
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Class not found");
  });
});

describe("POST /auth/login", () => {
  it("returns a token and the user for valid credentials", async () => {
    await createStudent({ email: "login@test.local", password: "password123" });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "login@test.local", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      email: "login@test.local",
      role: "student",
    });
    expect(res.body.user).not.toHaveProperty("password");
  });

  it("rejects a wrong password with the generic message", async () => {
    await createStudent({ email: "login@test.local", password: "password123" });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "login@test.local", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("rejects an unknown email with the identical generic message", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@test.local", password: "password123" });

    expect(res.status).toBe(401);

    // Must be byte-identical to the wrong-password message.
    // Any difference would let an attacker enumerate accounts.
    expect(res.body.error).toBe("Invalid email or password");
  });
});

describe("GET /auth/me", () => {
  it("returns the current user for a valid token", async () => {
    const user = await createStudent({ email: "me@test.local" });

    // Signed directly, not obtained via /auth/login, so this test
    // does not depend on the login endpoint working.
    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: user.id,
      email: "me@test.local",
      role: "student",
    });
    expect(res.body.user).not.toHaveProperty("password");
  });

  it("rejects a missing Authorization header with 401", async () => {
    const res = await request(app).get("/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Missing or malformed Authorization header");
  });

  it("rejects a malformed token with 401", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer not.a.real.token");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired token");
  });
});
