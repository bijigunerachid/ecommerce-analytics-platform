import { useEffect, useRef, useState } from 'react';

/**
 * Whether an element's content overflows it (so it scrolls). A scrolling box must be reachable
 * by keyboard (WCAG 2.1.1), so callers make it focusable only while it actually scrolls.
 * @returns {[import('react').RefObject<HTMLElement>, boolean]}
 */
export function useIsScrollable() {
  const ref = useRef(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(() => {
      setScrollable(
        element.scrollHeight > element.clientHeight + 1 ||
          element.scrollWidth > element.clientWidth + 1,
      );
    });
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return [ref, scrollable];
}
