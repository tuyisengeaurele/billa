import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { ToastTestWrapper } from "../test/ToastTestWrapper";
import Customers from "./Customers";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderCustomers() {
  return render(
    <ToastTestWrapper>
      <MemoryRouter>
        <AuthProvider>
          <Customers />
        </AuthProvider>
      </MemoryRouter>
    </ToastTestWrapper>,
  );
}

describe("Customers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the empty state when there are no customers", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/team-members")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
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
      if (url.endsWith("/customers/team-members")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
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

  it("marks the Name column header with aria-sort, flipping direction on repeat clicks", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/team-members")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
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
    await screen.findByText("Kigali Traders");

    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    expect(nameHeader).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: /name/i }));
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: /name/i }));
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
  });

  it("creates a customer through the modal and refreshes the list", async () => {
    let created = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/team-members")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
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
    expect(await screen.findByText("Customer added")).toBeInTheDocument();
  });

  it("deactivates a customer after confirming", async () => {
    let isActive = true;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/team-members")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
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
    expect(await screen.findByText("Customer deactivated")).toBeInTheDocument();
  });

  it("reactivates a customer when Undo is clicked on the deactivation toast", async () => {
    let isActive = true;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/team-members")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (url.includes("/customers/c1") && init?.method === "PATCH") {
        const body = JSON.parse((init.body as string) ?? "{}");
        isActive = body.isActive;
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
    await screen.findByText(/no customers yet/i);

    await user.click(await screen.findByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Kigali Traders")).toBeInTheDocument();
    expect(await screen.findByText("Customer reactivated")).toBeInTheDocument();
  });

  it("has an accessible label on the search input", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
    renderCustomers();
    await screen.findByText(/no customers yet/i);

    expect(screen.getByLabelText("Search customers")).toBeInTheDocument();
  });

  it("shows a search-specific empty message instead of the generic one while searching", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText(/no customers yet/i);

    await user.type(screen.getByLabelText("Search customers"), "zzz");

    expect(await screen.findByText('No customers match "zzz".')).toBeInTheDocument();
    expect(screen.queryByText(/no customers yet/i)).not.toBeInTheDocument();
  });

  it("opens the edit modal when a customer's name button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/team-members")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
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
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/team-members")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
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
    });
    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText("Kigali Traders");

    await user.click(screen.getByRole("button", { name: /^name$/i }));

    expect(screen.getByRole("button", { name: /^name ↑$/i })).toBeInTheDocument();
  });

  it("shows a subscription message when creating a customer is blocked by a lapsed trial", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/team-members")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
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

  it("selects rows and bulk-deactivates them, with Undo reactivating the batch", async () => {
    let activeMap: Record<string, boolean> = { c1: true, c2: true };
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/team-members")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      const idMatch = url.match(/\/customers\/(c\d)$/);
      if (idMatch && init?.method === "PATCH") {
        const body = JSON.parse((init.body as string) ?? "{}");
        activeMap[idMatch[1]] = body.isActive;
        return new Response(JSON.stringify({ customer: { id: idMatch[1], isActive: body.isActive } }), { status: 200 });
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "c1", name: "Kigali Traders", tin: null, address: null, phone: null, email: null, isActive: activeMap.c1 },
              { id: "c2", name: "Musanze Supplies", tin: null, address: null, phone: null, email: null, isActive: activeMap.c2 },
            ].filter((customer) => activeMap[customer.id]),
            total: Object.values(activeMap).filter(Boolean).length,
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

    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    expect(screen.getByText("2 customers selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deactivate (2)" }));
    const dialog = await screen.findByRole("dialog", { name: /deactivate customers/i });
    await user.click(within(dialog).getByRole("button", { name: /^deactivate$/i }));

    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument());
    expect(await screen.findByText("2 customers deactivated")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Kigali Traders")).toBeInTheDocument();
    expect(await screen.findByText("Musanze Supplies")).toBeInTheDocument();
    expect(await screen.findByText("2 customers reactivated")).toBeInTheDocument();
  });

  it("shows both Deactivate and Reactivate when the selection is mixed", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/team-members")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "c1", name: "Kigali Traders", tin: null, address: null, phone: null, email: null, isActive: true },
              { id: "c2", name: "Musanze Supplies", tin: null, address: null, phone: null, email: null, isActive: false },
            ],
            total: 2,
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

    await user.click(screen.getByRole("checkbox", { name: "Select Kigali Traders" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Musanze Supplies" }));

    expect(screen.getByRole("button", { name: "Deactivate (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivate (1)" })).toBeInTheDocument();
  });

  it("assigns a customer to a team member from the list", async () => {
    let patchedBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/customers/team-members")) {
        return new Response(
          JSON.stringify({ results: [{ id: "u1", name: "Jane Uwase", email: "jane@example.com" }] }),
          { status: 200 },
        );
      }
      if (url.includes("/customers/c1") && init?.method === "PATCH") {
        patchedBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({
            customer: {
              id: "c1",
              name: "Kigali Traders",
              tin: null,
              address: null,
              phone: null,
              email: null,
              isActive: true,
              assignedToId: "u1",
              assignedTo: { id: "u1", name: "Jane Uwase", email: "jane@example.com" },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "c1",
                name: "Kigali Traders",
                tin: null,
                address: null,
                phone: null,
                email: null,
                isActive: true,
                assignedToId: null,
                assignedTo: null,
              },
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

    const select = await screen.findByLabelText("Assign Kigali Traders");
    await user.selectOptions(select, "u1");

    await waitFor(() => expect(patchedBody).toEqual({ assignedToId: "u1" }));
  });
});
