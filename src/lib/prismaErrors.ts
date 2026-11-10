import { Prisma } from "../generated/prisma/client.js";

// P2002 = unique constraint violation.
// Prisma throws this as a PrismaClientKnownRequestError, which is
// neither a ZodError nor an AppError — without this check it reaches
// the error handler's catch-all and surfaces as a 500.
//
// `meta.target` names the colliding field(s), but its shape varies by
// database and Prisma version. Callers supply their own message.
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

// P2003 = foreign key constraint violated on delete/update.
// Raised when a row cannot be deleted because another table still
// references it, and the relation is Restrict or NoAction.
// Deleting a subject that assignments point at lands here.
export function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}
