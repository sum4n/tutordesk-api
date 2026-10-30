import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";
import { verifyToken } from "../lib/jwt.js";

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;

  // Header is `string | undefined`. The ?. handles "missing" and
  // the startsWith handles "present but wrong scheme" in one guard.
  if (!header?.startsWith("Bearer ")) {
    next(new AppError("Missing or malformed Authorization header", 401));
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyToken(token);

    // DB-cased role, matching what authorization checks compare against.
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    // Deliberately not bound: the caught value is a JsonWebTokenError
    // or ZodError. Neither should reach the client, and the fixed
    // message avoids disclosing whether it was signature, expiry, or shape.
    next(new AppError("Invalid or expired token", 401));
  }
};
