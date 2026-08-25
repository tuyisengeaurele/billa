import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncementBanner } from "./AnnouncementBanner";

describe("AnnouncementBanner", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the active announcement", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ announcement: { id: "a1", message: "Scheduled maintenance tonight." } }), {
        status: 200,
      }),
    );

    render(<AnnouncementBanner />);

    expect(await screen.findByText("Scheduled maintenance tonight.")).toBeInTheDocument();
  });

  it("renders nothing when there's no active announcement", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ announcement: null }), { status: 200 }));

    const { container } = render(<AnnouncementBanner />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("hides the banner once dismissed and stays hidden on reload for the same announcement", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ announcement: { id: "a1", message: "Scheduled maintenance tonight." } }), {
        status: 200,
      }),
    );
    const user = userEvent.setup();
    const { unmount, container } = render(<AnnouncementBanner />);

    await user.click(await screen.findByRole("button", { name: /dismiss/i }));
    expect(container).toBeEmptyDOMElement();

    unmount();
    const { container: container2 } = render(<AnnouncementBanner />);
    await waitFor(() => expect(container2).toBeEmptyDOMElement());
  });
});
