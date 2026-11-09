import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/AppError.js";

export const listAssignments: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  // Teacher sees all assignments. There is exactly one teacher in
  // this system, so "all" means every assignment regardless of class.
  if (req.user.role === "TEACHER") {
    const assignments = await prisma.assignment.findMany({
      orderBy: { dueDate: "asc" },
    });
    res.status(200).json(assignments);
    return;
  }

  // Student: read classId and batchId from the DB, not from the JWT.
  // They are not in the token because the teacher can reassign a
  // student at any time — a cached token would keep the old class
  // until expiry.
  const student = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { classId: true, batchId: true },
  });

  // Unenrolled student (classId === null): no assignments. Return an
  // empty array, not 404 — the page renders an empty state.
  if (!student?.classId) {
    res.status(200).json([]);
    return;
  }

  // Visible assignments:
  //   - classId must match the student's class, AND
  //   - batchId is null (class-wide) OR matches the student's batch.
  //
  // An assignment with batchId set is visible only to that batch.
  // A student with batchId === null sees only class-wide assignments.
  const assignments = await prisma.assignment.findMany({
    where: {
      classId: student.classId,
      OR: [{ batchId: null }, { batchId: student.batchId ?? "___no-match___" }],
    },
    orderBy: { dueDate: "asc" },
  });

  res.status(200).json(assignments);
};
