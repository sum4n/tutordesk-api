import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { authenticate } from "../middleware/authenticate.js";
import { registerSchema, loginSchema } from "./auth.schemas.js";
import { register, login, me } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), register);
authRouter.post("/login", validateBody(loginSchema), login);
authRouter.get("/me", authenticate, me);
