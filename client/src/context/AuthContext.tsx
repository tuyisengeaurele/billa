import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "../lib/apiClient";
import {
  resetPassword as resetPasswordFirebase,
  signInWithEmail,
  signInWithGoogle as signInWithGoogleFirebase,
  signOutFirebase,
  signUpWithEmail,
} from "../lib/firebaseAuth";

interface User {
  id: string;
  email: string;
}

interface Business {
  id: string;
  name: string;
  onboardingCompletedAt: string | null;
}

interface AuthContextValue {
  user: User | null;
  business: Business | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<Business>;
  register: (email: string, password: string, businessName: string) => Promise<Business>;
  loginWithGoogle: () => Promise<Business>;
  registerWithGoogle: (businessName: string) => Promise<Business>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function exchangeSession(idToken: string, businessName?: string) {
  return apiRequest<{ user: User; business: Business }>("/auth/session", {
    method: "POST",
    body: businessName ? { idToken, businessName } : { idToken },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ user: User; business: Business }>("/auth/me")
      .then((data) => {
        setUser(data.user);
        setBusiness(data.business);
      })
      .catch(() => {
        setUser(null);
        setBusiness(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const idToken = await signInWithEmail(email, password);
    const data = await exchangeSession(idToken);
    setUser(data.user);
    setBusiness(data.business);
    return data.business;
  }

  async function register(email: string, password: string, businessName: string) {
    const idToken = await signUpWithEmail(email, password);
    const data = await exchangeSession(idToken, businessName);
    setUser(data.user);
    setBusiness(data.business);
    return data.business;
  }

  async function loginWithGoogle() {
    const idToken = await signInWithGoogleFirebase();
    const data = await exchangeSession(idToken);
    setUser(data.user);
    setBusiness(data.business);
    return data.business;
  }

  async function registerWithGoogle(businessName: string) {
    const idToken = await signInWithGoogleFirebase();
    const data = await exchangeSession(idToken, businessName);
    setUser(data.user);
    setBusiness(data.business);
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
  }

  return (
    <AuthContext.Provider
      value={{ user, business, isLoading, login, register, loginWithGoogle, registerWithGoogle, resetPassword, logout }}
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
