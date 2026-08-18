import { useEffect, useState } from "react";
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
}

export function usePaginatedList<T, SortByT extends string>({
  resourcePath,
  defaultSortBy,
  pageSize = 20,
}: UsePaginatedListParams<SortByT>) {
  const [results, setResults] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortByT>(defaultSortBy);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        sortBy,
        sortOrder,
        page: String(page),
        pageSize: String(pageSize),
        includeInactive: String(includeInactive),
      });
      if (search.trim()) params.set("search", search.trim());

      apiRequest<PaginatedResponse<T>>(`${resourcePath}?${params.toString()}`)
        .then((data) => {
          if (cancelled) return;
          setResults(data.results);
          setTotal(data.total);
        })
        .catch(() => {
          if (!cancelled) setError("Couldn't load the list. Try again.");
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [resourcePath, search, sortBy, sortOrder, page, pageSize, includeInactive, reloadToken]);

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
