import { X } from 'lucide-react';
import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../../hooks/useDialog.js';
import { IconButton } from './Button.jsx';

const WIDTHS = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

/**
 * Accessible modal dialog: labelled by its title, focus moves inside on open and returns to
 * the opener on close, Tab stays inside, Escape and the backdrop close it (unless busy).
 * On phones it opens as a bottom sheet.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  busy = false,
  size = 'md',
  icon,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  const closeFromBackdrop = useDialog(panelRef, { open, onClose, busy });

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="animate-fade-in absolute inset-0 bg-overlay backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={closeFromBackdrop}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`animate-sheet-up relative flex max-h-[92dvh] w-full ${WIDTHS[size]} flex-col rounded-t-2xl border border-line bg-surface-raised shadow-pop outline-none sm:rounded-xl`}
      >
        <header className="flex items-start gap-3 px-5 pt-5 pb-2 sm:px-6">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-ink-secondary">
                {description}
              </p>
            )}
          </div>
          <IconButton
            label="Close"
            icon={X}
            size="icon-sm"
            onClick={onClose}
            disabled={busy}
            className="-mt-1 -mr-2"
          />
        </header>
        <div data-modal-body className="overflow-y-auto px-5 py-3 sm:px-6">
          {children}
        </div>
        {footer && (
          <footer className="mt-2 flex flex-col-reverse gap-2 rounded-b-xl border-t border-line bg-surface-sunken/60 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
