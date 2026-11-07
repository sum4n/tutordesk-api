import { z } from "zod";

// z.strictObject: unknown keys are a 400, not silently stripped.
// Matches the auth schemas, and makes frontend/backend drift visible
// the moment it happens.
export const createClassSchema = z.strictObject({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
});

export const updateClassSchema = z.strictObject({
  name: z.string().trim().min(1, "Name is required").optional(),
  description: z.string().trim().optional(),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
