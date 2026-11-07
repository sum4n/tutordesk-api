import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/AppError.js";
import type { CreateBatchInput, UpdateBatchInput } from "./batches.schemas.js";

// Optional ?classId= filter. Frontend uses it in useBatches, and calls
// the unfiltered list elsewhere. typeof check because req.query values
// are `string | string[] | ParsedQs | ParsedQs[] | undefined`.
export const listBatches: RequestHandler = async (req, res) => {
  const classIdParam = req.query["classId"];
  const classId = typeof classIdParam === "string" ? classIdParam : undefined;

  const batches = await prisma.batch.findMany({
    where: classId ? { classId } : undefined,
    orderBy: { name: "asc" },
  });

  res.status(200).json(batches);
};

export const createBatch: RequestHandler = async (req, res) => {
  const { name, classId, schedule } = req.body as CreateBatchInput;

  // Reject unknown classId with 404 — otherwise Prisma throws a
  // foreign-key violation that surfaces as a 500.
  const parentClass = await prisma.class.findUnique({ where: { id: classId } });
  if (!parentClass) {
    throw new AppError("Class not found", 404);
  }

  const created = await prisma.batch.create({
    data: {
      name,
      classId,
      schedule: schedule ?? null,
    },
  });

  res.status(201).json(created);
};

export const updateBatch: RequestHandler<{ id: string }> = async (req, res) => {
  const { id } = req.params;
  const { name, schedule } = req.body as UpdateBatchInput;

  const existing = await prisma.batch.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Batch not found", 404);
  }

  const updated = await prisma.batch.update({
    where: { id },
    data: { name, schedule },
  });

  res.status(200).json(updated);
};

export const deleteBatch: RequestHandler<{ id: string }> = async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.batch.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Batch not found", 404);
  }

  // Note: Assignment.batch is `onDelete: SetNull` — assignments tied
  // to this batch survive as class-wide assignments (batchId = null).
  // That is deliberate: the work does not disappear when the group
  // is dissolved. Students' batchId is also SetNull.
  await prisma.batch.delete({ where: { id } });

  res.status(204).end();
};
