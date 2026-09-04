import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
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
          dailyDocuments30d: [
            { date: "2026-08-10", count: 2 },
            { date: "2026-08-22", count: 1 },
          ],
          planDistribution: [
            { plan: "NONE", count: 4 },
            { plan: "MONTHLY", count: 1 },
          ],
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <AdminMetrics />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Total users")).toBeInTheDocument();
    expect(screen.getAllByText("5")).toHaveLength(2);
    expect(screen.getByText("Active trials")).toBeInTheDocument();
    expect(screen.getByText("Signups (7d)")).toBeInTheDocument();
    expect(screen.getAllByText("3")).toHaveLength(2);
    expect(screen.getByText("Paying accounts")).toBeInTheDocument();
    expect(screen.getByText("Signups, last 30 days")).toBeInTheDocument();
    expect(screen.getByText("Documents, last 30 days")).toBeInTheDocument();
    expect(screen.getByText("Plan distribution")).toBeInTheDocument();
  });

  it("gives each chart an accessible label and a data table for screen readers", async () => {
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
          dailyDocuments30d: [
            { date: "2026-08-10", count: 2 },
            { date: "2026-08-22", count: 1 },
          ],
          planDistribution: [
            { plan: "NONE", count: 4 },
            { plan: "MONTHLY", count: 1 },
          ],
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <AdminMetrics />
        </AuthProvider>
      </MemoryRouter>,
    );

    await screen.findByText("Signups, last 30 days");
    expect(screen.getAllByRole("img").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Daily counts for the last 30 days", { selector: "caption" })).toHaveLength(2);
    expect(screen.getByText("Accounts by plan", { selector: "caption" })).toBeInTheDocument();
    expect(screen.getAllByText("Trial").length).toBeGreaterThanOrEqual(1);
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    render(
      <MemoryRouter>
        <AuthProvider>
          <AdminMetrics />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/couldn't load metrics/i)).toBeInTheDocument();
  });
});
