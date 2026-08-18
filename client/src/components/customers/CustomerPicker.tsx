import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/apiClient";
import { SearchDropdown, type SearchDropdownOption } from "../SearchDropdown";

interface CustomerResult {
  id: string;
  name: string;
  phone: string | null;
}

export interface CustomerSelection {
  id: string;
  name: string;
}

interface CustomerPickerProps {
  value: string;
  error?: string;
  onSelect: (customer: CustomerSelection) => void;
}

export function CustomerPicker({ value, error, onSelect }: CustomerPickerProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<SearchDropdownOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsLoading(true);
      const params = new URLSearchParams({ pageSize: "10" });
      if (query.trim()) params.set("search", query.trim());
      apiRequest<{ results: CustomerResult[] }>(`/customers?${params.toString()}`)
        .then((data) => {
          setOptions(data.results.map((c) => ({ id: c.id, label: c.name, sublabel: c.phone ?? undefined })));
        })
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <SearchDropdown
      id="customer"
      label="Customer"
      placeholder="Search customers"
      error={error}
      query={query}
      onQueryChange={setQuery}
      options={options}
      isLoading={isLoading}
      onSelect={(option) => {
        setQuery(option.label);
        onSelect({ id: option.id, name: option.label });
      }}
    />
  );
}
