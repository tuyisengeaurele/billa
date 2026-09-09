import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Contact from "./Contact";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderContact() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Contact />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Contact", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a confirmation after a successful submission", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) return new Response("{}", { status: 401 });
      if (url.endsWith("/contact")) return new Response(JSON.stringify({ ok: true }), { status: 201 });
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderContact();

    await user.type(screen.getByLabelText("Name"), "Aline");
    await user.type(screen.getByLabelText("Email"), "aline@example.com");
    await user.type(screen.getByLabelText("Message"), "I'd like help setting up my templates.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText(/we've got your message/i)).toBeInTheDocument();
  });

  it("marks the message field invalid when it's too short", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) return new Response("{}", { status: 401 });
      return new Response("{}", { status: 400 });
    });
    const user = userEvent.setup();
    renderContact();

    await user.type(screen.getByLabelText("Name"), "Aline");
    await user.type(screen.getByLabelText("Email"), "aline@example.com");
    await user.type(screen.getByLabelText("Message"), "hi");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveAttribute("aria-invalid", "true"));
  });

  it("shows an error banner when the request fails", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) return new Response("{}", { status: 401 });
      return new Response("{}", { status: 500 });
    });
    const user = userEvent.setup();
    renderContact();

    await user.type(screen.getByLabelText("Name"), "Aline");
    await user.type(screen.getByLabelText("Email"), "aline@example.com");
    await user.type(screen.getByLabelText("Message"), "I'd like help setting up my templates.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't send your message/i);
  });

  it("pre-fills name and email for a signed-in user, still editable", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com", name: "Aline Owner" },
            business: { id: "b1", name: "Kigali Traders" },
            impersonating: false,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    renderContact();

    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Aline Owner"));
    expect(screen.getByLabelText("Email")).toHaveValue("owner@example.com");
  });
});
