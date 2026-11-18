import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  createAssignmentSchema,
  updateAssignmentSchema,
} from "./assignments.schemas.js";
import {
  listAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} from "./assignments.controller.js";

export const assignmentRouter = Router();

// GET is role-branched inside the controller (teacher sees all,
// student sees only their class/batch). Writes are teacher-only.
assignmentRouter.get("/", authenticate, listAssignments);
assignmentRouter.post(
  "/",
  authenticate,
  requireRole("TEACHER"),
  validateBody(createAssignmentSchema),
  createAssignment,
);
assignmentRouter.patch(
  "/:id",
  authenticate,
  requireRole("TEACHER"),
  validateBody(updateAssignmentSchema),
  updateAssignment,
);
assignmentRouter.delete(
  "/:id",
  authenticate,
  requireRole("TEACHER"),
  deleteAssignment,
);
