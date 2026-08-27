import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Modal } from "./Modal";

interface UserMenuProps {
  profileHref: string;
  logoutConfirmMessage: string;
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 17l5-5-5-5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12H9" />
    </svg>
  );
}

export function UserMenu({ profileHref, logoutConfirmMessage }: UserMenuProps) {
  const { user, logout } = useAuth();
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  if (!user) return null;

  const displayName = user.name ?? user.email;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-1">
      <Link
        to={profileHref}
        className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-neutral-100"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 font-display text-sm font-semibold text-primary-700">
            {initial}
          </span>
        )}
        <span className="hidden font-sans text-sm font-medium text-neutral-800 sm:block">{displayName}</span>
      </Link>

      <button
        type="button"
        onClick={() => setIsLogoutConfirmOpen(true)}
        aria-label="Log out"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-error-bg hover:text-error"
      >
        <LogoutIcon />
      </button>

      <Modal isOpen={isLogoutConfirmOpen} onClose={() => setIsLogoutConfirmOpen(false)} title="Log out">
        <p className="font-sans text-sm text-neutral-600">{logoutConfirmMessage}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsLogoutConfirmOpen(false)}
            className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogoutConfirmOpen(false);
              logout();
            }}
            className="rounded-lg bg-error px-4 py-2 font-sans text-sm font-semibold text-white hover:opacity-90"
          >
            Log out
          </button>
        </div>
      </Modal>
    </div>
  );
}
