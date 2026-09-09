import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireBusinessContext } from "./require-business.js";

function mockRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return res as unknown as Response;
}

describe("requireBusinessContext", () => {
  it("calls next() when the session has a businessId", () => {
    const req = { auth: { userId: "u1", businessId: "biz1" } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireBusinessContext(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("responds 403 no_business_access for the empty-string sentinel (an admin-only session)", () => {
    const req = { auth: { userId: "u1", businessId: "" } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireBusinessContext(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "no_business_access" });
  });

  it("responds 403 when there is no auth context at all", () => {
    const req = {} as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireBusinessContext(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
