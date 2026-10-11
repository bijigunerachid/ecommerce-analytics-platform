import { LoaderCircle } from 'lucide-react';

export function Spinner({ label = 'Loading', className = '' }) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 text-ink-secondary ${className}`}
    >
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function FullPageSpinner({ label }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page">
      <Spinner label={label} className="[&_svg]:size-6" />
    </div>
  );
}
