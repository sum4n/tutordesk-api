import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

const TEACHER_EMAIL = process.env.TEACHER_EMAIL;
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD;
const TEACHER_NAME = process.env.TEACHER_NAME ?? "Teacher";

if (!TEACHER_EMAIL || !TEACHER_PASSWORD) {
  throw new Error("TEACHER_EMAIL and TEACHER_PASSWORD must be set");
}

async function seedTeacher(): Promise<void> {
  // Takeover guard: if someone has already registered with the
  // teacher's email as a student, we MUST NOT silently promote them.
  // The seed would upsert the role to TEACHER and hand the attacker
  // full access. Fail loudly instead — the operator decides what to do.
  const existing = await prisma.user.findUnique({
    where: { email: TEACHER_EMAIL },
  });

  if (existing && existing.role !== "TEACHER") {
    throw new Error(
      `A non-teacher user already exists with email ${TEACHER_EMAIL} ` +
        `(role: ${existing.role}). Refusing to promote. ` +
        `Delete or rename that user, then re-run the seed.`,
    );
  }

  const hashedPassword = await bcrypt.hash(TEACHER_PASSWORD, 10);

  // Idempotent: re-running rotates the password and refresh name.
  // Safe because the takeover guard above has already run.
  const teacher = await prisma.user.upsert({
    where: { email: TEACHER_EMAIL },
    update: {
      password: hashedPassword,
      name: TEACHER_NAME,
      role: "TEACHER",
    },
    create: {
      email: TEACHER_EMAIL,
      password: hashedPassword,
      name: TEACHER_NAME,
      role: "TEACHER",
    },
  });

  console.log(`Teacher ready: ${teacher.email}`);
}

seedTeacher()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
