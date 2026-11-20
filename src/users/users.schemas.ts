import { z } from "zod";
import { emailField } from "../auth/auth.schemas.js";

// strictObject, and no `role` field. This endpoint creates STUDENTS
// only — there is one teacher, seeded. The frontend currently sends
// `role: "student"`; that becomes a 400 here and is removed in the
// frontend swap. Consistent with registerSchema.
export const createUserSchema = z.strictObject({
  name: z.string().trim().min(1, "Name is required"),
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters"),
  classId: z.string().nullable().optional(),
  batchId: z.string().nullable().optional(),
});

// No password, no role. Password changes need a separate reset flow
// (verify old password or send a reset link) — not a PATCH field.
//
// classId/batchId: three states. Omitted = leave unchanged.
// null = unassign. string = assign. Same pattern as Assignment.batchId.
export const updateUserSchema = z.strictObject({
  name: z.string().trim().min(1, "Name is required").optional(),
  email: emailField.optional(),
  classId: z.string().nullable().optional(),
  batchId: z.string().nullable().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
