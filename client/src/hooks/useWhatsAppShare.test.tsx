import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWhatsAppShare } from "./useWhatsAppShare";
import { ToastTestWrapper } from "../test/ToastTestWrapper";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWhatsAppShare", () => {
  it("opens WhatsApp and records the share", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ sentAt: "2026-09-29T10:00:00.000Z" }), { status: 200 }));
    const { result } = renderHook(() => useWhatsAppShare(), { wrapper: ToastTestWrapper });

    const sentAt = await result.current({ documentId: "d1", phone: "0788123456", message: "Hi", record: true });

    expect(open).toHaveBeenCalledWith("https://wa.me/250788123456?text=Hi", "_blank", "noopener");
    expect(sentAt).toBe("2026-09-29T10:00:00.000Z");
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/documents/d1/shared");
  });

  it("does not call the API for a reminder", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const fetchSpy = vi.spyOn(global, "fetch");
    const { result } = renderHook(() => useWhatsAppShare(), { wrapper: ToastTestWrapper });

    const sentAt = await result.current({ documentId: "d1", phone: "0788123456", message: "Hi", record: false });

    expect(sentAt).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not open WhatsApp when the customer has no usable phone", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { result } = renderHook(() => useWhatsAppShare(), { wrapper: ToastTestWrapper });

    const sentAt = await result.current({ documentId: "d1", phone: null, message: "Hi", record: true });

    expect(sentAt).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it("still succeeds in opening WhatsApp when recording fails", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useWhatsAppShare(), { wrapper: ToastTestWrapper });

    const sentAt = await result.current({ documentId: "d1", phone: "0788123456", message: "Hi", record: true });

    expect(open).toHaveBeenCalled();
    expect(sentAt).toBeNull();
  });
});
