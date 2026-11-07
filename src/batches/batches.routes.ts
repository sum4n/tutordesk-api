import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { createBatchSchema, updateBatchSchema } from "./batches.schemas.js";
import {
  listBatches,
  createBatch,
  updateBatch,
  deleteBatch,
} from "./batches.controller.js";

export const batchRouter = Router();

batchRouter.get("/", listBatches);
batchRouter.post(
  "/",
  authenticate,
  requireRole("TEACHER"),
  validateBody(createBatchSchema),
  createBatch,
);
batchRouter.patch(
  "/:id",
  authenticate,
  requireRole("TEACHER"),
  validateBody(updateBatchSchema),
  updateBatch,
);
batchRouter.delete("/:id", authenticate, requireRole("TEACHER"), deleteBatch);
