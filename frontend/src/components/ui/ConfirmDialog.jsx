import { useState } from 'react';
import { errorMessage } from '../../utils/errors.js';
import { Button } from './Button.jsx';
import { FormError } from './Field.jsx';
import { Modal } from './Modal.jsx';

/**
 * Asks for confirmation, runs `onConfirm`, and shows its error (e.g. "still in use") in place.
 * Closes only when the action succeeds.
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

  return (
    <Modal
      open={open}
      title={title}
      onClose={close}
      busy={busy}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={confirm} disabled={busy}>
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
