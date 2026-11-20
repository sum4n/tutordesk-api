import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { signToken } from "../src/lib/jwt.js";
import { clearDatabase, createTeacher, getTeacherToken } from "./helpers.js";

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

describe("POST /users", () => {
  it("rejects a missing token with 401", async () => {
    const res = await request(app)
      .post("/users")
      .send({ name: "X", email: "x@test.local", password: "password123" });
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
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "X", email: "x@test.local", password: "password123" });
    expect(res.status).toBe(403);
  });

  it("creates a student for a teacher", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Aarav",
        email: "aarav@test.local",
        password: "password123",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Aarav",
      email: "aarav@test.local",
      role: "student",
      classId: null,
      batchId: null,
    });
    expect(res.body).not.toHaveProperty("password");
  });

  it("rejects a client-supplied role with 400", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "X",
        email: "x@test.local",
        password: "password123",
        role: "teacher", // the frontend sends this today
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toContain("role");
  });

  it("rejects a duplicate email with 409", async () => {
    const token = await getTeacherToken(app);

    await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "A", email: "dup@test.local", password: "password123" });

    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "B", email: "dup@test.local", password: "password123" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Email already registered");
  });

  it("rejects a batch from a different class with 400", async () => {
    const token = await getTeacherToken(app);
    const c1 = await prisma.class.create({ data: { name: "C1" } });
    const c2 = await prisma.class.create({ data: { name: "C2" } });
    const b2 = await prisma.batch.create({
      data: { name: "B2", classId: c2.id },
    });

    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "X",
        email: "x@test.local",
        password: "password123",
        classId: c1.id,
        batchId: b2.id,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Batch does not belong to the given class");
  });
});

describe("PATCH /users/:id", () => {
  it("updates a student's name", async () => {
    const token = await getTeacherToken(app);
    const student = await prisma.user.create({
      data: {
        email: "s@test.local",
        password: "x",
        name: "Old",
        role: "STUDENT",
      },
    });

    const res = await request(app)
      .patch(`/users/${student.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New");
  });

  it("unassigns a class with classId: null", async () => {
    const token = await getTeacherToken(app);
    const cls = await prisma.class.create({ data: { name: "C1" } });
    const student = await prisma.user.create({
      data: {
        email: "s@test.local",
        password: "x",
        name: "S",
        role: "STUDENT",
        classId: cls.id,
      },
    });

    const res = await request(app)
      .patch(`/users/${student.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ classId: null });

    expect(res.status).toBe(200);
    expect(res.body.classId).toBeNull();
  });

  it("rejects a duplicate email with 409", async () => {
    const token = await getTeacherToken(app);
    await prisma.user.create({
      data: {
        email: "taken@test.local",
        password: "x",
        name: "A",
        role: "STUDENT",
      },
    });
    const other = await prisma.user.create({
      data: {
        email: "other@test.local",
        password: "x",
        name: "B",
        role: "STUDENT",
      },
    });

    const res = await request(app)
      .patch(`/users/${other.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "taken@test.local" });

    expect(res.status).toBe(409);
  });

  it("returns 404 for an unknown id", async () => {
    const token = await getTeacherToken(app);
    const res = await request(app)
      .patch("/users/does-not-exist")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "X" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /users/:id", () => {
  it("deletes a student and cascades their submissions", async () => {
    const token = await getTeacherToken(app);
    const suffix = crypto.randomUUID().slice(0, 8);
    const cls = await prisma.class.create({ data: { name: `C-${suffix}` } });
    const subject = await prisma.subject.create({
      data: { name: `S-${suffix}` },
    });
    const assignment = await prisma.assignment.create({
      data: {
        title: "A",
        dueDate: new Date(),
        classId: cls.id,
        subjectId: subject.id,
      },
    });
    const student = await prisma.user.create({
      data: {
        email: `d-${suffix}@test.local`,
        password: "x",
        name: "D",
        role: "STUDENT",
      },
    });
    await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student.id,
        studentPdfUrl: "x.pdf",
      },
    });

    const res = await request(app)
      .delete(`/users/${student.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(await prisma.submission.count()).toBe(0);
    // Row-level assertion, not count(): the teacher still exists.
    const survivor = await prisma.user.findUnique({
      where: { id: student.id },
    });
    expect(survivor).toBeNull();
  });

  it("refuses to delete the caller's own account with 403", async () => {
    const teacher = await createTeacher();
    const token = signToken({
      id: teacher.id,
      email: teacher.email,
      role: "TEACHER",
    });

    const res = await request(app)
      .delete(`/users/${teacher.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("You cannot delete your own account");
  });
});
