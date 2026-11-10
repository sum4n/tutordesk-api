import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";

// Bare array, sorted by name. Subjects are shared across all classes
// and are read by teacher and student hooks alike.
export const listSubjects: RequestHandler = async (_req, res) => {
  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
  });

  res.status(200).json(subjects);
};
