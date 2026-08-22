import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";

beforeEach(resetDb);

describe("POST /contact", () => {
  it("stores a valid message without requiring a session", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/contact")
      .send({ name: "Aline", email: "aline@example.com", message: "I'd like help setting up my templates." });

    expect(res.status).toBe(201);

    const stored = await prisma.contactMessage.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      name: "Aline",
      email: "aline@example.com",
      message: "I'd like help setting up my templates.",
    });
  });

  it("returns 400 for an invalid submission", async () => {
    const app = createApp();

    const res = await request(app).post("/contact").send({ name: "", email: "not-an-email", message: "hi" });

    expect(res.status).toBe(400);

    const stored = await prisma.contactMessage.findMany();
    expect(stored).toHaveLength(0);
  });
});
