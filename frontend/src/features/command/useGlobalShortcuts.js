import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

function isTyping(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

const SEQUENCE_TIMEOUT_MS = 1200;

/**
 * App-wide keyboard shortcuts:
 * - Ctrl/⌘ K (anywhere) or "/" (outside fields): open the command palette
 * - "?": show the shortcut list
 * - "g" then a page key (see navigation.js): go to that page
 * Single-key shortcuts are ignored while typing and while a dialog is open.
 */
export function useGlobalShortcuts({ items, onOpenPalette, onOpenHelp }) {
  const navigate = useNavigate();
  const pendingG = useRef(0);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenPalette();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTyping(e.target) || document.querySelector('[aria-modal="true"]')) return;

      if (Date.now() - pendingG.current < SEQUENCE_TIMEOUT_MS) {
        pendingG.current = 0;
        const item = items.find((i) => i.key === e.key.toLowerCase());
        if (item) {
          e.preventDefault();
          navigate(item.to);
        }
        return;
      }
      if (e.key === 'g') pendingG.current = Date.now();
      else if (e.key === '/') {
        e.preventDefault();
        onOpenPalette();
      } else if (e.key === '?') {
        e.preventDefault();
        onOpenHelp();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items, navigate, onOpenPalette, onOpenHelp]);
}
