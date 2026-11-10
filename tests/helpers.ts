import bcrypt from "bcryptjs";
import request from "supertest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";

// FK-safe order. Any other order hits a foreign key.
export async function clearDatabase(): Promise<void> {
  await prisma.submission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.class.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.user.deleteMany();
}

// Creates a teacher directly, bypassing /auth/register — which is
// student-only. If registration breaks, class tests must still run.
export async function createTeacher(): Promise<{
  id: string;
  email: string;
}> {
  const teacher = await prisma.user.create({
    data: {
      email: "teacher@test.local",
      password: await bcrypt.hash("password123", 10),
      name: "Test Teacher",
      role: "TEACHER",
    },
  });
  return { id: teacher.id, email: teacher.email };
}

// Logs in and returns the JWT. Uses the real endpoint on purpose:
// every class/batch write depends on authenticate accepting this
// token, so a broken login must fail these tests loudly.
export async function getTeacherToken(app: Express): Promise<string> {
  await createTeacher();
  const res = await request(app)
    .post("/auth/login")
    .send({ email: "teacher@test.local", password: "password123" });
  return res.body.token as string;
}
