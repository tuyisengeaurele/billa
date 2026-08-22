import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Contact from "./Contact";

function renderContact() {
  return render(
    <MemoryRouter>
      <Contact />
    </MemoryRouter>,
  );
}

describe("Contact", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a confirmation after a successful submission", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    const user = userEvent.setup();
    renderContact();

    await user.type(screen.getByLabelText("Name"), "Aline");
    await user.type(screen.getByLabelText("Email"), "aline@example.com");
    await user.type(screen.getByLabelText("Message"), "I'd like help setting up my templates.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText(/we've got your message/i)).toBeInTheDocument();
  });

  it("marks the message field invalid when it's too short", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 400 }));
    const user = userEvent.setup();
    renderContact();

    await user.type(screen.getByLabelText("Name"), "Aline");
    await user.type(screen.getByLabelText("Email"), "aline@example.com");
    await user.type(screen.getByLabelText("Message"), "hi");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveAttribute("aria-invalid", "true"));
  });

  it("shows an error banner when the request fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    const user = userEvent.setup();
    renderContact();

    await user.type(screen.getByLabelText("Name"), "Aline");
    await user.type(screen.getByLabelText("Email"), "aline@example.com");
    await user.type(screen.getByLabelText("Message"), "I'd like help setting up my templates.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't send your message/i);
  });
});
