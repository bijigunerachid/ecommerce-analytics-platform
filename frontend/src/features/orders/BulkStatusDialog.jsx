import { useState } from 'react';
import { ordersApi } from '../../api/endpoints.js';
import { Button } from '../../components/ui/Button.jsx';
import { FormError, TextAreaField } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { errorMessage } from '../../utils/errors.js';
import { ORDER_STATUS_LABELS } from '../../utils/labels.js';

const plural = (n) => `${n} order${n === 1 ? '' : 's'}`;

/**
 * Applies one status to the selected orders. The API changes each order on its own and
 * reports the ones it could not change; those are listed here with the reason.
 */
export function BulkStatusDialog({ status, orderIds, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const cancelling = status === 'cancelled';
  const label = ORDER_STATUS_LABELS[status]?.toLowerCase();

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await ordersApi.bulkUpdateStatus(orderIds, status, note.trim() || undefined);
      onDone(res);
      if (res.failed.length === 0) onClose();
      else setResult(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal
        open
        title={`${plural(result.failed.length)} not changed`}
        onClose={onClose}
        size="sm"
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="space-y-3 text-sm">
          <p className="text-ink-secondary">
            {result.updated.length > 0
              ? `${plural(result.updated.length)} changed to ${label}. These were left as they were:`
              : `No order changed to ${label}:`}
          </p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {result.failed.map((f) => (
              <li key={f.orderId} className="px-3 py-2">
                <span className="font-medium text-ink">Order #{f.orderId}</span>
                <span className="block text-xs text-ink-muted">{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title={
        cancelling
          ? `Cancel ${plural(orderIds.length)}?`
          : `Mark ${plural(orderIds.length)} as ${label}?`
      }
      onClose={onClose}
      busy={busy}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button variant={cancelling ? 'danger' : 'primary'} onClick={apply} disabled={busy}>
            {busy ? 'Saving…' : cancelling ? 'Cancel orders' : `Mark as ${label}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-secondary">
          {cancelling
            ? 'Their items go back into stock. Orders that can no longer be cancelled are skipped.'
            : 'Orders that cannot move to this status are skipped and listed afterwards.'}
        </p>
        <TextAreaField
          label="Note (optional)"
          hint="Saved in each order's history."
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}
