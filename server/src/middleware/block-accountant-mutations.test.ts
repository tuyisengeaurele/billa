import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { blockAccountantMutations } from "./block-accountant-mutations.js";
import { prisma } from "../lib/prisma.js";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    businessMember: { findUnique: vi.fn() },
  },
}));

function makeReqRes(method: string, userId = "u1", businessId = "b1") {
  const req = { method, auth: { userId, businessId } } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe("blockAccountantMutations", () => {
  it("always allows GET requests without querying the database", async () => {
    const { req, res, next } = makeReqRes("GET");
    await blockAccountantMutations(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(prisma.business.findUnique).not.toHaveBeenCalled();
  });

  it("allows the business owner to mutate", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ ownerId: "u1" } as never);
    const { req, res, next } = makeReqRes("POST");
    await blockAccountantMutations(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows a regular member to mutate", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ ownerId: "someone-else" } as never);
    vi.mocked(prisma.businessMember.findUnique).mockResolvedValue({ role: "MEMBER" } as never);
    const { req, res, next } = makeReqRes("POST");
    await blockAccountantMutations(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("blocks an accountant from mutating with 403", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ ownerId: "someone-else" } as never);
    vi.mocked(prisma.businessMember.findUnique).mockResolvedValue({ role: "ACCOUNTANT" } as never);
    const { req, res, next } = makeReqRes("POST");
    await blockAccountantMutations(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "read_only_role" });
  });

  it("blocks an accountant on PATCH, PUT, and DELETE too", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ ownerId: "someone-else" } as never);
    vi.mocked(prisma.businessMember.findUnique).mockResolvedValue({ role: "ACCOUNTANT" } as never);
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      const { req, res, next } = makeReqRes(method);
      await blockAccountantMutations(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });
});
