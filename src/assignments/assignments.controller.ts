import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/AppError.js";
import type {
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from "./assignments.schemas.js";

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

export const createAssignment: RequestHandler = async (req, res) => {
  const { title, description, pdfUrl, classId, batchId, subjectId, dueDate } =
    req.body as CreateAssignmentInput;

  // Reject unknown FKs with 404, not a Prisma P2003 surfacing as 500.
  const parentClass = await prisma.class.findUnique({ where: { id: classId } });
  if (!parentClass) throw new AppError("Class not found", 404);

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject) throw new AppError("Subject not found", 404);

  // If a batch is specified, it must exist AND belong to the class.
  // Without the second check, a teacher can attach an assignment to a
  // batch from another class — a row no student-scoped query can reach.
  if (batchId !== null && batchId !== undefined) {
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new AppError("Batch not found", 404);
    if (batch.classId !== classId) {
      throw new AppError("Batch does not belong to the given class", 400);
    }
  }

  const created = await prisma.assignment.create({
    data: {
      title,
      description: description ?? null,
      pdfUrl,
      classId,
      batchId: batchId ?? null,
      subjectId,
      dueDate,
      // createdAt is NOT set. @default(now()) owns it.
    },
  });

  res.status(201).json(created);
};

export const updateAssignment: RequestHandler<{ id: string }> = async (
  req,
  res,
) => {
  const { id } = req.params;
  const { title, description, pdfUrl, classId, batchId, subjectId, dueDate } =
    req.body as UpdateAssignmentInput;

  const existing = await prisma.assignment.findUnique({ where: { id } });
  if (!existing) throw new AppError("Assignment not found", 404);

  // "Effective" values: what the row will look like after this PATCH.
  // Used only for validation; the update payload below stays minimal
  // so Prisma skips fields the caller did not touch.
  const effectiveClassId = classId ?? existing.classId;
  const effectiveBatchId = batchId !== undefined ? batchId : existing.batchId;

  if (effectiveBatchId !== null) {
    const batch = await prisma.batch.findUnique({
      where: { id: effectiveBatchId },
    });
    if (!batch) throw new AppError("Batch not found", 404);
    if (batch.classId !== effectiveClassId) {
      throw new AppError("Batch does not belong to the class", 400);
    }
  }

  if (classId !== undefined) {
    const newClass = await prisma.class.findUnique({ where: { id: classId } });
    if (!newClass) throw new AppError("Class not found", 404);
  }

  if (subjectId !== undefined) {
    const newSubject = await prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!newSubject) throw new AppError("Subject not found", 404);
  }

  const updated = await prisma.assignment.update({
    where: { id },
    data: {
      title,
      description,
      pdfUrl,
      classId,
      // batchId: undefined skips; null clears to class-wide; string sets.
      batchId,
      subjectId,
      dueDate,
    },
  });

  res.status(200).json(updated);
};

export const deleteAssignment: RequestHandler<{ id: string }> = async (
  req,
  res,
) => {
  const { id } = req.params;

  const existing = await prisma.assignment.findUnique({ where: { id } });
  if (!existing) throw new AppError("Assignment not found", 404);

  // Submission.assignment is Cascade. Every submission for this
  // assignment is destroyed. The delete dialog must warn the user.
  await prisma.assignment.delete({ where: { id } });

  res.status(204).end();
};
