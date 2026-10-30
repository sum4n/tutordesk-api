import "dotenv/config";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { z } from "zod";
import type { AuthUser } from "../types/auth.js";

// Read the secret once at startup. Missing secret = crash on boot,
// not a 500 on the first login.
function loadJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT SECRET is not set");
  }
  return secret;
}

const jwtSecret = loadJwtSecret();

// A string literal is checked by TypeScript against jsonwebtoken's
// accepted format. A cast would not be checked.
const tokenLifetime: SignOptions["expiresIn"] = "7d";

// Full shape of the token payload, INCLUDING the fields jsonwebtoken
// adds automatically (iat, exp). Declaring them here means the parsed
// result needs no cast and no intersection type.
const jwtPayloadSchema = z.object({
  sub: z.string(), // JWT spec name for "subject" (the user ID)
  email: z.string(),
  role: z.enum(["TEACHER", "STUDENT"]),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

// Derive the TypeScript type FROM the schema. One source of truth:
// change the schema, the type follows. No hand-written duplicate.
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    jwtSecret,
    { expiresIn: tokenLifetime },
  );
}

export function verifyToken(token: string): JwtPayload {
  const decodedPayload = jwt.verify(token, jwtSecret);

  // jwt.verify returns a string if the token was signed over a plain
  // string. We only sign objects, so a string means a malformed token.
  if (typeof decodedPayload === "string") {
    throw new Error("Unexpected JWT payload");
  }

  // parse() validates the shape at runtime AND returns the typed value.
  // No cast: the schema already describes the complete shape.
  return jwtPayloadSchema.parse(decodedPayload);
}
