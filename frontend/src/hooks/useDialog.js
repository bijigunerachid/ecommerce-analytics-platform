import { useEffect, useRef } from 'react';

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared behavior of modal surfaces (dialogs, drawers): while open, focus moves inside (to the
 * first control of `[data-modal-body]`), Tab stays inside, Escape closes unless `busy`, the page
 * behind does not scroll, and focus returns to the opener on close.
 *
 * Forms inside must not use autoFocus: React would move focus before the opener is recorded.
 * `busy` and `onClose` are read at the moment they are needed, so they are never stale.
 */
export function useDialog(panelRef, { open, onClose, busy = false }) {
  const latest = useRef({ onClose, busy });
  useEffect(() => {
    latest.current = { onClose, busy };
  });

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const panel = panelRef.current;
    const body = panel?.querySelector('[data-modal-body]');
    (body?.querySelector(FOCUSABLE) ?? panel?.querySelector(FOCUSABLE) ?? panel)?.focus();

    function onKeyDown(e) {
      if (e.key === 'Escape' && !latest.current.busy) {
        // Only the topmost dialog closes (a confirmation above a drawer, for example).
        const dialogs = document.querySelectorAll('[aria-modal="true"]');
        if (dialogs[dialogs.length - 1] !== panel) return;
        e.stopPropagation();
        latest.current.onClose();
      }
      if (e.key === 'Tab' && panel) {
        const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[inert]'));
        if (items.length === 0) return;
        const [firstItem, lastItem] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open, panelRef]);

  /** Backdrop click handler: closes unless busy. */
  return () => {
    if (!latest.current.busy) latest.current.onClose();
  };
}
