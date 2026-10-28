import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";

export const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check route
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use(errorHandler);
