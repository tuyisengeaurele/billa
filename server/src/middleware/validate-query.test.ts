import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { validateQuery } from "./validate-query.js";

describe("validateQuery", () => {
  it("attaches the parsed, defaulted query to req.listQuery", async () => {
    const schema = z.object({ page: z.coerce.number().optional().default(1) });
    const app = express();
    app.get("/probe", validateQuery(schema), (req, res) => res.json({ listQuery: req.listQuery }));

    const res = await request(app).get("/probe");
    expect(res.body.listQuery).toEqual({ page: 1 });
  });

  it("rejects an invalid query with 400", async () => {
    const schema = z.object({ sortBy: z.enum(["name"]) });
    const app = express();
    app.get("/probe", validateQuery(schema), (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/probe?sortBy=banana");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_query");
  });
});
