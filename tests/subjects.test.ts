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

describe("GET /subjects", () => {
  it("returns a bare array sorted by name", async () => {
    await prisma.subject.createMany({
      data: [{ name: "Physics" }, { name: "Chemistry" }],
    });

    const res = await request(app).get("/subjects");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe("Chemistry");
    expect(res.body[1].name).toBe("Physics");
  });

  it("returns an empty array when there are no subjects", async () => {
    const res = await request(app).get("/subjects");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /subjects", () => {
  it("rejects a missing token with 401", async () => {
    const res = await request(app).post("/subjects").send({ name: "Maths" });
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
      .post("/subjects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Maths" });

    expect(res.status).toBe(403);
  });

  it("creates a subject for a teacher", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .post("/subjects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Mathematics", description: "Core subject" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Mathematics",
      description: "Core subject",
    });
    expect(res.body.id).toEqual(expect.any(String));
  });

  it("rejects an unknown key with 400", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .post("/subjects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Maths", classId: "sneaky" });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toContain("classId");
  });
});

describe("PATCH /subjects/:id", () => {
  it("updates a subject", async () => {
    const token = await getTeacherToken(app);
    const created = await prisma.subject.create({ data: { name: "Old" } });

    const res = await request(app)
      .patch(`/subjects/${created.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New");
  });

  it("returns 404 for an unknown id", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .patch("/subjects/does-not-exist")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Subject not found");
  });
});

describe("DELETE /subjects/:id", () => {
  it("deletes an unreferenced subject", async () => {
    const token = await getTeacherToken(app);
    const created = await prisma.subject.create({ data: { name: "Doomed" } });

    const res = await request(app)
      .delete(`/subjects/${created.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(await prisma.subject.count()).toBe(0);
  });

  it("returns 409 when an assignment references the subject", async () => {
    const token = await getTeacherToken(app);

    // Assignment needs a class and a due date. Subject is the row we
    // are trying to delete; the assignment is what blocks it.
    const cls = await prisma.class.create({ data: { name: "C1" } });
    const subject = await prisma.subject.create({ data: { name: "Maths" } });
    await prisma.assignment.create({
      data: {
        title: "A1",
        dueDate: new Date(),
        classId: cls.id,
        subjectId: subject.id,
      },
    });

    const res = await request(app)
      .delete(`/subjects/${subject.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe(
      "Can not delete subject: assignments still reference it",
    );

    // The subject still exists — this is the point of the test.
    expect(await prisma.subject.count()).toBe(1);
  });

  it("returns 404 for an unknown id", async () => {
    const token = await getTeacherToken(app);

    const res = await request(app)
      .delete("/subjects/does-not-exist")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
