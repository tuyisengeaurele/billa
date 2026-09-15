import { Link } from "react-router-dom";
import { usePageTitleSegments } from "../context/PageTitleContext";

export function PageTitleBreadcrumb() {
  const segments = usePageTitleSegments();

  return (
    <h1 className="flex min-w-0 items-center gap-1.5 font-display text-lg font-semibold text-neutral-900">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <span
            key={`${segment.label}-${index}`}
            // Earlier segments (the category, e.g. "Proforma invoices") get a fixed
            // cap and truncate first - on a narrow header there isn't room for both
            // that and the specific document number, and the number is the part
            // worth keeping legible. Without this, a segment that refused to shrink
            // at all could overflow the header and collide with the icons next to
            // it (found via real phone screenshots, not a viewport simulation).
            className={`flex items-center gap-1.5 ${isLast ? "min-w-0 flex-1" : "min-w-0 max-w-[6rem] shrink-0 sm:max-w-[10rem]"}`}
          >
            {index > 0 && (
              <span className="shrink-0 font-normal text-neutral-300" aria-hidden="true">
                /
              </span>
            )}
            {segment.href && !isLast ? (
              <Link to={segment.href} className="truncate text-neutral-500 transition-colors hover:text-neutral-900">
                {segment.label}
              </Link>
            ) : (
              <span className="truncate">{segment.label}</span>
            )}
          </span>
        );
      })}
    </h1>
  );
}
