import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchPalette } from "./SearchPalette";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPalette(onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <SearchPalette isOpen onClose={onClose} />
              <p>underlying page</p>
            </>
          }
        />
        <Route path="/customers/:id/statement" element={<p>customer statement page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SearchPalette", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows a hint before 2 characters are typed, and does not call the API", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("textbox"), "k");

    expect(screen.getByText(/search customers, items, and documents/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows grouped results once the query resolves", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/search")) {
        return new Response(
          JSON.stringify({
            results: [
              { type: "customer", id: "c1", label: "Kigali Traders", sublabel: "0788000000", href: "/customers/c1/statement" },
              {
                type: "document",
                id: "d1",
                label: "INV-0001",
                sublabel: "Kigali Traders",
                documentType: "INVOICE",
                href: "/documents/d1",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("textbox"), "kigali");

    expect(await screen.findByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Kigali Traders")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("INV-0001")).toBeInTheDocument();
    expect(screen.getByText(/invoice · kigali traders/i)).toBeInTheDocument();
  });

  it("navigates to a result and closes when Enter is pressed", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [{ type: "customer", id: "c1", label: "Kigali Traders", sublabel: "", href: "/customers/c1/statement" }],
        }),
        { status: 200 },
      ),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPalette(onClose);

    await user.type(screen.getByRole("textbox"), "kigali");
    await screen.findByText("Kigali Traders");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("customer statement page")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPalette(onClose);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("shows a no-results message for a query that matches nothing", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("textbox"), "zzz");

    expect(await screen.findByText(/no results for "zzz"/i)).toBeInTheDocument();
  });

  it("discards a stale response superseded by a newer query", async () => {
    let resolveFirst: (value: Response) => void = () => {};
    const firstPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("q=ab")) return firstPromise;
      return new Response(
        JSON.stringify({ results: [{ type: "item", id: "i1", label: "Second query result", sublabel: "", href: "/items" }] }),
        { status: 200 },
      );
    });
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("textbox"), "ab");
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await user.type(screen.getByRole("textbox"), "c");
    await screen.findByText("Second query result");

    // The first request resolves late, after the second one already rendered.
    resolveFirst(
      new Response(
        JSON.stringify({ results: [{ type: "item", id: "stale", label: "Stale result", sublabel: "", href: "/items" }] }),
        { status: 200 },
      ),
    );

    expect(screen.queryByText("Stale result")).not.toBeInTheDocument();
    expect(screen.getByText("Second query result")).toBeInTheDocument();
  });
});
