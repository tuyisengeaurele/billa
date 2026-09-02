import { useEffect, useRef } from "react";

interface SelectAllCheckboxProps {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  ariaLabel: string;
  className?: string;
}

/**
 * A "select all" checkbox that also shows the browser's native indeterminate
 * state when some, but not all, rows on the page are selected. `indeterminate`
 * is a DOM property rather than an HTML attribute, so it has to be set
 * imperatively on the underlying element rather than passed as JSX.
 */
export function SelectAllCheckbox({ checked, indeterminate, onChange, ariaLabel, className }: SelectAllCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={ariaLabel} className={className} />
  );
}
