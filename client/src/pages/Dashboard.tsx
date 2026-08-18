import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { business } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-neutral-50 px-6 text-center">
      <h1 className="font-display text-3xl font-semibold text-neutral-900">
        Welcome, {business?.name ?? "there"}.
      </h1>
      <p className="font-sans text-sm text-neutral-600">Your account is set up. Invoicing tools are next.</p>
    </div>
  );
}
