import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, ApiError, apiRequest } from "./apiClient";

function mockLocation(pathname: string) {
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: { origin: "http://localhost", pathname, href: `http://localhost${pathname}` },
  });
}

describe("apiRequest", () => {
  beforeEach(() => {
    mockLocation("/items");
  });

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

  it("does not attempt refresh when the failing request is /auth/session", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "no_account" }), { status: 401 }),
    );

    await expect(apiRequest("/auth/session", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sends FormData bodies as-is, without a Content-Type header or JSON stringification", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const formData = new FormData();
    formData.append("logo", new Blob(["fake-bytes"], { type: "image/png" }), "logo.png");

    await apiRequest("/business/logo", { method: "POST", body: formData });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.body).toBe(formData);
    expect(init?.headers).toBeUndefined();
  });

  it("redirects to /login when the refresh token itself has expired", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(apiRequest("/business")).rejects.toBeInstanceOf(ApiError);

    expect(window.location.href).toBe("http://localhost/login?expired=true");
  });

  it("redirects to /admin/login instead when the current path is under /admin", async () => {
    mockLocation("/admin/users");
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(apiRequest("/admin/users")).rejects.toBeInstanceOf(ApiError);

    expect(window.location.href).toBe("http://localhost/admin/login?expired=true");
  });

  it("does not redirect when /auth/me fails for an anonymous visitor with no session at all", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(apiRequest("/auth/me")).rejects.toBeInstanceOf(ApiError);

    expect(window.location.href).toBe("http://localhost/items");
  });

  it("does not redirect again if already sitting on the login page", async () => {
    mockLocation("/login");
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(apiRequest("/business")).rejects.toBeInstanceOf(ApiError);

    expect(window.location.href).toBe("http://localhost/login");
  });

  it("does not redirect when a two-factor challenge is rejected for a wrong code", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "invalid_code" }), { status: 401 }));

    await expect(apiRequest("/auth/2fa/challenge", { method: "POST" })).rejects.toBeInstanceOf(ApiError);

    expect(window.location.href).toBe("http://localhost/items");
  });

  it("does not redirect when the refresh attempt fails for a reason other than 401", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));

    await expect(apiRequest("/business")).rejects.toBeInstanceOf(ApiError);

    expect(window.location.href).toBe("http://localhost/items");
  });
});

describe("API_BASE_URL", () => {
  it("is a non-empty string", () => {
    expect(typeof API_BASE_URL).toBe("string");
    expect(API_BASE_URL.length).toBeGreaterThan(0);
  });
});
