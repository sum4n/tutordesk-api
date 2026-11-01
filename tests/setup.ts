// Runs before every test file. Points Prisma at the test database
// by setting DATABASE_URL before src/lib/prisma.ts is evaluated.
//
// dotenv does NOT override variables that are already set, so when
// src/lib/prisma.ts later imports "dotenv/config" and loads .env,
// the test database URL survives.
import { config } from "dotenv";

config({ path: ".env.test" });
