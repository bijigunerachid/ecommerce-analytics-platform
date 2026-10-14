import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { RealtimeContext } from './realtime-context.js';

const EVENT_NAMES = ['order', 'notification', 'resync', 'session-ended'];

/**
 * One Server-Sent Events connection per signed-in session (GET /api/stream). The browser
 * reconnects by itself after a drop; on reconnect subscribers get a 'resync' event, because
 * events sent while disconnected are not replayed.
 */
export function RealtimeProvider({ children }) {
  const { status: authStatus, logout } = useAuth();
  const supported = typeof window !== 'undefined' && typeof window.EventSource === 'function';
  const [connection, setConnection] = useState('connecting');
  const listeners = useRef(new Map());

  const emit = useCallback((name, data) => {
    for (const listener of listeners.current.get(name) ?? []) listener(data);
  }, []);

  useEffect(() => {
    if (!supported || authStatus !== 'authenticated') return undefined;
    const source = new window.EventSource(`${API_BASE}/stream`, { withCredentials: true });
    let wasOpen = false;
    source.onopen = () => {
      setConnection('open');
      if (wasOpen) emit('resync', {});
      wasOpen = true;
    };
    source.onerror = () => setConnection('reconnecting');
    for (const name of EVENT_NAMES) {
      source.addEventListener(name, (e) => {
        let data = {};
        try {
          data = JSON.parse(e.data);
        } catch {
          // Ignore malformed events.
        }
        if (name === 'session-ended') {
          source.close();
          logout();
          return;
        }
        emit(name, data);
      });
    }
    return () => {
      source.close();
      setConnection('connecting');
    };
  }, [supported, authStatus, emit, logout]);

  const subscribe = useCallback((name, listener) => {
    const set = listeners.current.get(name) ?? new Set();
    set.add(listener);
    listeners.current.set(name, set);
    return () => set.delete(listener);
  }, []);

  const value = useMemo(
    () => ({ status: supported ? connection : 'unsupported', subscribe }),
    [supported, connection, subscribe],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
