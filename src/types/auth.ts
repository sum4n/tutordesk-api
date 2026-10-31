import type { UserRole } from "../generated/prisma/enums.js";

// What the database and JWT use. Derived from Prisma's generated enum,
// so it stays in sync with schema.prisma
export type DbRole = UserRole;

// What the HTTP API returns. Lowercase is the contract the frontend reads
export type ApiRole = "teacher" | "student";

// What `authenticate` puts on req.user. DB-cased role, no password.
export interface AuthUser {
  id: string;
  email: string;
  role: DbRole;
}

// What every user-related endpoint returns. No password, no timestamps.
export interface SerializedUser {
  id: string;
  email: string;
  name: string;
  role: ApiRole;
  classId: string | null;
  batchId: string | null;
}
