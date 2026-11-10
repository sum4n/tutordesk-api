import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { clearDatabase } from "./helpers.js";

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /subjects", () => {
  it("returns a bare array sorted by name", async () => {
    await prisma.subject.createMany({
      data: [{ name: "Physics" }, { name: "Chemistry" }],
    });

    const res = await request(app).get("/subjects");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe("Chemistry");
    expect(res.body[1].name).toBe("Physics");
  });

  it("returns empty array when there are no subjects", async () => {
    const res = await request(app).get("/subjects");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
