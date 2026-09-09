import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { describeError, type HealthCheckResult } from "./health-check.js";
import { withTimeout } from "./with-timeout.js";

function ensureApp() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
}

export async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email: string }> {
  ensureApp();
  const decoded = await getAuth().verifyIdToken(idToken);
  if (!decoded.email) {
    throw new Error("Firebase token has no email");
  }
  return { uid: decoded.uid, email: decoded.email };
}

export async function checkFirebaseAdminHealth(): Promise<HealthCheckResult> {
  try {
    ensureApp();
    return await withTimeout(
      getAuth()
        .listUsers(1)
        .then((): HealthCheckResult => ({ ok: true, error: null })),
      5000,
      { ok: false, error: "Timed out after 5s" },
    );
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}
