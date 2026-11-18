import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
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

// Builds a class + subject + assignment + student, ready to submit to.
async function makeScene() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const cls = await prisma.class.create({ data: { name: `Class-${suffix}` } });
  const subject = await prisma.subject.create({
    data: { name: `Subject-${suffix}` },
  });
  const assignment = await prisma.assignment.create({
    data: {
      title: "A1",
      dueDate: new Date(),
      classId: cls.id,
      subjectId: subject.id,
    },
  });
  const student = await prisma.user.create({
    data: {
      email: `s-${suffix}@test.local`,
      password: "x",
      name: "Student",
      role: "STUDENT",
      classId: cls.id,
    },
  });
  const studentToken = signToken({
    id: student.id,
    email: student.email,
    role: student.role,
  });
  return {
    classId: cls.id,
    subjectId: subject.id,
    assignment,
    student,
    studentToken,
  };
}

describe("POST /submissions", () => {
  it("rejects a missing token with 401", async () => {
    const res = await request(app).post("/submissions").send({});
    expect(res.status).toBe(401);
  });

  it("rejects a teacher token with 403", async () => {
    const teacherToken = await getTeacherToken(app);
    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ assignmentId: "x", studentPdfUrl: "y" });
    expect(res.status).toBe(403);
  });

  it("creates a submission with server-forced fields", async () => {
    const { assignment, student, studentToken } = await makeScene();

    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ assignmentId: assignment.id, studentPdfUrl: "work.pdf" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      assignmentId: assignment.id,
      studentId: student.id,
      studentPdfUrl: "work.pdf",
      status: "submitted",
      grade: null,
      teacherPdfUrl: null,
      gradedAt: null,
    });
  });

  it("rejects a client-supplied grade with 400", async () => {
    const { assignment, studentToken } = await makeScene();

    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        assignmentId: assignment.id,
        studentPdfUrl: "work.pdf",
        grade: "A+",
        status: "graded",
      });

    // strictObject rejects both unknown keys.
    expect(res.status).toBe(400);
    const details = JSON.stringify(res.body.details);
    expect(details).toContain("grade");
    expect(details).toContain("status");
  });

  it("rejects double submission with 409", async () => {
    const { assignment, studentToken } = await makeScene();

    await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ assignmentId: assignment.id, studentPdfUrl: "first.pdf" });

    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ assignmentId: assignment.id, studentPdfUrl: "second.pdf" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("You have already submitted this assignment");
  });

  it("allows resubmission after RETURNED", async () => {
    const { assignment, studentToken } = await makeScene();
    const teacherToken = await getTeacherToken(app);

    const first = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ assignmentId: assignment.id, studentPdfUrl: "first.pdf" });

    await request(app)
      .patch(`/submissions/${first.body.id}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ status: "returned", feedback: "Redo" });

    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ assignmentId: assignment.id, studentPdfUrl: "second.pdf" });

    expect(res.status).toBe(201);

    // History preserved: two rows exist. This is the whole point of
    // POST-create-instead-of-PATCH on resubmit.
    expect(await prisma.submission.count()).toBe(2);
  });

  it("rejects a submission for an unenrolled student with 403", async () => {
    const { assignment } = await makeScene();
    const suffix = crypto.randomUUID().slice(0, 8);
    const unenrolled = await prisma.user.create({
      data: {
        email: `u-${suffix}@test.local`,
        password: "x",
        name: "U",
        role: "STUDENT",
        classId: null,
      },
    });
    const token = signToken({
      id: unenrolled.id,
      email: unenrolled.email,
      role: unenrolled.role,
    });

    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({ assignmentId: assignment.id, studentPdfUrl: "x.pdf" });

    expect(res.status).toBe(403);
  });

  it("rejects a submission for an assignment from another class with 403", async () => {
    const { studentToken } = await makeScene();
    const other = await makeScene();

    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ assignmentId: other.assignment.id, studentPdfUrl: "x.pdf" });

    expect(res.status).toBe(403);
  });
});

describe("GET /submissions", () => {
  it("returns all submissions for a teacher", async () => {
    const teacherToken = await getTeacherToken(app);
    const scene1 = await makeScene();
    const scene2 = await makeScene();

    await prisma.submission.create({
      data: {
        assignmentId: scene1.assignment.id,
        studentId: scene1.student.id,
        studentPdfUrl: "a.pdf",
      },
    });
    await prisma.submission.create({
      data: {
        assignmentId: scene2.assignment.id,
        studentId: scene2.student.id,
        studentPdfUrl: "b.pdf",
      },
    });

    const res = await request(app)
      .get("/submissions")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("returns only the latest submission per assignment for a student", async () => {
    const { assignment, student, studentToken } = await makeScene();

    // Two rows: an old RETURNED, a newer SUBMITTED. The student must
    // see the newer one, not the older.
    const older = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student.id,
        studentPdfUrl: "old.pdf",
        status: "RETURNED",
        submittedAt: new Date("2026-01-01"),
      },
    });
    const newer = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student.id,
        studentPdfUrl: "new.pdf",
        status: "SUBMITTED",
        submittedAt: new Date("2026-02-01"),
      },
    });

    const res = await request(app)
      .get("/submissions")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(newer.id);
    expect(res.body[0].id).not.toBe(older.id);
    expect(res.body[0].status).toBe("submitted");
  });
});

describe("PATCH /submissions/:id", () => {
  it("rejects a student token with 403", async () => {
    const { assignment, student, studentToken } = await makeScene();
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student.id,
        studentPdfUrl: "x.pdf",
      },
    });

    const res = await request(app)
      .patch(`/submissions/${sub.id}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ status: "graded", grade: "A" });

    expect(res.status).toBe(403);
  });

  it("grades a SUBMITTED submission and sets gradedAt server-side", async () => {
    const teacherToken = await getTeacherToken(app);
    const { assignment, student } = await makeScene();
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student.id,
        studentPdfUrl: "x.pdf",
      },
    });

    const res = await request(app)
      .patch(`/submissions/${sub.id}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ status: "graded", grade: "A", feedback: "Well done" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "graded",
      grade: "A",
      feedback: "Well done",
    });
    expect(res.body.gradedAt).toEqual(expect.any(String));
  });

  it("rejects a client-supplied gradedAt with 400", async () => {
    const teacherToken = await getTeacherToken(app);
    const { assignment, student } = await makeScene();
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student.id,
        studentPdfUrl: "x.pdf",
      },
    });

    const res = await request(app)
      .patch(`/submissions/${sub.id}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        status: "graded",
        grade: "A",
        gradedAt: "2020-01-01", // server owns this
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toContain("gradedAt");
  });

  it("returns a SUBMITTED submission and clears grading fields", async () => {
    const teacherToken = await getTeacherToken(app);
    const { assignment, student } = await makeScene();
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student.id,
        studentPdfUrl: "x.pdf",
        status: "GRADED",
        grade: "B",
        feedback: "Old feedback",
        gradedAt: new Date(),
      },
    });

    const res = await request(app)
      .patch(`/submissions/${sub.id}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ status: "returned", feedback: "Redo" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "returned",
      feedback: "Redo",
      grade: null,
      gradedAt: null,
    });
  });

  it("rejects a PATCH on a RETURNED submission with 409", async () => {
    const teacherToken = await getTeacherToken(app);
    const { assignment, student } = await makeScene();
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student.id,
        studentPdfUrl: "x.pdf",
        status: "RETURNED",
      },
    });

    const res = await request(app)
      .patch(`/submissions/${sub.id}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ status: "graded", grade: "A" });

    expect(res.status).toBe(409);
  });

  it("returns 404 for an unknown id", async () => {
    const teacherToken = await getTeacherToken(app);
    const res = await request(app)
      .patch("/submissions/does-not-exist")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ status: "graded", grade: "A" });
    expect(res.status).toBe(404);
  });
});
