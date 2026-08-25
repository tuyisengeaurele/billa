import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminMetrics from "./AdminMetrics";

describe("AdminMetrics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the metric tiles once loaded", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          totalUsers: 5,
          totalBusinesses: 5,
          activeTrials: 4,
          payingAccounts: 1,
          signups7d: 3,
          signups30d: 4,
          documents7d: 1,
          documents30d: 2,
          dailySignups30d: [
            { date: "2026-08-10", count: 1 },
            { date: "2026-08-22", count: 3 },
          ],
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter>
        <AdminMetrics />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Total users")).toBeInTheDocument();
    expect(screen.getAllByText("5")).toHaveLength(2);
    expect(screen.getByText("Active trials")).toBeInTheDocument();
    expect(screen.getByText("Signups (7d)")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Paying accounts")).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    render(
      <MemoryRouter>
        <AdminMetrics />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/couldn't load metrics/i)).toBeInTheDocument();
  });
});
