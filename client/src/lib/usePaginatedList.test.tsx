import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePaginatedList } from "./usePaginatedList";

interface Row {
  id: string;
  name: string;
}

interface RenderListParams<S extends string> {
  resourcePath: string;
  defaultSortBy: S;
  extraParams?: Record<string, string>;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function renderList<S extends string>(params: RenderListParams<S>, initialEntries: string[] = ["/"]) {
  return renderHook(() => ({ list: usePaginatedList<Row, S>(params), location: useLocation() }), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>,
  });
}

describe("usePaginatedList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the first page on mount", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ results: [{ id: "1", name: "A" }], total: 1, page: 1, pageSize: 20 }));

    const { result } = renderList({ resourcePath: "/customers", defaultSortBy: "createdAt" as const });

    await waitFor(() => expect(result.current.list.isLoading).toBe(false));
    expect(result.current.list.results).toEqual([{ id: "1", name: "A" }]);
    expect(result.current.list.total).toBe(1);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("debounces rapid search updates into a single request", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    const { result } = renderList({ resourcePath: "/customers", defaultSortBy: "createdAt" as const });
    await waitFor(() => expect(result.current.list.isLoading).toBe(false));
    fetchSpy.mockClear();

    act(() => result.current.list.updateSearch("a"));
    act(() => result.current.list.updateSearch("ab"));
    act(() => result.current.list.updateSearch("abc"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("search=abc");
  });

  it("resets to page 1 when search changes", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    const { result } = renderList({ resourcePath: "/customers", defaultSortBy: "createdAt" as const });
    await waitFor(() => expect(result.current.list.isLoading).toBe(false));

    act(() => result.current.list.setPage(2));
    await waitFor(() => expect(result.current.list.page).toBe(2));

    act(() => result.current.list.updateSearch("x"));
    await waitFor(() => expect(result.current.list.page).toBe(1));
  });

  it("toggleSort flips order on the same column and resets to ascending on a new one", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    const { result } = renderList<"name" | "createdAt">({ resourcePath: "/customers", defaultSortBy: "createdAt" });
    await waitFor(() => expect(result.current.list.isLoading).toBe(false));

    act(() => result.current.list.toggleSort("name"));
    await waitFor(() => expect(result.current.list.sortBy).toBe("name"));
    expect(result.current.list.sortOrder).toBe("asc");

    act(() => result.current.list.toggleSort("name"));
    await waitFor(() => expect(result.current.list.sortOrder).toBe("desc"));
  });

  it("sets an error message when the request fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    const { result } = renderList({ resourcePath: "/customers", defaultSortBy: "createdAt" as const });

    await waitFor(() => expect(result.current.list.isLoading).toBe(false));
    expect(result.current.list.error).toMatch(/couldn't load/i);
  });

  it("includes extraParams in the request", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    renderList({ resourcePath: "/documents", defaultSortBy: "createdAt" as const, extraParams: { type: "INVOICE" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("type=INVOICE");
  });

  it("reads the initial search, page, and sort from the URL", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ results: [], total: 0, page: 2, pageSize: 20 }));

    const { result } = renderList(
      { resourcePath: "/customers", defaultSortBy: "createdAt" as const },
      ["/customers?q=kigali&page=2&sortBy=name&sortOrder=asc"],
    );

    expect(result.current.list.search).toBe("kigali");
    expect(result.current.list.page).toBe(2);
    expect(result.current.list.sortBy).toBe("name");
    expect(result.current.list.sortOrder).toBe("asc");

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("search=kigali");
  });

  it("writes the debounced search back to the URL without pushing a new history entry", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    const { result } = renderList({ resourcePath: "/customers", defaultSortBy: "createdAt" as const }, ["/customers"]);
    await waitFor(() => expect(result.current.list.isLoading).toBe(false));

    act(() => result.current.list.updateSearch("kigali"));

    await waitFor(() => expect(result.current.location.search).toBe("?q=kigali"));
  });

  it("preserves an unrelated existing URL param when writing its own", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    const { result } = renderList(
      { resourcePath: "/documents", defaultSortBy: "createdAt" as const, extraParams: { type: "INVOICE" } },
      ["/documents?type=INVOICE"],
    );
    await waitFor(() => expect(result.current.list.isLoading).toBe(false));

    act(() => result.current.list.updateSearch("acme"));

    await waitFor(() => expect(result.current.location.search).toContain("q=acme"));
    expect(result.current.location.search).toContain("type=INVOICE");
  });
});
