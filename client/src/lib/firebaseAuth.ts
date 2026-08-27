import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
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

export async function signInWithGoogle(): Promise<string> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user.getIdToken();
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
