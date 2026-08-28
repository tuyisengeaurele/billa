import { Link } from "react-router-dom";
import { usePageTitleSegments } from "../context/PageTitleContext";

export function PageTitleBreadcrumb() {
  const segments = usePageTitleSegments();

  return (
    <h1 className="flex min-w-0 items-center gap-1.5 truncate font-display text-lg font-semibold text-neutral-900">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <span key={`${segment.label}-${index}`} className="flex items-center gap-1.5 truncate">
            {index > 0 && <span className="font-normal text-neutral-300">/</span>}
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
