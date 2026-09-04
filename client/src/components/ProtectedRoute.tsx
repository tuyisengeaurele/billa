import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { RouteLoadingFallback } from "./RouteLoadingFallback";

export function ProtectedRoute() {
  const { user, business, isLoading } = useAuth();
  const { pathname } = useLocation();

  if (isLoading) {
    return <RouteLoadingFallback />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (business && !business.onboardingCompletedAt && pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
