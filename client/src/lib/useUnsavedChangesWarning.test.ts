import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useUnsavedChangesWarning } from "./useUnsavedChangesWarning";

function dispatchBeforeUnload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("useUnsavedChangesWarning", () => {
  it("prevents the default beforeunload behavior when there are unsaved changes", () => {
    renderHook(() => useUnsavedChangesWarning(true));

    expect(dispatchBeforeUnload()).toBe(true);
  });

  it("does nothing when there are no unsaved changes", () => {
    renderHook(() => useUnsavedChangesWarning(false));

    expect(dispatchBeforeUnload()).toBe(false);
  });

  it("stops warning once isDirty flips back to false", () => {
    const { rerender } = renderHook(({ isDirty }) => useUnsavedChangesWarning(isDirty), {
      initialProps: { isDirty: true },
    });
    expect(dispatchBeforeUnload()).toBe(true);

    rerender({ isDirty: false });

    expect(dispatchBeforeUnload()).toBe(false);
  });
});
