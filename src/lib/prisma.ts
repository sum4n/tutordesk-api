import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });

// Singleton guard. In development, `tsx watch` reloads the module on
// every save; without this, each reload constructs a new PrismaClient
// and a new pg connection pool, and the old pools are only reclaimed
// on process exit. Postgres's default max_connections is 100, so a
// long session with frequent saves eventually fails with
// "too many clients already" — an error that looks like a code bug.
//
// In production, NODE_ENV is "production" and the guard is skipped:
// the process starts once, so a fresh client is correct and there is
// nothing to reuse.
type PrismaGlobal = {
  prisma?: PrismaClient;
};

const globalForPrisma = globalThis as unknown as PrismaGlobal;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
