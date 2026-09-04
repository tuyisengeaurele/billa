import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { RouteLoadingFallback } from "./RouteLoadingFallback";

export function AdminRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <RouteLoadingFallback />;
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!user.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
