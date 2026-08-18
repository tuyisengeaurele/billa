import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeBackground } from "./rembg-client.js";

describe("removeBackground", () => {
  beforeEach(() => {
    process.env.REMBG_SERVICE_URL = "http://localhost:8000/remove-background";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the buffer and returns the processed bytes", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer,
    } as Response);

    const result = await removeBackground(Buffer.from("input-bytes"));

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/remove-background",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(Buffer.from([9, 9, 9]));
  });

  it("throws when the service responds with an error status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 500 } as Response);

    await expect(removeBackground(Buffer.from("input-bytes"))).rejects.toThrow(
      "rembg service returned 500",
    );
  });

  it("throws when REMBG_SERVICE_URL is not set", async () => {
    delete process.env.REMBG_SERVICE_URL;

    await expect(removeBackground(Buffer.from("x"))).rejects.toThrow("REMBG_SERVICE_URL is not set");
  });
});
