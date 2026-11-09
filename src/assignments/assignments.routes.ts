import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { listAssignments } from "./assignments.controller.js";

export const assignmentRouter = Router();

// Auth-required but role-open: the controller branches on role
// internally, because both teacher and student use the same path
// with different scoping. requireRole would be wrong here
assignmentRouter.get("/", authenticate, listAssignments);
