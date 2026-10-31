import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/AppError.js";
import { signToken } from "../lib/jwt.js";
import { serializeUser } from "../lib/users.js";
import type { RegisterInput } from "./auth.schemas.js";

const SALT_ROUNDS = 10;

export const register: RequestHandler = async (req, res) => {
  // validateBody has already run. The cast is honest: Zod proved
  // the shape at runtime, and the type comes from the same schema.
  const { email, password, name, classId, batchId } = req.body as RegisterInput;

  // Reject duplicate email BEFORE hashing. bcrypt is ~100ms of CPU;
  // no reason to pay it for a request that will 409 anyway.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("Email already registered", 409);
  }

  // Reject unknown foreign keys with 404, not a Prisma FK violation
  // surfacing as a 500.
  if (classId) {
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new AppError("Class not found", 404);
  }

  if (batchId) {
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new AppError("Batch not found", 404);

    // A batch belongs to exactly one class. Reject a request where
    // classId and batchId disagree — the UI filters batches by class,
    // but the API must not trust the UI.
    if (classId && batch.classId !== classId) {
      throw new AppError("Batch does not belong to the given class", 400);
    }
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      // Hardcoded. The role is not user-controllable. If a client
      // sends `role`, the strict schema rejected the request before
      // this line ran. This is the design: registration is for
      // students only. The teacher exists via the seed script.
      role: "STUDENT",
      classId: classId ?? null,
      batchId: batchId ?? null,
    },
  });

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.status(201).json({ token, user: serializeUser(user) });
};

export const login: RequestHandler = async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await prisma.user.findUnique({ where: { email } });

  // Both failure paths return the SAME message. Account enumeration:
  // an attacker cannot tell from the response whether the email
  // exists. This matters more now that the teacher is a single,
  // high-value account.
  if (!user || !user.password) {
    throw new AppError("Invalid email or password", 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    throw new AppError("Invalid email or password", 401);
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.status(200).json({ token, user: serializeUser(user) });
};

export const me: RequestHandler = async (req, res) => {
  // Explicit guard rather than req.user!. The non-null assertion
  // would compile but would crash if `authenticate` is ever removed
  // from the route. The guard makes this handler correct in isolation.
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    throw new AppError("User not found", 404);
  }

  res.status(200).json({ user: serializeUser(user) });
};
