import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { createUserSchema, updateUserSchema } from "./users.schemas.js";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from "./users.controller.js";

export const userRouter = Router();

// All user management is teacher-only. A student must never be able
// to enumerate, create, edit, or delete other accounts.
userRouter.get("/", authenticate, requireRole("TEACHER"), listUsers);
userRouter.post(
  "/",
  authenticate,
  requireRole("TEACHER"),
  validateBody(createUserSchema),
  createUser,
);
userRouter.patch(
  "/:id",
  authenticate,
  requireRole("TEACHER"),
  validateBody(updateUserSchema),
  updateUser,
);
userRouter.delete("/:id", authenticate, requireRole("TEACHER"), deleteUser);
