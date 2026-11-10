import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  createSubjectSchema,
  updateSubjectSchema,
} from "./subjects.schemas.js";
import {
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
} from "./subjects.controller.js";

export const subjectRouter = Router();

// Read is public (Path 2, until Google OAuth removes signup dropdowns).
// Writes: authenticate → authorize → validate → handle.
subjectRouter.get("/", listSubjects);

subjectRouter.post(
  "/",
  authenticate,
  requireRole("TEACHER"),
  validateBody(createSubjectSchema),
  createSubject,
);

subjectRouter.patch(
  "/:id",
  authenticate,
  requireRole("TEACHER"),
  validateBody(updateSubjectSchema),
  updateSubject,
);

subjectRouter.delete(
  "/:id",
  authenticate,
  requireRole("TEACHER"),
  deleteSubject,
);
