import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminSystemHealth from "./AdminSystemHealth";

describe("AdminSystemHealth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows job status cards and DB connectivity once loaded", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          dbConnected: true,
          jobs: [
            {
              jobName: "recurring-documents",
              ranAt: "2026-08-25T10:00:00.000Z",
              succeeded: true,
              resultCount: 2,
              errorMessage: null,
            },
            {
              jobName: "overdue-reminders",
              ranAt: "2026-08-25T09:00:00.000Z",
              succeeded: false,
              resultCount: null,
              errorMessage: "SMTP timeout",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter>
        <AdminSystemHealth />
      </MemoryRouter>,
    );

    expect(await screen.findByText("recurring-documents")).toBeInTheDocument();
    expect(screen.getByText("overdue-reminders")).toBeInTheDocument();
    expect(screen.getByText(/database:/i)).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("SMTP timeout")).toBeInTheDocument();
  });

  it("shows a never-run message when a job has no history", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ dbConnected: true, jobs: [] }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <AdminSystemHealth />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText(/never run/i)).toHaveLength(2);
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    render(
      <MemoryRouter>
        <AdminSystemHealth />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/couldn't load system health/i)).toBeInTheDocument();
  });
});
