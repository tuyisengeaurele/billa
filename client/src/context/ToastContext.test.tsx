import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ToastProvider, useToast, useToastItems } from "./ToastContext";

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("ToastContext", () => {
  it("adds a success toast and auto-dismisses it after 4 seconds", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => ({ toast: useToast(), items: useToastItems() }), { wrapper });

    act(() => {
      result.current.toast.success("Item saved");
    });
    expect(result.current.items.toasts).toHaveLength(1);
    expect(result.current.items.toasts[0]).toMatchObject({ variant: "success", message: "Item saved" });

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.items.toasts).toHaveLength(0);
    vi.useRealTimers();
  });

  it("adds an error toast that does not auto-dismiss", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => ({ toast: useToast(), items: useToastItems() }), { wrapper });

    act(() => {
      result.current.toast.error("Couldn't save. Try again.");
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.items.toasts).toHaveLength(1);
    expect(result.current.items.toasts[0].variant).toBe("error");
    vi.useRealTimers();
  });

  it("dismiss removes a toast by id", () => {
    const { result } = renderHook(() => ({ toast: useToast(), items: useToastItems() }), { wrapper });

    act(() => {
      result.current.toast.error("Something failed");
    });
    const id = result.current.items.toasts[0].id;
    act(() => {
      result.current.items.dismiss(id);
    });
    expect(result.current.items.toasts).toHaveLength(0);
  });

  it("caps visible toasts at 4, dropping the oldest", () => {
    const { result } = renderHook(() => ({ toast: useToast(), items: useToastItems() }), { wrapper });

    act(() => {
      result.current.toast.error("one");
      result.current.toast.error("two");
      result.current.toast.error("three");
      result.current.toast.error("four");
      result.current.toast.error("five");
    });
    expect(result.current.items.toasts).toHaveLength(4);
    expect(result.current.items.toasts.map((toast) => toast.message)).toEqual(["two", "three", "four", "five"]);
  });

  it("useToast without a provider is a harmless no-op", () => {
    const { result } = renderHook(() => useToast());
    expect(() => result.current.success("x")).not.toThrow();
    expect(() => result.current.error("x")).not.toThrow();
  });

  it("pauseAutoDismiss stops the timer, and resumeAutoDismiss continues from the remaining time", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => ({ toast: useToast(), items: useToastItems() }), { wrapper });

    act(() => {
      result.current.toast.success("Item saved");
    });
    const id = result.current.items.toasts[0].id;

    act(() => {
      vi.advanceTimersByTime(3000);
      result.current.items.pauseAutoDismiss(id);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Paused with 1s of its original 4s left; waiting 5 more seconds shouldn't dismiss it.
    expect(result.current.items.toasts).toHaveLength(1);

    act(() => {
      result.current.items.resumeAutoDismiss(id);
      vi.advanceTimersByTime(999);
    });
    expect(result.current.items.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current.items.toasts).toHaveLength(0);
    vi.useRealTimers();
  });

  it("pauseAutoDismiss and resumeAutoDismiss on an unknown id is a harmless no-op", () => {
    const { result } = renderHook(() => ({ toast: useToast(), items: useToastItems() }), { wrapper });
    expect(() => result.current.items.pauseAutoDismiss("nope")).not.toThrow();
    expect(() => result.current.items.resumeAutoDismiss("nope")).not.toThrow();
  });

  it("carries an optional action through to the toast item", () => {
    const { result } = renderHook(() => ({ toast: useToast(), items: useToastItems() }), { wrapper });
    const onClick = vi.fn();

    act(() => {
      result.current.toast.success("Item deactivated", { label: "Undo", onClick });
    });

    expect(result.current.items.toasts[0].action).toEqual({ label: "Undo", onClick });
  });
});
