import type { AuthUser } from "./auth.ts";

// Extend Express's global Request type so `req.user` is recognized
// by the compiler in every handler. TypeScript MERGES this with
// Express's existing Request interface rather than replacing it.
declare global {
  namespace Express {
    interface Request {
      // Optional: a request that never passed through `authenticate`
      // has no user. Required would be a lie the compiler accepts.
      user?: AuthUser;
    }
  }
}

export {};
