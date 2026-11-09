import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./auth/auth.routes.js";
import { classRouter } from "./classes/classes.routes.js";
import { batchRouter } from "./batches/batches.routes.js";
import { userRouter } from "./users/users.routes.js";

export const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check route
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/auth", authRouter);

app.use("/classes", classRouter);
app.use("/batches", batchRouter);

app.use("/users", userRouter);

app.use(errorHandler);
