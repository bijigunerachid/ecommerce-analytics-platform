import { Check, X } from 'lucide-react';
import { formatDateTime } from '../../utils/format.js';

const STEPS = [
  { status: 'pending', label: 'Placed' },
  { status: 'paid', label: 'Paid' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'delivered', label: 'Delivered' },
];

/** When the order entered each status (latest entry wins), from the status history. */
function reachedAt(history) {
  return Object.fromEntries((history ?? []).map((h) => [h.toStatus, h.changedAt]));
}

/**
 * Where the order is in its lifecycle: placed → paid → shipped → delivered, with the time
 * each step was reached. A cancelled order ends in a cancelled step after the last step it
 * reached. The lifecycle is a real sequence, so the steps are numbered.
 */
export function OrderProgress({ status, history, createdAt }) {
  const times = { pending: createdAt, ...reachedAt(history) };
  const cancelled = status === 'cancelled';
  const currentIndex = cancelled
    ? Math.max(...STEPS.map((s, i) => (times[s.status] ? i : 0)))
    : STEPS.findIndex((s) => s.status === status);
  const steps = cancelled
    ? [...STEPS.slice(0, currentIndex + 1), { status: 'cancelled', label: 'Cancelled' }]
    : STEPS;

  return (
    <ol aria-label="Order progress" className="grid gap-y-4 sm:flex sm:items-start">
      {steps.map((step, i) => {
        const done = cancelled ? i < steps.length - 1 : i < currentIndex;
        const current = cancelled ? step.status === 'cancelled' : i === currentIndex;
        const upcoming = !done && !current;
        const time = times[step.status];
        const last = i === steps.length - 1;
        return (
          <li
            key={step.status}
            aria-current={current ? 'step' : undefined}
            className="relative flex gap-3 sm:flex-1 sm:flex-col sm:gap-2.5"
          >
            {!last && (
              <span
                aria-hidden="true"
                className={`absolute top-8 bottom-[-1rem] left-3.75 w-0.5 sm:top-3.75 sm:right-0 sm:bottom-auto sm:left-9 sm:h-0.5 sm:w-auto ${
                  done ? 'bg-accent' : 'bg-line'
                }`}
              />
            )}
            <span
              className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular ${
                step.status === 'cancelled'
                  ? 'bg-status-critical text-white'
                  : done
                    ? 'bg-accent-fill text-on-accent'
                    : current
                      ? 'bg-surface-raised text-accent ring-2 ring-accent'
                      : 'bg-surface-sunken text-ink-muted ring-1 ring-line'
              }`}
            >
              {step.status === 'cancelled' ? (
                <X aria-hidden="true" className="size-4" />
              ) : done ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                i + 1
              )}
            </span>
            <span className="min-w-0 pr-4">
              <span
                className={`block text-sm font-medium ${upcoming ? 'text-ink-muted' : 'text-ink'}`}
              >
                {step.label}
                {done && <span className="sr-only"> (done)</span>}
                {current && <span className="sr-only"> (current)</span>}
              </span>
              <span className="block text-xs text-ink-muted">
                {time && !upcoming ? formatDateTime(time) : upcoming ? 'Not yet' : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
