import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeUser } from "../lib/users.js";
import { AppError } from "../errors/AppError.js";
import type { DbRole } from "../types/auth.js";
import bcrypt from "bcryptjs";
import { isUniqueConstraintError } from "../lib/prismaErrors.js";
import type { CreateUserInput, UpdateUserInput } from "./users.schemas.js";

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

const SALT_ROUNDS = 10;

export const createUser: RequestHandler = async (req, res) => {
  const { name, email, password, classId, batchId } =
    req.body as CreateUserInput;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("Email already registered", 409);
  }

  if (classId) {
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new AppError("Class not found", 404);
  }

  if (batchId) {
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new AppError("Batch not found", 404);

    // A batch belongs to exactly one class. A user with classId c1
    // and a batch from c2 is an invalid state the DB cannot detect.
    if (classId && batch.classId !== classId) {
      throw new AppError("Batch does not belong to the given class", 400);
    }
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const created = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "STUDENT", // hardcoded; not client-controllable
        classId: classId ?? null,
        batchId: batchId ?? null,
      },
    });
    res.status(201).json(serializeUser(created));
  } catch (error) {
    // Covers a race between the findUnique above and the create.
    if (isUniqueConstraintError(error)) {
      throw new AppError("Email already registered", 409);
    }
    throw error;
  }
};

export const updateUser: RequestHandler<{ id: string }> = async (req, res) => {
  const { id } = req.params;
  const { name, email, classId, batchId } = req.body as UpdateUserInput;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new AppError("User not found", 404);

  if (classId !== undefined && classId !== null) {
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new AppError("Class not found", 404);
  }

  if (batchId !== undefined && batchId !== null) {
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new AppError("Batch not found", 404);
  }

  // Validate the RESULT, not just the input. A PATCH that changes only
  // classId can orphan the existing batchId, and vice versa.
  const effectiveClassId = classId !== undefined ? classId : existing.classId;
  const effectiveBatchId = batchId !== undefined ? batchId : existing.batchId;

  if (effectiveBatchId !== null) {
    const batch = await prisma.batch.findUnique({
      where: { id: effectiveBatchId },
    });
    if (batch && effectiveClassId && batch.classId !== effectiveClassId) {
      throw new AppError("Batch does not belong to the given class", 400);
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        classId,
        batchId,
      },
    });
    res.status(200).json(serializeUser(updated));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError("Email already registered", 409);
    }
    throw error;
  }
};

export const deleteUser: RequestHandler<{ id: string }> = async (req, res) => {
  const { id } = req.params;

  // Guard: the one teacher deleting her own account locks the system
  // permanently. Nobody else can create a teacher.
  if (req.user && id === req.user.id) {
    throw new AppError("You cannot delete your own account", 403);
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new AppError("User not found", 404);

  // Submission.student is Cascade. Every submission this student made
  // is destroyed. The delete dialog must warn the teacher.
  await prisma.user.delete({ where: { id } });

  res.status(204).end();
};
