import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeUser } from "../lib/users.js";
import { AppError } from "../errors/AppError.js";
import type { DbRole } from "../types/auth.js";

export const listUsers: RequestHandler = async (req, res) => {
  // Optional ?role=student|teacher filter.
  // Express types query values as `string | string[] | ParsedQs | ...`,
  // so `typeof === "string"` narrows to the only case we accept.
  const roleParam = req.query["role"];
  const roleRaw = typeof roleParam === "string" ? roleParam : undefined;

  // Map the API's lowercase value to the DB enum. Anything else is a
  // client bug — reject rather than silently returning every user,
  // which would be a data-leak-via-typo.
  let role: DbRole | undefined = undefined;
  if (roleRaw === "student") role = "STUDENT";
  else if (roleRaw === "teacher") role = "TEACHER";
  else if (roleRaw !== undefined) {
    throw new AppError("Invalid role filter", 400);
  }

  const users = await prisma.user.findMany({
    where: role ? { role } : undefined,
    orderBy: { name: "asc" },
  });

  // Bare array, matching json-server's shape. serializeUser is the
  // only place DB role becomes API role — password never appears.
  res.status(200).json(users.map(serializeUser));
};
