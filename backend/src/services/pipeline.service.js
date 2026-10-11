import { HEARTBEAT_COMPONENT } from '../outbox/outbox-relay.js';

// A component that has not reported within this window is considered down.
const HEARTBEAT_STALE_SECONDS = 30;
// Events waiting longer than this mean the pipeline is falling behind.
const PENDING_AGE_WARNING_SECONDS = 60;

function componentStatus(heartbeat) {
  if (!heartbeat) return 'unknown';
  if (heartbeat.ageSeconds > HEARTBEAT_STALE_SECONDS) return 'down';
  if (heartbeat.details?.status === 'error') return 'degraded';
  if (heartbeat.details?.status === 'stopped') return 'down';
  return 'up';
}

export function createPipelineService({ pipelineRepository }) {
  return {
    async health() {
      const [outbox, heartbeats] = await Promise.all([
        pipelineRepository.outboxStats(),
        pipelineRepository.listHeartbeats(),
      ]);

      const components = heartbeats.map((hb) => ({
        component: hb.component,
        status: componentStatus(hb),
        lastSeenAt: hb.lastSeenAt,
        details: hb.details,
      }));
      let relay = components.find((c) => c.component === HEARTBEAT_COMPONENT);
      if (!relay) {
        // The relay has never reported; list it anyway so its absence is visible.
        relay = {
          component: HEARTBEAT_COMPONENT,
          status: 'unknown',
          lastSeenAt: null,
          details: {},
        };
        components.unshift(relay);
      }

      const behind = (outbox.oldestPendingAgeSeconds ?? 0) > PENDING_AGE_WARNING_SECONDS;
      let status = 'healthy';
      if (relay.status !== 'up' || behind || outbox.failing > 0) status = 'degraded';
      if (relay.status === 'down' && outbox.pending > 0) status = 'unhealthy';

      return {
        status,
        outbox,
        components,
        checkedAt: new Date().toISOString(),
      };
    },
  };
}
