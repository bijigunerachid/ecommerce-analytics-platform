import { AUTH_COOKIE_NAME } from '../middleware/auth.js';

export const HEARTBEAT_MS = 25_000;

const EVENT_NAMES = {
  notification: 'notification',
  'order.created': 'order',
  'order.status_changed': 'order',
};

/**
 * GET /api/stream: Server-Sent Events. Sends `notification` and `order` events as they are
 * committed, and a comment every 25 s that keeps proxies from closing the connection. Each
 * heartbeat re-checks the session, so an expired token or a deactivated account ends the stream.
 */
export function createStreamController({ eventHub, authService, heartbeatMs = HEARTBEAT_MS }) {
  return {
    stream(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // nginx: deliver each event immediately instead of buffering the response.
        'X-Accel-Buffering': 'no',
      });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      // Browsers wait this long before reconnecting after the stream drops.
      res.write('retry: 5000\n\n');
      send('ready', { userId: req.user.id });

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        res.end();
      };

      const unsubscribe = eventHub.subscribe({
        onEvent: (event) => {
          const name = EVENT_NAMES[event.type];
          if (name) send(name, event);
        },
        // Events may have been missed while the hub was reconnecting: clients refetch.
        onReconnect: () => send('resync', {}),
        onClose: close,
      });

      const token = req.cookies?.[AUTH_COOKIE_NAME];
      const heartbeat = setInterval(async () => {
        const user = token ? await authService.authenticate(token).catch(() => null) : null;
        if (!user) {
          send('session-ended', {});
          close();
          return;
        }
        res.write(': ping\n\n');
      }, heartbeatMs);

      req.on('close', close);
    },
  };
}
