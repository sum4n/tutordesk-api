import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/AppError.js";
import { isForeignKeyConstraintError } from "../lib/prismaErrors.js";
import type {
  CreateSubjectInput,
  UpdateSubjectInput,
} from "./subjects.schemas.js";

// Bare array, sorted by name. Subjects are shared across all classes
// and are read by teacher and student hooks alike.
export const listSubjects: RequestHandler = async (_req, res) => {
  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
  });

  res.status(200).json(subjects);
};

export const createSubject: RequestHandler = async (req, res) => {
  const { name, description } = req.body as CreateSubjectInput;

  const created = await prisma.subject.create({
    data: { name, description: description ?? null },
  });

  res.status(201).json(created);
};

export const updateSubject: RequestHandler<{ id: string }> = async (
  req,
  res,
) => {
  const { id } = req.params;
  const { name, description } = req.body as UpdateSubjectInput;

  // findUnique first so a missing subject is 404, not a Prisma
  // P2025 surfacing as 500
  const existing = await prisma.subject.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Subject not found", 404);
  }

  const updated = await prisma.subject.update({
    where: { id },
    data: { name, description },
  });

  res.status(200).json(updated);
};

export const deleteSubject: RequestHandler<{ id: string }> = async (
  req,
  res,
) => {
  const { id } = req.params;

  const existing = await prisma.subject.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Subject not found", 404);
  }

  try {
    await prisma.subject.delete({ where: { id } });
  } catch (error) {
    // Assignment.subject is Restrict (no onDelete in schema).
    // Deleting a referenced subject raises P2003; translate it to a
    // 409 with a message the UI can show. Without this, it reaches
    // the catch-all and surfaces as 500 "Internal server error".
    if (isForeignKeyConstraintError(error)) {
      throw new AppError(
        "Can not delete subject: assignments still reference it",
        409,
      );
    }
    throw error;
  }
  res.status(204).end();
};
