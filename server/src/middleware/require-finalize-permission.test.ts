import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { requireFinalizePermission } from "./require-finalize-permission.js";
import { prisma } from "../lib/prisma.js";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
  },
}));

function makeReqRes(userId = "u1", businessId = "b1") {
  const req = { auth: { userId, businessId } } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe("requireFinalizePermission", () => {
  it("allows finalizing when the business doesn't require approval", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      ownerId: "owner1",
      requireApprovalToFinalize: false,
    } as never);
    const { req, res, next } = makeReqRes("u1");

    await requireFinalizePermission(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("allows the owner to finalize even when approval is required", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      ownerId: "u1",
      requireApprovalToFinalize: true,
    } as never);
    const { req, res, next } = makeReqRes("u1");

    await requireFinalizePermission(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("blocks a non-owner from finalizing when approval is required", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      ownerId: "owner1",
      requireApprovalToFinalize: true,
    } as never);
    const { req, res, next } = makeReqRes("u2");

    await requireFinalizePermission(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "finalize_requires_approval" });
  });
});
