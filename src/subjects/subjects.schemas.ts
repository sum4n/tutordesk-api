import { z } from "zod";

// strictObject: unknown keys are a 400, not silently stripped.
// Matches the auth and classes schemas so frontend/backend drift
// surfaces immediately rather than silently.
export const createSubjectSchema = z.strictObject({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
});

export const updateSubjectSchema = z.strictObject({
  name: z.string().trim().min(1, "Name is required").optional(),
  description: z.string().trim().optional(),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
