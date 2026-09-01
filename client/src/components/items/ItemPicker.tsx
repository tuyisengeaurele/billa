import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/apiClient";
import { SearchDropdown, type SearchDropdownOption } from "../SearchDropdown";

interface ItemResult {
  id: string;
  description: string;
  unitPrice: number;
  unit: string;
  taxRate: number;
}

export interface ItemSelection {
  id: string;
  description: string;
  unitPrice: number;
  taxRate: number;
}

interface ItemPickerProps {
  value: string;
  error?: string;
  onSelect: (item: ItemSelection) => void;
  onDescriptionChange?: (text: string) => void;
}

export function ItemPicker({ value, error, onSelect, onDescriptionChange }: ItemPickerProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<SearchDropdownOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resultsById, setResultsById] = useState<Record<string, ItemResult>>({});

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsLoading(true);
      const params = new URLSearchParams({ pageSize: "10" });
      if (query.trim()) params.set("search", query.trim());
      apiRequest<{ results: ItemResult[] }>(`/items?${params.toString()}`)
        .then((data) => {
          setOptions(data.results.map((item) => ({ id: item.id, label: item.description, sublabel: item.unit })));
          setResultsById(Object.fromEntries(data.results.map((item) => [item.id, item])));
        })
        .catch(() => setOptions([]))
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <SearchDropdown
      id="item"
      label="Item"
      hideLabel
      placeholder="Search items"
      error={error}
      query={query}
      onQueryChange={(text) => {
        setQuery(text);
        onDescriptionChange?.(text);
      }}
      options={options}
      isLoading={isLoading}
      onSelect={(option) => {
        setQuery(option.label);
        const item = resultsById[option.id];
        onSelect({
          id: option.id,
          description: option.label,
          unitPrice: item?.unitPrice ?? 0,
          taxRate: item?.taxRate ?? 18,
        });
      }}
    />
  );
}
