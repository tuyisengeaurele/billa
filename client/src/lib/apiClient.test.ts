import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./apiClient";

describe("apiRequest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await apiRequest<{ ok: boolean }>("/health");
    expect(result).toEqual({ ok: true });
  });

  it("sends credentials: include on every request", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await apiRequest("/health");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("throws ApiError with status and body when refresh also fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 }),
    );

    await expect(apiRequest("/business")).rejects.toMatchObject({
      status: 401,
      body: { error: "invalid_credentials" },
    });
  });

  it("retries the original request once after a successful refresh", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ retried: true }), { status: 200 }));

    const result = await apiRequest<{ retried: boolean }>("/business");

    expect(result).toEqual({ retried: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not attempt refresh when the failing request is /auth/login", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 }),
    );

    await expect(apiRequest("/auth/login", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
