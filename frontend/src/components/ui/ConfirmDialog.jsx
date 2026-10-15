import { CircleHelp, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../utils/errors.js';
import { Button } from './Button.jsx';
import { FormError } from './Field.jsx';
import { Modal } from './Modal.jsx';

/**
 * Asks for confirmation, runs `onConfirm`, and shows its error (e.g. "still in use") in place.
 * Closes only when the action succeeds. Destructive actions (`danger`) get a warning icon and
 * a red confirm button.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onClose,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function close() {
    setError(null);
    onClose();
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const Icon = danger ? TriangleAlert : CircleHelp;
  return (
    <Modal
      open={open}
      title={title}
      onClose={close}
      busy={busy}
      size="sm"
      icon={
        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
            danger ? 'bg-status-critical/10 text-text-critical' : 'bg-accent-soft text-accent'
          }`}
        >
          <Icon className="size-4.5" />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={confirm} loading={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-secondary">{message}</p>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}
