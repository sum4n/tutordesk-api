import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/AppError.js";
import { serializeSubmission } from "../lib/submissions.js";
import type {
  CreateSubmissionInput,
  UpdateSubmissionInput,
} from "./submissions.schemas.js";

export const listSubmissions: RequestHandler = async (req, res) => {
  if (!req.user) throw new AppError("Unauthorized", 401);

  if (req.user.role === "TEACHER") {
    const studentIdParam = req.query["studentId"];
    const studentId =
      typeof studentIdParam === "string" ? studentIdParam : undefined;

    const all = await prisma.submission.findMany({
      where: studentId ? { studentId } : undefined,
      orderBy: { submittedAt: "desc" },
    });

    res.status(200).json(all.map(serializeSubmission));
    return;
  }

  // Student: only their own, and only the LATEST per assignment.
  // A RETURNED row followed by a resubmission must not shadow the
  // newer SUBMITTED row — the frontend picks the first match by
  // assignmentId, so "latest" is the only correct answer to send.
  const own = await prisma.submission.findMany({
    where: { studentId: req.user.id },
    orderBy: { submittedAt: "desc" },
  });

  // Map preserves insertion order; we iterate newest-first and keep
  // the first row seen per assignmentId.
  const latestByAssignment = new Map<string, (typeof own)[number]>();
  for (const submission of own) {
    if (!latestByAssignment.has(submission.assignmentId)) {
      latestByAssignment.set(submission.assignmentId, submission);
    }
  }

  res
    .status(200)
    .json(Array.from(latestByAssignment.values()).map(serializeSubmission));
};

export const createSubmission: RequestHandler = async (req, res) => {
  if (!req.user) throw new AppError("Unauthorized", 401);

  const { assignmentId, studentPdfUrl } = req.body as CreateSubmissionInput;

  // Read class/batch from the DB, not the JWT — the teacher can
  // reassign a student at any time, and a cached token would keep
  // the old values until it expired.
  const student = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { classId: true, batchId: true },
  });
  if (!student?.classId) {
    throw new AppError("You are not enrolled in a class", 403);
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
  });
  if (!assignment) throw new AppError("Assignment not found", 404);

  // Mirror the visibility rule from listAssignments. A student must
  // not be able to submit to an assignment they cannot see.
  if (assignment.classId !== student.classId) {
    throw new AppError("Assignment not available to your class", 403);
  }
  if (assignment.batchId !== null && assignment.batchId !== student.batchId) {
    throw new AppError("Assignment not available to your batch", 403);
  }

  // Reject double-submission. A new row is allowed only if there is
  // no prior submission, or the most recent one was RETURNED.
  const latest = await prisma.submission.findFirst({
    where: { assignmentId, studentId: req.user.id },
    orderBy: { submittedAt: "desc" },
  });
  if (latest && latest.status !== "RETURNED") {
    throw new AppError("You have already submitted this assignment", 409);
  }

  const created = await prisma.submission.create({
    data: {
      assignmentId,
      studentId: req.user.id,
      studentPdfUrl,
      // Server-forced. A student opening devtools cannot set any of these.
      status: "SUBMITTED",
      submittedAt: new Date(),
      grade: null,
      feedback: null,
      teacherPdfUrl: null,
      gradedAt: null,
    },
  });

  res.status(201).json(serializeSubmission(created));
};

export const updateSubmission: RequestHandler<{ id: string }> = async (
  req,
  res,
) => {
  const { id } = req.params;
  const body = req.body as UpdateSubmissionInput;

  const existing = await prisma.submission.findUnique({ where: { id } });
  if (!existing) throw new AppError("Submission not found", 404);

  // RETURNED means "waiting for the student." There is nothing to
  // grade until they resubmit as a new SUBMITTED row.
  if (existing.status === "RETURNED") {
    throw new AppError(
      "Cannot update a returned submission; wait for the student to resubmit",
      409,
    );
  }

  // Discriminated union narrows body on status.
  if (body.status === "graded") {
    const updated = await prisma.submission.update({
      where: { id },
      data: {
        status: "GRADED",
        grade: body.grade,
        feedback: body.feedback ?? null,
        teacherPdfUrl: body.teacherPdfUrl ?? null,
        // Server-forced. The client sends gradedAt today; strictObject
        // rejects it, and this line replaces it with the true time.
        gradedAt: new Date(),
      },
    });
    res.status(200).json(serializeSubmission(updated));
    return;
  }

  // body.status === "returned"
  const updated = await prisma.submission.update({
    where: { id },
    data: {
      status: "RETURNED",
      feedback: body.feedback ?? null,
      // Returning means "not yet graded". Clear the previous attempt's
      // grading so the resubmit starts from a clean slate.
      grade: null,
      teacherPdfUrl: null,
      gradedAt: null,
    },
  });
  res.status(200).json(serializeSubmission(updated));
};
