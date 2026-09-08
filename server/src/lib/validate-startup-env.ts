// Vars whose absence causes a request to fail with a real error at the point of use
// (e.g. JWT_ACCESS_SECRET) already fail loudly on their own. This list is for the
// ones that fail silently or confusingly instead - CORS with no CLIENT_ORIGIN just
// rejects every browser request with no explanation in the response, for example.
const REQUIRED_AT_BOOT = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "CLIENT_ORIGIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
];

// Called once at process startup, never mid-request: a misconfigured deploy should
// fail immediately and obviously, not serve traffic in a silently broken state.
export function validateStartupEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_AT_BOOT.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}
