import { createContext, useContext, useEffect, useRef } from 'react';

export const RealtimeContext = createContext({
  status: 'unsupported',
  subscribe: () => () => {},
});

/** Connection state of the live stream: connecting | open | reconnecting | unsupported. */
export function useRealtimeStatus() {
  return useContext(RealtimeContext).status;
}

/**
 * Calls `handler` for every live event with this name ('order', 'notification', or 'resync',
 * which means events may have been missed and data should be refetched).
 */
export function useRealtimeEvent(name, handler) {
  const { subscribe } = useContext(RealtimeContext);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => subscribe(name, (data) => latest.current(data)), [subscribe, name]);
}
