import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiRequest } from "../lib/apiClient";
import {
  consumeGoogleRedirectResult,
  resetPassword as resetPasswordFirebase,
  signInWithEmail,
  signInWithGoogle as signInWithGoogleFirebase,
  signOutFirebase,
  signUpWithEmail,
} from "../lib/firebaseAuth";

interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  avatarUrl: string | null;
  totpEnabled: boolean;
  isAdmin: boolean;
  productTourSeenAt: string | null;
}

interface Business {
  id: string;
  name: string;
  onboardingCompletedAt: string | null;
}

export interface TwoFactorRequired {
  twoFactorRequired: true;
  challengeId: string;
}

type SessionResult = { user: User; business: Business | null } | TwoFactorRequired;

function isTwoFactorRequired(data: SessionResult): data is TwoFactorRequired {
  return "twoFactorRequired" in data && data.twoFactorRequired === true;
}

// Registering either starts a new business (the normal signup) or joins one you were
// invited to (see AcceptInvite) - never both, and the invited case skips creating any
// business of your own entirely.
export type RegisterIntent = { businessName: string } | { inviteToken: string };

interface AuthContextValue {
  user: User | null;
  business: Business | null;
  isLoading: boolean;
  impersonating: boolean;
  login: (email: string, password: string) => Promise<Business | null | TwoFactorRequired>;
  register: (email: string, password: string, intent: RegisterIntent) => Promise<Business>;
  // Google is a redirect, not a popup (see firebaseAuth.ts) - triggering it just
  // sends the browser to Google and back, with nothing meaningful to await here.
  // The actual result is picked up by completeGoogleSignIn() on the next load,
  // which every page that offers Google sign-in calls once on mount. `undefined`
  // means this load has no pending redirect to complete at all - not a business
  // whose value happens to be missing (that's `null`, same as login's).
  signInWithGoogleRedirect: () => Promise<void>;
  completeGoogleSignIn: (intent?: RegisterIntent) => Promise<Business | null | TwoFactorRequired | undefined>;
  completeTwoFactorChallenge: (challengeId: string, code: string) => Promise<Business | null>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  stopImpersonating: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Session cookies aren't visible to other tabs, so a logout (or account deletion) in one
// tab would otherwise leave every other open tab looking signed in until its next request
// happens to 401. Writing to localStorage fires a `storage` event in those other tabs,
// which resyncs them against the server immediately.
const AUTH_BROADCAST_KEY = "billa:auth-broadcast";

function broadcastAuthChange() {
  try {
    localStorage.setItem(AUTH_BROADCAST_KEY, String(Date.now()));
  } catch {
    // Storage can be unavailable (private browsing, disabled cookies/storage) - the
    // current tab's own logout still works, it just won't notify other tabs.
  }
}

async function exchangeSession(idToken: string, intent?: RegisterIntent) {
  return apiRequest<SessionResult>("/auth/session", {
    method: "POST",
    body: intent ? { idToken, ...intent } : { idToken },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(false);

  async function refreshAuth() {
    try {
      const data = await apiRequest<{ user: User; business: Business; impersonating: boolean }>("/auth/me");
      setUser(data.user);
      setBusiness(data.business);
      setImpersonating(data.impersonating);
    } catch {
      setUser(null);
      setBusiness(null);
      setImpersonating(false);
    }
  }

  // Google returns to the page via a full navigation (see firebaseAuth.ts), not a
  // popup, so the result can only be read once per redirect - it's fetched exactly
  // once here and shared with whichever page's completeGoogleSignIn call needs it
  // (see below), rather than each page consuming it separately.
  const googleRedirectIdTokenRef = useRef<Promise<string | null> | null>(null);
  function getGoogleRedirectIdToken() {
    if (!googleRedirectIdTokenRef.current) {
      // Every page mounts this provider, not just the ones offering Google sign-in,
      // so a hiccup here (or an environment that can't support it at all) must never
      // take the rest of auth down with it - treat it the same as an ordinary page
      // load with nothing to consume.
      googleRedirectIdTokenRef.current = (async () => {
        try {
          return (await consumeGoogleRedirectResult()) ?? null;
        } catch {
          return null;
        }
      })();
    }
    return googleRedirectIdTokenRef.current;
  }

  useEffect(() => {
    async function init() {
      const idToken = await getGoogleRedirectIdToken();
      // A pending Google redirect means the page's own completeGoogleSignIn call is
      // about to exchange it for a real session. Calling /auth/me here at the same
      // time would just 401 (no session yet) and race that exchange - whichever
      // setUser call landed last would win, and a 401 landing after a successful
      // exchange would silently wipe the user back out. Skip it and let the
      // redirect completion set the user instead.
      if (!idToken) {
        await refreshAuth();
      }
      setIsLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    function handleStorageEvent(event: StorageEvent) {
      if (event.key === AUTH_BROADCAST_KEY) refreshAuth();
    }
    window.addEventListener("storage", handleStorageEvent);
    return () => window.removeEventListener("storage", handleStorageEvent);
  }, []);

  async function login(email: string, password: string) {
    const idToken = await signInWithEmail(email, password);
    const data = await exchangeSession(idToken);
    if (isTwoFactorRequired(data)) return data;
    setUser(data.user);
    setBusiness(data.business);
    setImpersonating(false);
    return data.business;
  }

  async function register(email: string, password: string, intent: RegisterIntent) {
    const idToken = await signUpWithEmail(email, password);
    const data = await exchangeSession(idToken, intent);
    if (isTwoFactorRequired(data)) throw new Error("unexpected_two_factor_challenge");
    setUser(data.user);
    setBusiness(data.business);
    setImpersonating(false);
    // Registering always creates or joins a real business (unlike logging in,
    // which an admin-only account can do without one) - never null here.
    return data.business!;
  }

  async function signInWithGoogleRedirect() {
    await signInWithGoogleFirebase();
  }

  async function completeGoogleSignIn(intent?: RegisterIntent) {
    const idToken = await getGoogleRedirectIdToken();
    if (!idToken) return undefined;
    const data = await exchangeSession(idToken, intent);
    if (isTwoFactorRequired(data)) return data;
    setUser(data.user);
    setBusiness(data.business);
    setImpersonating(false);
    return data.business;
  }

  async function completeTwoFactorChallenge(challengeId: string, code: string) {
    const data = await apiRequest<{ user: User; business: Business | null }>("/auth/2fa/challenge", {
      method: "POST",
      body: { challengeId, code },
    });
    setUser(data.user);
    setBusiness(data.business);
    setImpersonating(false);
    return data.business;
  }

  async function resetPassword(email: string) {
    await resetPasswordFirebase(email);
  }

  async function logout() {
    await signOutFirebase();
    await apiRequest("/auth/logout", { method: "POST" });
    setUser(null);
    setBusiness(null);
    setImpersonating(false);
    broadcastAuthChange();
  }

  async function stopImpersonating() {
    const data = await apiRequest<{ user: User; business: Business }>("/auth/impersonate/stop", {
      method: "POST",
    });
    setUser(data.user);
    setBusiness(data.business);
    setImpersonating(false);
  }

  async function deleteAccount() {
    await apiRequest("/auth/me", { method: "DELETE" });
    try {
      await signOutFirebase();
    } catch {
      // Not fatal: our own session is already gone either way.
    }
    setUser(null);
    setBusiness(null);
    setImpersonating(false);
    broadcastAuthChange();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        business,
        isLoading,
        impersonating,
        login,
        register,
        signInWithGoogleRedirect,
        completeGoogleSignIn,
        completeTwoFactorChallenge,
        resetPassword,
        logout,
        stopImpersonating,
        refreshAuth,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
