import { X } from 'lucide-react';
import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../../hooks/useDialog.js';
import { IconButton } from './Button.jsx';

const WIDTHS = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl' };

/**
 * A panel that slides in from the side (forms and details without leaving the page). Same
 * contract and keyboard behavior as Modal: labelled by its title, focus trapped inside,
 * Escape and the backdrop close it unless busy, focus returns to the opener. The header and the
 * footer stay in place while the body scrolls.
 */
export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  busy = false,
  size = 'md',
  side = 'right',
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  const closeFromBackdrop = useDialog(panelRef, { open, onClose, busy });

  if (!open) return null;
  const fromLeft = side === 'left';

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
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
        className={`relative flex h-full w-full ${WIDTHS[size]} flex-col bg-surface-raised shadow-pop outline-none ${
          fromLeft
            ? 'animate-drawer-in-left mr-auto border-r border-line'
            : 'animate-drawer-in ml-auto border-l border-line'
        }`}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
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
        <div data-modal-body className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>
        {footer && (
          <footer className="flex flex-col-reverse gap-2 border-t border-line bg-surface-sunken/60 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
