/** The aria-sort value a sortable `<th>` should carry given the list's current sort state. */
export function ariaSortValue(
  currentSortBy: string,
  column: string,
  sortOrder: "asc" | "desc",
): "ascending" | "descending" | "none" {
  if (currentSortBy !== column) return "none";
  return sortOrder === "asc" ? "ascending" : "descending";
}
