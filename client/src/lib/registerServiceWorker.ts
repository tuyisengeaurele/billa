/** Registers the service worker in production builds only, so dev servers never serve a cached copy of themselves. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app works the same without it; installability is the only thing lost.
    });
  });
}
