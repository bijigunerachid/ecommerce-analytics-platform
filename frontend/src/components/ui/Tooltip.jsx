import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 350;
const GAP = 8;

/**
 * A short visual hint for a control, shown on hover (after a short delay) and on keyboard focus,
 * hidden with Escape. Hints repeat what the control's accessible name already says (e.g. an icon
 * button's label), so they are not announced twice: role="tooltip" without aria-describedby.
 */
export function Tooltip({ content, side = 'top', className = 'inline-flex', children }) {
  const id = useId();
  const wrapperRef = useRef(null);
  const tipRef = useRef(null);
  const timer = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);

  const show = (delay) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
    setPosition(null);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => {
      setOpen(false);
      setPosition(null);
    };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  // Measure after render, then place next to the trigger, kept inside the viewport.
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current || !tipRef.current) return;
    const t = wrapperRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    let top;
    let left;
    if (side === 'right') {
      top = t.top + t.height / 2 - tip.height / 2;
      left = t.right + GAP;
    } else {
      left = t.left + t.width / 2 - tip.width / 2;
      top =
        side === 'bottom' || t.top - tip.height - GAP < 4
          ? t.bottom + GAP
          : t.top - tip.height - GAP;
    }
    left = Math.min(Math.max(4, left), window.innerWidth - tip.width - 4);
    setPosition({ top, left });
  }, [open, side, content]);

  if (!content) return children;

  return (
    <span
      ref={wrapperRef}
      className={className}
      onMouseEnter={() => show(SHOW_DELAY_MS)}
      onMouseLeave={hide}
      onFocus={(e) => e.target.matches?.(':focus-visible') && show(0)}
      onBlur={hide}
      onClick={hide}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            style={{
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              visibility: position ? 'visible' : 'hidden',
            }}
            className="animate-fade-in pointer-events-none fixed z-70 max-w-64 rounded-md bg-ink px-2 py-1 text-xs font-medium text-page shadow-pop"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
