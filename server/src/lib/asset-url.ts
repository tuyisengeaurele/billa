/**
 * Turns a relative upload path (e.g. "/uploads/{businessId}/{file}") into an
 * absolute URL that is reachable from anywhere on the internet, not just
 * from this app's own local network.
 *
 * This matters for embedding images in emails: recipients' mail providers
 * (Gmail included) fetch linked images through their own servers before
 * displaying them, so a URL only reachable on localhost or a private
 * network never loads there, even if it works fine in the browser.
 *
 * When R2_PUBLIC_URL is set (a Cloudflare R2 bucket's public dev subdomain
 * or custom domain), that is used since it is genuinely public regardless
 * of whether this API server itself has been deployed yet. Otherwise this
 * falls back to API_URL, which only works once the API is deployed
 * publicly.
 */
// RENDER_EXTERNAL_URL is set automatically by Render for every web service -
// no manual configuration needed, unlike API_URL (a value someone has to
// remember to fill in, and re-check after every new service). Preferring it
// means a public-facing URL is never silently wrong just because that step
// got skipped, which is exactly what left Billa's own logo unreachable from
// real inboxes: API_URL was never set, so this fell back to a localhost URL
// no mail provider's server could ever reach.
export function publicBaseUrl(): string {
  return (process.env.RENDER_EXTERNAL_URL ?? process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

export function buildPublicAssetUrl(relativeUrl: string | null): string | null {
  if (!relativeUrl) return null;

  const r2PublicUrl = process.env.R2_PUBLIC_URL;
  if (r2PublicUrl) {
    const base = r2PublicUrl.replace(/\/$/, "");
    const key = relativeUrl.replace(/^\/uploads/, "");
    return `${base}${key}`;
  }

  return `${publicBaseUrl()}${relativeUrl}`;
}
