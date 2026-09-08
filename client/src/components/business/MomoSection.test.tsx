import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomoSection } from "./MomoSection";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

interface MockOverrides {
  get?: unknown;
  onTest?: (body: unknown) => unknown;
}

function mockFetch(overrides: MockOverrides = {}) {
  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = urlOf(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/business/momo-settings") && method === "GET") {
      return new Response(
        JSON.stringify(overrides.get ?? { enabled: false, environment: null, targetEnvironment: null, configured: false }),
        { status: 200 },
      );
    }
    if (url.endsWith("/business/momo-settings") && method === "PATCH") {
      return new Response(
        JSON.stringify({ enabled: true, environment: "sandbox", targetEnvironment: "sandbox", configured: true }),
        { status: 200 },
      );
    }
    if (url.endsWith("/business/momo-settings/test") && method === "POST") {
      const body = JSON.parse((init?.body as string) ?? "{}");
      return new Response(JSON.stringify(overrides.onTest ? overrides.onTest(body) : { ok: true }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
}

describe("MomoSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows 'Not configured yet.' when MoMo isn't set up", async () => {
    mockFetch();
    render(<MomoSection />);

    expect(await screen.findByText("Not configured yet.")).toBeInTheDocument();
  });

  it("saves credentials and shows the configured summary", async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<MomoSection />);

    await user.click(await screen.findByRole("button", { name: /set up/i }));
    await user.type(screen.getByLabelText("Subscription key"), "sub-key");
    await user.type(screen.getByLabelText("API user"), "api-user");
    await user.type(screen.getByLabelText("API key"), "api-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/configured \(sandbox\), on/i)).toBeInTheDocument();
  });

  it("shows the target environment field only for production", async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<MomoSection />);

    await user.click(await screen.findByRole("button", { name: /set up/i }));
    expect(screen.queryByLabelText("Target environment")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Environment"), "production");
    expect(screen.getByLabelText("Target environment")).toBeInTheDocument();
  });

  it("shows a success message when the test connection succeeds", async () => {
    mockFetch({ onTest: () => ({ ok: true }) });
    const user = userEvent.setup();
    render(<MomoSection />);

    await user.click(await screen.findByRole("button", { name: /set up/i }));
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    expect(await screen.findByText(/connected successfully/i)).toBeInTheDocument();
  });

  it("shows an error message when the test connection fails", async () => {
    mockFetch({ onTest: () => ({ ok: false, error: "Invalid credentials" }) });
    const user = userEvent.setup();
    render(<MomoSection />);

    await user.click(await screen.findByRole("button", { name: /set up/i }));
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
  });
});
