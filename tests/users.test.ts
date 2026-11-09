import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { signToken } from "../src/lib/jwt.js";
import { clearDatabase, getTeacherToken } from "./helpers.js";

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /users", () => {
  it("returns only students when ?role=student, sorted by name", async () => {
    const token = await getTeacherToken(app);

    // getTeacherToken already created one TEACHER. These two are the
    // only STUDENT rows the query should return.
    await prisma.user.createMany({
      data: [
        {
          email: "p@test.local",
          password: "x",
          name: "Priya",
          role: "STUDENT",
        },
        {
          email: "a@test.local",
          password: "x",
          name: "Aarav",
          role: "STUDENT",
        },
      ],
    });

    const res = await request(app)
      .get("/users?role=student")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    // Sorted by name. Confirms orderBy reaches the response.
    expect(res.body[0].name).toBe("Aarav");
    expect(res.body[1].name).toBe("Priya");

    // serializeUser allowlist: no password leaks.
    expect(res.body[0]).not.toHaveProperty("password");
    expect(res.body.every((u: { role: string }) => u.role === "student")).toBe(
      true,
    );
  });

  it("rejects a student token with 403", async () => {
    const student = await prisma.user.create({
      data: {
        email: "s@test.local",
        password: "x",
        name: "S",
        role: "STUDENT",
      },
    });

    // Signed directly: this test is about authorization, not login.
    const token = signToken({
      id: student.id,
      email: student.email,
      role: student.role,
    });

    const res = await request(app)
      .get("/users?role=student")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("rejects a missing token with 401", async () => {
    const res = await request(app).get("/users?role=student");
    expect(res.status).toBe(401);
  });

  it("rejects an unknown role filter with 400", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .get("/users?role=admin")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid role filter");
  });
});
