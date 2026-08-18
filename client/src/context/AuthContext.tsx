import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "../lib/apiClient";

interface User {
  id: string;
  email: string;
}

interface Business {
  id: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  business: Business | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, businessName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
    const data = await apiRequest<{ user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setUser(data.user);
    const me = await apiRequest<{ business: Business }>("/auth/me");
    setBusiness(me.business);
  }

  async function register(email: string, password: string, businessName: string) {
    const data = await apiRequest<{ user: User; business: Business }>("/auth/register", {
      method: "POST",
      body: { email, password, businessName },
    });
    setUser(data.user);
    setBusiness(data.business);
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" });
    setUser(null);
    setBusiness(null);
  }

  return (
    <AuthContext.Provider value={{ user, business, isLoading, login, register, logout }}>
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
