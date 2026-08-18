import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePaginatedList } from "./usePaginatedList";

interface Row {
  id: string;
  name: string;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("usePaginatedList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the first page on mount", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ results: [{ id: "1", name: "A" }], total: 1, page: 1, pageSize: 20 }));

    const { result } = renderHook(() =>
      usePaginatedList<Row, "name" | "createdAt">({ resourcePath: "/customers", defaultSortBy: "createdAt" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.results).toEqual([{ id: "1", name: "A" }]);
    expect(result.current.total).toBe(1);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("debounces rapid search updates into a single request", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    const { result } = renderHook(() =>
      usePaginatedList<Row, "name" | "createdAt">({ resourcePath: "/customers", defaultSortBy: "createdAt" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    fetchSpy.mockClear();

    act(() => result.current.updateSearch("a"));
    act(() => result.current.updateSearch("ab"));
    act(() => result.current.updateSearch("abc"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("search=abc");
  });

  it("resets to page 1 when search changes", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    const { result } = renderHook(() =>
      usePaginatedList<Row, "name" | "createdAt">({ resourcePath: "/customers", defaultSortBy: "createdAt" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.updateSearch("x"));
    await waitFor(() => expect(result.current.page).toBe(1));
  });

  it("toggleSort flips order on the same column and resets to ascending on a new one", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    const { result } = renderHook(() =>
      usePaginatedList<Row, "name" | "createdAt">({ resourcePath: "/customers", defaultSortBy: "createdAt" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleSort("name"));
    await waitFor(() => expect(result.current.sortBy).toBe("name"));
    expect(result.current.sortOrder).toBe("asc");

    act(() => result.current.toggleSort("name"));
    await waitFor(() => expect(result.current.sortOrder).toBe("desc"));
  });

  it("sets an error message when the request fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    const { result } = renderHook(() =>
      usePaginatedList<Row, "name" | "createdAt">({ resourcePath: "/customers", defaultSortBy: "createdAt" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/couldn't load/i);
  });
});
