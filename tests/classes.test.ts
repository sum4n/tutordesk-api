import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { clearDatabase, getTeacherToken } from "./helpers.js";

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /classes", () => {
  it("returns a bare array, sorted by name", async () => {
    await prisma.class.createMany({
      data: [{ name: "Class 12" }, { name: "Class 10" }],
    });

    const res = await request(app).get("/classes");

    expect(res.status).toBe(200);
    // Bare array, not { classes: [...] } — this is the contract every
    // frontend hook depends on when it does `await res.json()`.
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe("Class 10");
  });
});

describe("POST /classes", () => {
  it("rejects a request with no token with 401", async () => {
    const res = await request(app).post("/classes").send({ name: "X" });
    expect(res.status).toBe(401);
  });

  it("rejects a student token with 403", async () => {
    const student = await prisma.user.create({
      data: {
        email: "s@test.local",
        password: "irrelevant-hash",
        name: "S",
        role: "STUDENT",
      },
    });

    // Signed directly — this test is about role authorization,
    // not about whether login works.
    const { signToken } = await import("../src/lib/jwt.js");
    const token = signToken({
      id: student.id,
      email: student.email,
      role: student.role,
    });

    const res = await request(app)
      .post("/classes")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "X" });

    expect(res.status).toBe(403);
  });

  it("creates a class for a teacher", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .post("/classes")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Class 10", description: "2026 batch" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Class 10",
      description: "2026 batch",
    });
    expect(res.body.id).toEqual(expect.any(String));
  });

  it("rejects a duplicate name with 409", async () => {
    const token = await getTeacherToken(app);

    await request(app)
      .post("/classes")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Class 10" });

    const res = await request(app)
      .post("/classes")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Class 10" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("A class with this name already exists");
  });

  it("rejects an unknown key with 400", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .post("/classes")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "X", teacherId: "sneaky" });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toContain("teacherId");
  });

  it("rejects an empty name with 400", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .post("/classes")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

describe("PATCH /classes/:id", () => {
  it("updates a class", async () => {
    const token = await getTeacherToken(app);
    const created = await prisma.class.create({ data: { name: "Old" } });

    const res = await request(app)
      .patch(`/classes/${created.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New");
  });

  it("returns 404 for an unknown id", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .patch("/classes/does-not-exist")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Class not found");
  });
});

describe("DELETE /classes/:id", () => {
  it("deletes the class and cascades to batches, assignments, submissions", async () => {
    const token = await getTeacherToken(app);

    const cls = await prisma.class.create({ data: { name: "Doomed" } });
    const batch = await prisma.batch.create({
      data: { name: "B1", classId: cls.id },
    });
    const subject = await prisma.subject.create({ data: { name: "Maths" } });
    const assignment = await prisma.assignment.create({
      data: {
        title: "A1",
        dueDate: new Date(),
        classId: cls.id,
        batchId: batch.id,
        subjectId: subject.id,
      },
    });
    const student = await prisma.user.create({
      data: {
        email: "cascade@test.local",
        password: "x",
        name: "S",
        role: "STUDENT",
        classId: cls.id,
        batchId: batch.id,
      },
    });
    await prisma.submission.create({
      data: { assignmentId: assignment.id, studentId: student.id },
    });

    const res = await request(app)
      .delete(`/classes/${cls.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);

    // Cascade: batch, assignment, submission gone.
    expect(await prisma.batch.count()).toBe(0);
    expect(await prisma.assignment.count()).toBe(0);
    expect(await prisma.submission.count()).toBe(0);

    // SetNull: the student survives, unassigned.
    const survivor = await prisma.user.findUnique({
      where: { id: student.id },
    });
    expect(survivor).not.toBeNull();
    expect(survivor?.classId).toBeNull();
    expect(survivor?.batchId).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .delete("/classes/does-not-exist")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
