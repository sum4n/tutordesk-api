import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { createClassSchema, updateClassSchema } from "./classes.schemas.js";
import {
  listClasses,
  createClass,
  updateClass,
  deleteClass,
} from "./classes.controller.js";

export const classRouter = Router();

// Order for writes: authenticate → authorize → validate → handle.
// Auth before validation: a student sending garbage should get 403,
// not a payload-shape hint about a route they cannot use.
classRouter.get("/", listClasses);
classRouter.post(
  "/",
  authenticate,
  requireRole("TEACHER"),
  validateBody(createClassSchema),
  createClass,
);
classRouter.patch(
  "/:id",
  authenticate,
  requireRole("TEACHER"),
  validateBody(updateClassSchema),
  updateClass,
);
classRouter.delete("/:id", authenticate, requireRole("TEACHER"), deleteClass);
