import { CircleAlert, Lightbulb } from 'lucide-react';
import { analyticsApi } from '../api/endpoints.js';
import { PageHeader } from '../components/data/ResourceTable.jsx';
import { QueryState } from '../components/ui/States.jsx';
import { CohortsPanel } from '../features/insights/CohortsPanel.jsx';
import { ForecastPanel } from '../features/insights/ForecastPanel.jsx';
import { SegmentsPanel } from '../features/insights/SegmentsPanel.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { formatDateTime, formatRelative } from '../utils/format.js';

function RunStatus({ run }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">
        {run.computedAt ? (
          <span title={formatDateTime(run.computedAt)}>
            Computed by Spark {formatRelative(run.computedAt)}. Recomputed every 30 minutes.
          </span>
        ) : (
          'Not computed yet: Spark computes these about a minute after the stream starts, then every 30 minutes.'
        )}
      </p>
      {run.lastError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-status-warning/50 bg-status-warning/10 px-3 py-2 text-sm text-ink"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-warning" />
          <span>
            The latest run failed {formatRelative(run.lastError.at)}: {run.lastError.message}.
            {run.computedAt ? ' Showing the last successful results.' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

/** Forecast, customer segments, and repeat purchases, computed by the Spark insights job. */
export function InsightsPage() {
  const segments = useApiQuery((signal) => analyticsApi.segments({ signal }), []);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        icon={Lightbulb}
        description="Where sales are heading, who your best customers are, and how often customers come back."
      />
      <QueryState query={segments} height="h-96">
        {(data) => (
          <>
            <RunStatus run={data.run} />
            <ForecastPanel />
            <SegmentsPanel data={data} />
            <CohortsPanel />
          </>
        )}
      </QueryState>
    </div>
  );
}
