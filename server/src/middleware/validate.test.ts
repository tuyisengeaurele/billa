import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { validateBody } from "./validate.js";

const schema = z.object({ name: z.string().min(1) });

function testApp() {
  const app = express();
  app.use(express.json());
  app.post("/probe", validateBody(schema), (req, res) => res.json({ received: req.body }));
  return app;
}

describe("validateBody", () => {
  it("passes valid bodies through", async () => {
    const res = await request(testApp()).post("/probe").send({ name: "Kigali Traders" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: { name: "Kigali Traders" } });
  });

  it("rejects invalid bodies with 400", async () => {
    const res = await request(testApp()).post("/probe").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_body");
  });
});
