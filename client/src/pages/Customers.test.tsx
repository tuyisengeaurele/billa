import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Customers from "./Customers";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderCustomers() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Customers />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Customers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the empty state when there are no customers", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderCustomers();

    expect(await screen.findByText(/no customers yet/i)).toBeInTheDocument();
  });

  it("renders a list of customers", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "c1", name: "Kigali Traders", tin: null, address: null, phone: "0788000000", email: null, isActive: true },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderCustomers();

    expect(await screen.findByText("Kigali Traders")).toBeInTheDocument();
  });

  it("creates a customer through the modal and refreshes the list", async () => {
    let created = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/customers") && init?.method === "POST") {
        created = true;
        return new Response(JSON.stringify({ customer: { id: "c1", name: "New Co" } }), { status: 201 });
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: created
              ? [{ id: "c1", name: "New Co", tin: null, address: null, phone: null, email: null, isActive: true }]
              : [],
            total: created ? 1 : 0,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText(/no customers yet/i);

    await user.click(screen.getAllByRole("button", { name: /add customer/i })[0]);
    await user.type(screen.getByLabelText("Name"), "New Co");
    await user.click(screen.getByRole("button", { name: /save customer/i }));

    await waitFor(() => expect(screen.getByText("New Co")).toBeInTheDocument());
  });

  it("deactivates a customer after confirming", async () => {
    let isActive = true;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/customers/c1") && init?.method === "PATCH") {
        isActive = false;
        return new Response(JSON.stringify({ customer: { id: "c1", name: "Kigali Traders", isActive } }), {
          status: 200,
        });
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: isActive
              ? [
                  {
                    id: "c1",
                    name: "Kigali Traders",
                    tin: null,
                    address: null,
                    phone: null,
                    email: null,
                    isActive: true,
                  },
                ]
              : [],
            total: isActive ? 1 : 0,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText("Kigali Traders");

    await user.click(screen.getByRole("button", { name: /deactivate/i }));

    const dialog = await screen.findByRole("dialog", { name: /deactivate customer/i });
    await user.click(within(dialog).getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument());
  });

  it("has an accessible label on the search input", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
    renderCustomers();
    await screen.findByText(/no customers yet/i);

    expect(screen.getByLabelText("Search customers")).toBeInTheDocument();
  });

  it("opens the edit modal when a customer's name button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "c1", name: "Kigali Traders", tin: null, address: null, phone: null, email: null, isActive: true },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText("Kigali Traders");

    await user.click(screen.getByRole("button", { name: "Kigali Traders" }));

    expect(await screen.findByText("Edit customer")).toBeInTheDocument();
  });

  it("sorts by name when the Name header button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [
            { id: "c1", name: "Kigali Traders", tin: null, address: null, phone: null, email: null, isActive: true },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText("Kigali Traders");

    await user.click(screen.getByRole("button", { name: /^name$/i }));

    expect(screen.getByRole("button", { name: /^name ↑$/i })).toBeInTheDocument();
  });

  it("shows a subscription message when creating a customer is blocked by a lapsed trial", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/customers") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "subscription_required" }), { status: 402 });
      }
      if (url.includes("/customers")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText(/no customers yet/i);

    await user.click(screen.getAllByRole("button", { name: /add customer/i })[0]);
    await user.type(screen.getByLabelText("Name"), "New Co");
    await user.click(screen.getByRole("button", { name: /save customer/i }));

    expect(await screen.findByText(/trial has ended/i)).toBeInTheDocument();
  });
});
