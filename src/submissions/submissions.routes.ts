import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  createSubmissionSchema,
  updateSubmissionSchema,
} from "./submissions.schemas.js";
import {
  listSubmissions,
  createSubmission,
  updateSubmission,
} from "./submissions.controller.js";

export const submissionRouter = Router();

// GET is role-branched inside the controller.
submissionRouter.get("/", authenticate, listSubmissions);

// POST is student-only — teachers do not submit work.
submissionRouter.post(
  "/",
  authenticate,
  requireRole("STUDENT"),
  validateBody(createSubmissionSchema),
  createSubmission,
);

// PATCH is teacher-only — students resubmit by POSTing a new row,
// which preserves the returned row in history.
submissionRouter.patch(
  "/:id",
  authenticate,
  requireRole("TEACHER"),
  validateBody(updateSubmissionSchema),
  updateSubmission,
);
