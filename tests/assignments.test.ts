import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { signToken } from "../src/lib/jwt.js";
import { clearDatabase, getTeacherToken } from "./helpers.js";
import crypto from "node:crypto";

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Builds the minimum graph an assignment needs: Class → Subject.
// No batch unless asked — most tests need class-wide assignments.
async function makeContext(batchName?: string) {
  // unique per call — Class.name and Subject.name are @unique
  const suffix = crypto.randomUUID().slice(0, 8);
  const cls = await prisma.class.create({ data: { name: `Class-${suffix}` } });
  const subject = await prisma.subject.create({
    data: { name: `Subject-${suffix}` },
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

describe("POST /assignments", () => {
  it("rejects a missing token with 401", async () => {
    const res = await request(app).post("/assignments").send({});
    expect(res.status).toBe(401);
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
    const token = signToken({
      id: student.id,
      email: student.email,
      role: student.role,
    });

    const res = await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("creates an assignment with class-wide scope", async () => {
    const token = await getTeacherToken(app);
    const ctx = await makeContext();

    const res = await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Chapter 4",
        description: "Do problems 1-20",
        pdfUrl: "chapter4.pdf",
        classId: ctx.classId,
        subjectId: ctx.subjectId,
        dueDate: "2026-12-01",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Chapter 4",
      classId: ctx.classId,
      subjectId: ctx.subjectId,
      batchId: null,
    });
    expect(res.body.id).toEqual(expect.any(String));
  });

  it("rejects a client-supplied createdAt with 400", async () => {
    const token = await getTeacherToken(app);
    const ctx = await makeContext();

    const res = await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "X",
        pdfUrl: "x.pdf",
        classId: ctx.classId,
        subjectId: ctx.subjectId,
        dueDate: "2026-12-01",
        createdAt: "2020-01-01",
      });

    // createdAt is server-managed. strictObject rejects it.
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toContain("createdAt");
  });

  it("rejects a batch that belongs to a different class with 400", async () => {
    const token = await getTeacherToken(app);
    const ctxA = await makeContext("Batch A");
    const ctxB = await makeContext("Batch B");

    const res = await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Mismatched",
        pdfUrl: "x.pdf",
        classId: ctxA.classId,
        batchId: ctxB.batchId, // belongs to ctxB's class, not ctxA
        subjectId: ctxA.subjectId,
        dueDate: "2026-12-01",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Batch does not belong to the given class");
  });

  it("rejects an unknown classId with 404", async () => {
    const token = await getTeacherToken(app);
    const ctx = await makeContext();

    const res = await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "X",
        pdfUrl: "x.pdf",
        classId: "does-not-exist",
        subjectId: ctx.subjectId,
        dueDate: "2026-12-01",
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Class not found");
  });
});

describe("PATCH /assignments/:id", () => {
  async function createOne() {
    const ctx = await makeContext("Batch A");
    const a = await prisma.assignment.create({
      data: {
        title: "Original",
        dueDate: new Date(),
        classId: ctx.classId,
        batchId: ctx.batchId,
        subjectId: ctx.subjectId,
      },
    });
    return { assignment: a, ctx };
  }

  it("updates title and leaves batch untouched when batchId is omitted", async () => {
    const token = await getTeacherToken(app);
    const { assignment, ctx } = await createOne();

    const res = await request(app)
      .patch(`/assignments/${assignment.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Renamed");
    // The batch was not in the payload — must be preserved.
    expect(res.body.batchId).toBe(ctx.batchId);
  });

  it("moves an assignment back to class-wide with batchId: null", async () => {
    const token = await getTeacherToken(app);
    const { assignment } = await createOne();

    const res = await request(app)
      .patch(`/assignments/${assignment.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ batchId: null });

    expect(res.status).toBe(200);
    // null means "class-wide". Not "skip".
    expect(res.body.batchId).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .patch("/assignments/does-not-exist")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "X" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Assignment not found");
  });
});

describe("DELETE /assignments/:id", () => {
  it("deletes the assignment and cascades to its submissions", async () => {
    const token = await getTeacherToken(app);
    const ctx = await makeContext();

    const assignment = await prisma.assignment.create({
      data: {
        title: "Doomed",
        dueDate: new Date(),
        classId: ctx.classId,
        subjectId: ctx.subjectId,
      },
    });
    const student = await prisma.user.create({
      data: {
        email: "cascade@test.local",
        password: "x",
        name: "S",
        role: "STUDENT",
      },
    });
    await prisma.submission.create({
      data: { assignmentId: assignment.id, studentId: student.id },
    });

    const res = await request(app)
      .delete(`/assignments/${assignment.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);

    // Cascade: the assignment and its submission are gone.
    expect(await prisma.assignment.count()).toBe(0);
    expect(await prisma.submission.count()).toBe(0);

    // SetNull does not apply to Submission.student, but the relation
    // is Cascade on Assignment→Submission, NOT on Submission→User.
    // The specific student row must still exist, by id.
    const survivor = await prisma.user.findUnique({
      where: { id: student.id },
    });
    expect(survivor).not.toBeNull();
    expect(survivor?.email).toBe("cascade@test.local");
  });

  it("returns 404 for an unknown id", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .delete("/assignments/does-not-exist")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
