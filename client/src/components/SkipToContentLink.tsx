export function SkipToContentLink() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-lg bg-surface px-4 py-2.5 font-sans text-sm font-semibold text-neutral-900 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
    >
      Skip to content
    </a>
  );
}
