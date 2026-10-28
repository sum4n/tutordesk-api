import type { RequestHandler } from "express";
import type { ZodType } from "zod";

export const validateBody =
  <T extends ZodType>(schema: T): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
