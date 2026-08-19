import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import DocumentView from "./DocumentView";

describe("DocumentView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the document number, customer, lines, and totals", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            number: "INV-0001",
            status: "FINALIZED",
            customer: { name: "Kigali Traders" },
            lines: [{ id: "l1", description: "Printing", quantity: "2.00", unitPrice: 5000, lineTotal: 10000 }],
            subtotal: 10000,
            taxTotal: 1800,
            total: 11800,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("INV-0001")).toBeInTheDocument();
    expect(screen.getByText("Kigali Traders")).toBeInTheDocument();
    expect(screen.getByText("Printing")).toBeInTheDocument();
    expect(screen.getByText(/total: 11,800 rwf/i)).toBeInTheDocument();
  });

  it("opens the PDF download URL when the button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            number: "INV-0001",
            status: "FINALIZED",
            customer: { name: "Kigali Traders" },
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
          },
        }),
        { status: 200 },
      ),
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /download pdf/i }));

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("/documents/d1/pdf"), "_blank");
  });
});
