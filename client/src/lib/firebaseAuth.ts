import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getRedirectResult,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
  updatePassword,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export async function signInWithEmail(email: string, password: string): Promise<string> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user.getIdToken();
}

export async function signUpWithEmail(email: string, password: string): Promise<string> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user.getIdToken();
}

// A real page navigation to Google and back, not a popup window. A popup needs
// the browser to let a separate window read/write storage and talk back to its
// opener, which an increasing share of browsers restrict by default for
// cross-site windows - the visible symptom is a permanently blank Firebase
// auth-handler popup, stuck with nothing to click. A redirect sidesteps the
// problem entirely: there's only ever one browsing context, so there's no
// window-to-window handoff to block. This never resolves meaningfully itself
// (the browser navigates away first); the result comes back on the app's next
// load, via consumeGoogleRedirectResult().
export async function signInWithGoogle(): Promise<void> {
  await signInWithRedirect(auth, googleProvider);
}

// Called once on every app load. Resolves to the signed-in ID token if this load
// is the browser returning from signInWithGoogle(), or null on an ordinary page
// load with no pending redirect to consume.
export async function consumeGoogleRedirectResult(): Promise<string | null> {
  const result = await getRedirectResult(auth);
  return result ? result.user.getIdToken() : null;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export function hasPasswordProvider(): boolean {
  return auth.currentUser?.providerData.some((provider) => provider.providerId === "password") ?? false;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("not_authenticated");
  }
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export function firebaseErrorCode(err: unknown): string | null {
  if (typeof err === "object" && err !== null && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return null;
}
