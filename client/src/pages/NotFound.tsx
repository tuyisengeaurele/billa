import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-page px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500">
        <img src="/logo.png" alt="" className="h-6 w-6" style={{ filter: "brightness(0) invert(1)" }} />
      </span>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Page not found</h1>
      <p className="max-w-sm font-sans text-sm text-neutral-600">
        The page you're looking for doesn't exist, or the link may be out of date.
      </p>
      <Link
        to="/"
        className="mt-2 rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
      >
        Go to Billa
      </Link>
    </div>
  );
}
