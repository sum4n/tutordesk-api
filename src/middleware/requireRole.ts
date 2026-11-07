import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";

// Guard for routes that require a specific role.
// 401 = no valid token (authenticate already ran and set req.user).
// 403 = valid token, wrong role. The distinction matters: the client
// can act on 401 (re-login) but not on 403 (permission is fixed).
export function requireRole(role: "TEACHER" | "STUDENT"): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new AppError("Unauthorized", 401));
      return;
    }
    if (req.user.role !== role) {
      next(new AppError("Forbidden", 403));
      return;
    }
    next();
  };
}
