import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { listUsers } from "./users.controller.js";

export const userRouter = Router();

userRouter.get("/", authenticate, requireRole("TEACHER"), listUsers);
