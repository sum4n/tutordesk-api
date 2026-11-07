import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/AppError.js";
import type { CreateClassInput, UpdateClassInput } from "./classes.schemas.js";

// Bare array, matching json-server's shape. Every consumer does
// `const classes: Class[] = await res.json()`.
export const listClasses: RequestHandler = async (_req, res) => {
  const classes = await prisma.class.findMany({
    orderBy: { name: "asc" },
  });
  res.status(200).json(classes);
};

export const createClass: RequestHandler = async (req, res) => {
  // validateBody has run: req.body is CreateClassInput at runtime.
  const { name, description } = req.body as CreateClassInput;

  const created = await prisma.class.create({
    data: {
      name,
      // description is optional in the schema; DB column is nullable.
      description: description ?? null,
    },
  });

  res.status(201).json(created);
};

export const updateClass: RequestHandler<{ id: string }> = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body as UpdateClassInput;

  // findUnique first, so a missing class is a 404, not a Prisma
  // P2025 surfacing as a 500.
  const existing = await prisma.class.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Class not found", 404);
  }

  // Build the update payload only from supplied fields.
  // Passing `undefined` to Prisma means "do not update this field",
  // which is exactly the PATCH semantics.
  const updated = await prisma.class.update({
    where: { id },
    data: {
      name,
      description,
    },
  });

  res.status(200).json(updated);
};

export const deleteClass: RequestHandler<{ id: string }> = async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.class.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Class not found", 404);
  }

  // Cascade per schema: batches, assignments, submissions deleted.
  // Users' classId/batchId set to null (SetNull).
  await prisma.class.delete({ where: { id } });

  // 204 No Content is the correct response for a successful delete.
  // The frontend's `api.delete` returns the Response; it does not
  // call .json(), so a body is unnecessary.
  res.status(204).end();
};
