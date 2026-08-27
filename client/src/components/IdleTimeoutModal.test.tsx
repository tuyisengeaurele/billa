import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { IdleTimeoutModal } from "./IdleTimeoutModal";

function mockAuthenticatedFetch() {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders" },
          impersonating: false,
        }),
        { status: 200 },
      );
    }
    if (url.includes("/auth/logout")) {
      return new Response("{}", { status: 200 });
    }
    return new Response("{}", { status: 401 });
  });
}

async function renderIdleModal(warningAfterMs: number, countdownSeconds: number) {
  const fetchSpy = mockAuthenticatedFetch();
  render(
    <AuthProvider>
      <IdleTimeoutModal warningAfterMs={warningAfterMs} countdownSeconds={countdownSeconds} />
    </AuthProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return fetchSpy;
}

describe("IdleTimeoutModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders nothing while logged out", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    render(
      <AuthProvider>
        <IdleTimeoutModal warningAfterMs={1000} countdownSeconds={5} />
      </AuthProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the warning after the idle period elapses", async () => {
    await renderIdleModal(1000, 5);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("dialog", { name: /still there/i })).toBeInTheDocument();
  });

  it("logs out once the countdown reaches zero without a response", async () => {
    const fetchSpy = await renderIdleModal(1000, 3);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    screen.getByRole("dialog", { name: /still there/i });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/auth/logout"), expect.anything());
  });

  it("stays logged in and resets the timer when 'I'm still here' is clicked", async () => {
    const fetchSpy = await renderIdleModal(1000, 3);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    screen.getByRole("dialog", { name: /still there/i });

    const stayButton = screen.getByRole("button", { name: /i'm still here/i });
    await act(async () => {
      stayButton.click();
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("/auth/logout"), expect.anything());
  });

  it("does not warn if activity happens before the idle period elapses", async () => {
    await renderIdleModal(1000, 5);

    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    await act(async () => {
      window.dispatchEvent(new Event("keydown"));
    });
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
