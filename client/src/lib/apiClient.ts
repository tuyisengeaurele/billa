const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
export const API_BASE_URL = BASE_URL;

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function rawRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const { body } = options;
  return fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Paths where a 401 is an expected, routine outcome (an anonymous visitor with
// no session, the auth endpoints themselves, or a wrong two-factor code)
// rather than "you were logged in and now you're not" — these never trigger
// the session-expiry redirect below, even though they still get the normal
// silent-refresh retry.
const SESSION_EXPIRY_EXEMPT_PATHS = ["/auth/session", "/auth/refresh", "/auth/me", "/auth/2fa/challenge"];

function redirectToLoginOnSessionExpiry() {
  const loginPath = window.location.pathname.startsWith("/admin") ? "/admin/login" : "/login";
  if (window.location.pathname === loginPath) return;
  window.location.href = `${window.location.origin}${loginPath}?expired=true`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await rawRequest(path, options);

  if (response.status === 401 && path !== "/auth/session" && path !== "/auth/refresh") {
    const refreshResponse = await rawRequest("/auth/refresh", { method: "POST" });
    if (refreshResponse.ok) {
      response = await rawRequest(path, options);
    } else if (refreshResponse.status === 401 && !SESSION_EXPIRY_EXEMPT_PATHS.includes(path)) {
      redirectToLoginOnSessionExpiry();
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseBody(response));
  }

  return (await parseBody(response)) as T;
}
