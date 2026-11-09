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

// Builds the minimum graph an assignment needs: Class → Subject.
// No batch unless asked — most tests need class-wide assignments.
async function makeContext(batchName?: string) {
  const cls = await prisma.class.create({ data: { name: `C-${Date.now()}` } });
  const subject = await prisma.subject.create({
    data: { name: `S-${Date.now()}` },
  });
  const batch = batchName
    ? await prisma.batch.create({ data: { name: batchName, classId: cls.id } })
    : null;
  return { classId: cls.id, subjectId: subject.id, batchId: batch?.id ?? null };
}

describe("GET /assignments", () => {
  it("returns all assignments for a teacher", async () => {
    const token = await getTeacherToken(app);
    const a = await makeContext();
    const b = await makeContext();

    await prisma.assignment.createMany({
      data: [
        {
          title: "A1",
          dueDate: new Date(),
          classId: a.classId,
          subjectId: a.subjectId,
        },
        {
          title: "A2",
          dueDate: new Date(),
          classId: b.classId,
          subjectId: b.subjectId,
        },
      ],
    });

    const res = await request(app)
      .get("/assignments")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("returns only the student's own class assignments", async () => {
    const ctx1 = await makeContext();
    const ctx2 = await makeContext();

    await prisma.assignment.createMany({
      data: [
        {
          title: "Mine",
          dueDate: new Date(),
          classId: ctx1.classId,
          subjectId: ctx1.subjectId,
        },
        {
          title: "Other class",
          dueDate: new Date(),
          classId: ctx2.classId,
          subjectId: ctx2.subjectId,
        },
      ],
    });

    const student = await prisma.user.create({
      data: {
        email: "s@test.local",
        password: "x",
        name: "S",
        role: "STUDENT",
        classId: ctx1.classId,
      },
    });

    const token = signToken({
      id: student.id,
      email: student.email,
      role: student.role,
    });

    const res = await request(app)
      .get("/assignments")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Mine");
  });

  it("hides batch-specific assignments from a student in a different batch", async () => {
    const ctx = await makeContext("Batch A");

    await prisma.assignment.createMany({
      data: [
        // Class-wide: visible to every student in the class.
        {
          title: "Class-wide",
          dueDate: new Date(),
          classId: ctx.classId,
          subjectId: ctx.subjectId,
        },
        // Batch-scoped: visible only to Batch A.
        {
          title: "Batch A only",
          dueDate: new Date(),
          classId: ctx.classId,
          subjectId: ctx.subjectId,
          batchId: ctx.batchId,
        },
      ],
    });

    // Student with no batch sees only the class-wide one.
    const noBatchStudent = await prisma.user.create({
      data: {
        email: "nobatch@test.local",
        password: "x",
        name: "NB",
        role: "STUDENT",
        classId: ctx.classId,
        batchId: null,
      },
    });

    const token = signToken({
      id: noBatchStudent.id,
      email: noBatchStudent.email,
      role: noBatchStudent.role,
    });

    const res = await request(app)
      .get("/assignments")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Class-wide");
  });

  it("returns an empty array for an unenrolled student", async () => {
    const student = await prisma.user.create({
      data: {
        email: "u@test.local",
        password: "x",
        name: "U",
        role: "STUDENT",
        classId: null,
      },
    });

    const token = signToken({
      id: student.id,
      email: student.email,
      role: student.role,
    });

    const res = await request(app)
      .get("/assignments")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("rejects a missing token with 401", async () => {
    const res = await request(app).get("/assignments");
    expect(res.status).toBe(401);
  });
});
