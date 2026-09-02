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
export function buildPublicAssetUrl(relativeUrl: string | null): string | null {
  if (!relativeUrl) return null;

  const r2PublicUrl = process.env.R2_PUBLIC_URL;
  if (r2PublicUrl) {
    const base = r2PublicUrl.replace(/\/$/, "");
    const key = relativeUrl.replace(/^\/uploads/, "");
    return `${base}${key}`;
  }

  const apiUrl = process.env.API_URL ?? "http://localhost:4000";
  return `${apiUrl}${relativeUrl}`;
}
