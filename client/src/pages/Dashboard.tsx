import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { business } = useAuth();

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Welcome, {business?.name ?? "there"}.
        </h1>
        <p className="font-sans text-sm text-neutral-600">Your account is set up. Invoicing tools are next.</p>
      </div>
    </AppLayout>
  );
}
