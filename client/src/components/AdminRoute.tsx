import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { RouteLoadingFallback } from "./RouteLoadingFallback";

function AdminRequires2fa() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-xl font-semibold text-neutral-900">Turn on two-factor authentication</h1>
        <p className="mt-3 font-sans text-sm text-neutral-600">
          Admin access can see every business's data, so it requires two-factor authentication on your account
          first. Set it up from your profile, then come back here.
        </p>
        <Link
          to="/admin/profile"
          className="mt-6 inline-block rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
        >
          Go to your profile
        </Link>
      </div>
    </div>
  );
}

export function AdminRoute() {
  const { user, isLoading } = useAuth();
  const { pathname } = useLocation();

  if (isLoading) {
    return <RouteLoadingFallback />;
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!user.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // /admin/profile is where an admin turns 2FA on in the first place (Profile
  // shows the setup UI only for admins - see Profile.tsx). Gating it behind
  // totpEnabled like every other admin route would trap an admin without 2FA
  // yet: the "go set it up" link would itself bounce back to this same screen.
  if (!user.totpEnabled && pathname !== "/admin/profile") {
    return <AdminRequires2fa />;
  }

  return <Outlet />;
}
