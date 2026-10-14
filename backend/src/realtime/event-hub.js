import pg from 'pg';

export const CHANNEL = 'app_events';
const MAX_BACKOFF_MS = 30_000;

/**
 * Forwards PostgreSQL notifications on the app_events channel (sent by triggers when an order
 * event or a notification is written) to in-process subscribers, i.e. the open SSE streams.
 *
 * Uses one dedicated connection (LISTEN needs a session, so not a pooled client). It connects
 * when the first subscriber arrives and reconnects with backoff if the connection drops;
 * events sent while it is disconnected are missed, and clients refetch on reconnect.
 */
export function createEventHub({ dbConfig, log = console }) {
  const subscribers = new Set();
  let client = null;
  let connecting = null;
  let stopped = false;
  let backoffMs = 1000;
  let retryTimer = null;

  function dispatch(message) {
    let event;
    try {
      event = JSON.parse(message.payload);
    } catch {
      log.warn?.(`Ignoring malformed ${CHANNEL} payload`);
      return;
    }
    for (const subscriber of subscribers) subscriber.onEvent(event);
  }

  function scheduleReconnect() {
    if (stopped || retryTimer || subscribers.size === 0) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect().catch(() => {});
    }, backoffMs);
    retryTimer.unref?.();
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }

  async function connect() {
    if (client || connecting || stopped) return connecting;
    connecting = (async () => {
      const next = new pg.Client(dbConfig);
      next.on('notification', dispatch);
      next.on('error', (err) => {
        log.error?.(`Event hub connection error: ${err.message}`);
      });
      next.on('end', () => {
        if (client === next) client = null;
        scheduleReconnect();
      });
      try {
        await next.connect();
        await next.query(`LISTEN ${CHANNEL}`);
        client = next;
        backoffMs = 1000;
        for (const subscriber of subscribers) subscriber.onReconnect?.();
      } catch (err) {
        log.error?.(`Event hub could not listen: ${err.message}`);
        await next.end().catch(() => {});
        scheduleReconnect();
      } finally {
        connecting = null;
      }
    })();
    return connecting;
  }

  return {
    /**
     * @param {{ onEvent: (event: object) => void, onReconnect?: () => void, onClose?: () => void }} subscriber
     * @returns {() => void} unsubscribe
     */
    subscribe(subscriber) {
      subscribers.add(subscriber);
      connect().catch(() => {});
      return () => subscribers.delete(subscriber);
    },

    /** Resolves once the hub is listening (used by tests and readiness checks). */
    async ready() {
      await connect();
      return client !== null;
    },

    get subscriberCount() {
      return subscribers.size;
    },

    /** Closes every stream and the connection (graceful shutdown). */
    async stop() {
      stopped = true;
      clearTimeout(retryTimer);
      for (const subscriber of [...subscribers]) subscriber.onClose?.();
      subscribers.clear();
      await connecting?.catch(() => {});
      const current = client;
      client = null;
      await current?.end().catch(() => {});
    },
  };
}
