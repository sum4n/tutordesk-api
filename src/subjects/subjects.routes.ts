import { Router } from "express";
import { listSubjects } from "./subjects.controller.js";

export const subjectsRouter = Router();

subjectsRouter.get("/", listSubjects);
