import express from "express";
import cors from "cors";
import helmet from "helmet";

export const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check route
app.use("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
