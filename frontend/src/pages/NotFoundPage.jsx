import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-sm font-medium text-ink-muted">404</p>
      <h1 className="text-xl font-semibold text-ink">Page not found</h1>
      <Link to="/" className="text-sm font-medium text-accent hover:underline">
        Back to the dashboard
      </Link>
    </div>
  );
}
