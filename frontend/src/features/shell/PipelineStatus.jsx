import { CircleAlert, CircleCheck, CircleHelp, CircleX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pipelineApi } from '../../api/endpoints.js';
import { useApiQuery } from '../../hooks/useApiQuery.js';

const POLL_MS = 30_000;

const STATES = {
  healthy: { icon: CircleCheck, tone: 'text-status-good', label: 'Pipeline healthy' },
  degraded: { icon: CircleAlert, tone: 'text-status-warning', label: 'Pipeline degraded' },
  unhealthy: { icon: CircleX, tone: 'text-status-critical', label: 'Pipeline down' },
  unknown: { icon: CircleHelp, tone: 'text-ink-muted', label: 'Pipeline status unknown' },
};

/**
 * Live data-pipeline indicator for the sidebar (relay + stream processor), refreshed every
 * 30 seconds. Status is shown with an icon and a label, never color alone.
 */
export function PipelineStatus({ collapsed = false }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), POLL_MS);
    return () => clearInterval(timer);
  }, []);
  const query = useApiQuery((signal) => pipelineApi.health({ signal }), [tick]);

  const state = STATES[query.data?.status] ?? STATES.unknown;
  const lag = query.data?.components?.find((c) => c.component === 'spark-streaming')?.details
    ?.kafkaLag;
  const Icon = state.icon;
  const detail =
    query.data && typeof lag === 'number' ? `Kafka lag ${lag.toLocaleString()}` : 'Relay · Spark';

  return (
    <div
      role="status"
      aria-label={state.label}
      title={collapsed ? state.label : undefined}
      className={`flex items-center gap-2.5 rounded-lg border border-line bg-surface-raised ${
        collapsed ? 'justify-center p-2' : 'px-3 py-2'
      }`}
    >
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        {query.data?.status === 'healthy' && (
          <span
            aria-hidden="true"
            className="absolute inline-flex size-3 animate-ping rounded-full bg-status-good/40 motion-reduce:hidden"
          />
        )}
        <Icon aria-hidden="true" className={`relative size-4 ${state.tone}`} />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-xs font-medium text-ink">{state.label}</span>
          <span className="block truncate text-[11px] text-ink-muted">{detail}</span>
        </span>
      )}
    </div>
  );
}
