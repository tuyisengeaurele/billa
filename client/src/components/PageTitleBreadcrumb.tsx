import { Link } from "react-router-dom";
import { usePageTitleSegments } from "../context/PageTitleContext";

export function PageTitleBreadcrumb() {
  const segments = usePageTitleSegments();

  return (
    <h1 className="flex min-w-0 items-center gap-1.5 font-display text-lg font-semibold text-neutral-900">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <span key={`${segment.label}-${index}`} className={`flex items-center gap-1.5 ${isLast ? "min-w-0" : "shrink-0"}`}>
            {index > 0 && (
              <span className="shrink-0 font-normal text-neutral-300" aria-hidden="true">
                /
              </span>
            )}
            {segment.href && !isLast ? (
              <Link to={segment.href} className="shrink-0 text-neutral-500 transition-colors hover:text-neutral-900">
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
