import { config } from "dotenv";
import { vi } from "vitest";

config({ path: ".env.test" });

vi.mock("../lib/firebase-admin.js", () => ({
  verifyFirebaseToken: async (idToken: string) => JSON.parse(idToken),
  checkFirebaseAdminHealth: async () => false,
}));
