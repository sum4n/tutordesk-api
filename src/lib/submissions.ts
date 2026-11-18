import type { Submission } from "../generated/prisma/client.js";

// API status is lowercase; DB status is SCREAMING_SNAKE (Option A).
// Every submission response goes through serializeSubmission, so the
// conversion happens in exactly one place. The frontend compares
// against "submitted" | "graded" | "returned" throughout.
export type ApiSubmissionStatus = "submitted" | "graded" | "returned";

export interface SerializedSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  status: ApiSubmissionStatus;
  studentPdfUrl: string | null;
  teacherPdfUrl: string | null;
  grade: string | null;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
}

export function serializeSubmission(s: Submission): SerializedSubmission {
  return {
    id: s.id,
    assignmentId: s.assignmentId,
    studentId: s.studentId,
    status: s.status.toLowerCase() as ApiSubmissionStatus,
    studentPdfUrl: s.studentPdfUrl,
    teacherPdfUrl: s.teacherPdfUrl,
    grade: s.grade,
    feedback: s.feedback,
    // Explicit ISO conversion: Date objects serialise correctly via
    // JSON.stringify, but the interface says `string`, and matching
    // the interface at the boundary is what keeps callers honest.
    submittedAt: s.submittedAt.toISOString(),
    gradedAt: s.gradedAt?.toISOString() ?? null,
  };
}
