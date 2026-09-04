import { Spinner } from "./Spinner";

/**
 * Shown while a lazy-loaded route's code chunk is still downloading, so a
 * slow connection (or a stale cache right after a deploy) shows a spinner
 * instead of a blank screen for however long the chunk takes to arrive.
 */
export function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <Spinner size="lg" />
    </div>
  );
}
