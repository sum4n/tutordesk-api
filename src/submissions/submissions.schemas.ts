import { z } from "zod";

// strictObject: the client sends status, submittedAt, grade, feedback,
// teacherPdfUrl, gradedAt on POST. Every one of them is a 400 here.
// The server owns all of those fields; accepting them silently would
// let a student self-grade by opening devtools.
export const createSubmissionSchema = z.strictObject({
  assignmentId: z.string().min(1, "Assignment is required"),
  studentPdfUrl: z.string().trim().min(1, "Submission file is required"),
});

// Discriminated union on `status`. A teacher either grades or returns;
// there is no third operation, and no field is valid in both branches.
// strictObject rejects `gradedAt` from the client — the server sets it.
export const updateSubmissionSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("graded"),
    grade: z.string().trim().min(1, "Grade is required"),
    feedback: z.string().trim().nullable().optional(),
    teacherPdfUrl: z.string().trim().nullable().optional(),
  }),
  z.strictObject({
    status: z.literal("returned"),
    feedback: z.string().trim().nullable().optional(),
  }),
]);

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
export type UpdateSubmissionInput = z.infer<typeof updateSubmissionSchema>;
