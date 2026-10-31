import type { User } from "../generated/prisma/client.js";
import type { ApiRole, SerializedUser } from "../types/auth.js";

// The only place in the codebase where a DB role becomes an API role.
// Every user-related response passes through here. Strips password,
// createdAt, updatedAt — allowlist, not denylist.
export function serializeUser(user: User): SerializedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.toLowerCase() as ApiRole,
    classId: user.classId,
    batchId: user.batchId,
  };
}
