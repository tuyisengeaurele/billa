import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "./apiClient";

interface PaginatedResponse<T> {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface UsePaginatedListParams<SortByT extends string> {
  resourcePath: string;
  defaultSortBy: SortByT;
  pageSize?: number;
  extraParams?: Record<string, string>;
}

export function usePaginatedList<T, SortByT extends string>({
  resourcePath,
  defaultSortBy,
  pageSize = 20,
  extraParams,
}: UsePaginatedListParams<SortByT>) {
  const [urlParams, setUrlParams] = useSearchParams();

  const [results, setResults] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const raw = Number(urlParams.get("page"));
    return Number.isInteger(raw) && raw > 0 ? raw : 1;
  });
  const [search, setSearch] = useState(() => urlParams.get("q") ?? "");
  const [sortBy, setSortBy] = useState<SortByT>(() => (urlParams.get("sortBy") as SortByT) || defaultSortBy);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() =>
    urlParams.get("sortOrder") === "asc" ? "asc" : "desc",
  );
  const [includeInactive, setIncludeInactive] = useState(() => urlParams.get("includeInactive") === "true");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      setIsLoading(true);
      setError(null);

      // Reflect the current filters in the URL (replacing, not pushing, so typing
      // in the search box doesn't spam browser history) so that navigating away
      // and back — e.g. clicking into a row, then hitting the browser's back
      // button — restores this list's search/sort/page instead of resetting it.
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (search.trim()) next.set("q", search.trim());
          else next.delete("q");
          if (page > 1) next.set("page", String(page));
          else next.delete("page");
          if (sortBy !== defaultSortBy) next.set("sortBy", sortBy);
          else next.delete("sortBy");
          if (sortOrder !== "desc") next.set("sortOrder", sortOrder);
          else next.delete("sortOrder");
          if (includeInactive) next.set("includeInactive", "true");
          else next.delete("includeInactive");
          return next;
        },
        { replace: true },
      );

      const params = new URLSearchParams({
        sortBy,
        sortOrder,
        page: String(page),
        pageSize: String(pageSize),
        includeInactive: String(includeInactive),
        ...extraParams,
      });
      if (search.trim()) params.set("search", search.trim());

      apiRequest<PaginatedResponse<T>>(`${resourcePath}?${params.toString()}`)
        .then((data) => {
          if (cancelled) return;
          setResults(data.results);
          setTotal(data.total);
        })
        .catch(() => {
          if (!cancelled) setError("Couldn't load the list.");
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resourcePath,
    search,
    sortBy,
    sortOrder,
    page,
    pageSize,
    includeInactive,
    reloadToken,
    JSON.stringify(extraParams),
  ]);

  function toggleSort(column: SortByT) {
    setSortBy((current) => {
      if (current === column) {
        setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
      } else {
        setSortOrder("asc");
      }
      return column;
    });
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateIncludeInactive(value: boolean) {
    setIncludeInactive(value);
    setPage(1);
  }

  function reload() {
    setReloadToken((token) => token + 1);
  }

  return {
    results,
    total,
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    includeInactive,
    isLoading,
    error,
    setPage,
    toggleSort,
    updateSearch,
    updateIncludeInactive,
    reload,
  };
}
