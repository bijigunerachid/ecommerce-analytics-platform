import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { FormError, TextAreaField } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { errorMessage } from '../../utils/errors.js';
import { ORDER_ACTION_LABELS } from '../../utils/labels.js';

/**
 * Confirms a status change and takes an optional note for the status history. Stays open and
 * shows the API's error if the change is rejected.
 */
export function StatusChangeDialog({ open, status, title, message, onConfirm, onClose }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cancelling = status === 'cancelled';

  function close() {
    setNote('');
    setError(null);
    onClose();
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(note.trim() || undefined);
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
            {cancelling ? 'Keep order' : 'Back'}
          </Button>
          <Button variant={cancelling ? 'danger' : 'primary'} onClick={confirm} disabled={busy}>
            {busy ? 'Saving…' : ORDER_ACTION_LABELS[status]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-secondary">{message}</p>
        <TextAreaField
          label="Note (optional)"
          hint="Saved in the order's history, e.g. the reason for the change."
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}
