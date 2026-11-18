import { z } from "zod";

// strictObject: `createdAt` from the client is a 400, not silently
// ignored. The DB owns createdAt via @default(now()).
//
// dueDate arrives as "2026-10-23" from <input type="date">.
// z.coerce.date() parses it. Prisma accepts the resulting Date.
export const createAssignmentSchema = z.strictObject({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  pdfUrl: z.string().trim().min(1, "PDF URL is required"),
  classId: z.string().min(1, "Class is required"),
  batchId: z.string().nullable().optional(),
  subjectId: z.string().min(1, "Subject is required"),
  dueDate: z.coerce.date(),
});

// All fields optional (PATCH semantics).
// batchId: string | null | undefined — three states, three meanings.
// `z.string().optional()` alone would reject null, making "move back
// to class-wide" impossible.
export const updateAssignmentSchema = z.strictObject({
  title: z.string().trim().min(1, "Title is required").optional(),
  description: z.string().trim().optional(),
  pdfUrl: z.string().trim().min(1, "PDF URL is required").optional(),
  classId: z.string().min(1).optional(),
  batchId: z.string().nullable().optional(),
  subjectId: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
