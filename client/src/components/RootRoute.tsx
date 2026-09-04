import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Landing from "../pages/Landing";
import { RouteLoadingFallback } from "./RouteLoadingFallback";

export function RootRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <RouteLoadingFallback />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Landing />;
}
