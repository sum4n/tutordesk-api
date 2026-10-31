import { z } from "zod";

// Normalize BEFORE validating. Zod runs checks in declaration order.
const emailField = z.string().trim().toLowerCase().pipe(z.email());

// Strict: unknown keys are a 400, not silently stripped.
// Critical here because we want to REJECT `role: "teacher"` from a
// malicious client, not accept the request and quietly ignore the
// attempt. Silent stripping hides contract drift from the frontend.
export const registerSchema = z.strictObject({
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(1, "Name is required"),
  classId: z.string().nullable().optional(),
  batchId: z.string().nullable().optional(),
});

// Login is not strict: it doesn't matter if the client sends extra
// fields, and being permissive on login avoids breaking old clients.
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
