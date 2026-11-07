import { z } from "zod";

export const createBatchSchema = z.strictObject({
  name: z.string().trim().min(1, "Name is required"),
  classId: z.string().min(1, "Class is required"),
  schedule: z.string().trim().optional(),
});

// No classId on update. A batch moving between classes would orphan
// its assignments and students. If that becomes a requirement, it is
// a separate, deliberate operation — not a PATCH field.
export const updateBatchSchema = z.strictObject({
  name: z.string().trim().min(1, "Name is required").optional(),
  schedule: z.string().trim().optional(),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
