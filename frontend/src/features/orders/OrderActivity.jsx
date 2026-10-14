import { CircleDot, MessageSquareText } from 'lucide-react';
import { useId, useState } from 'react';
import { ordersApi } from '../../api/endpoints.js';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { FormError } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/toast-context.js';
import { errorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { ORDER_STATUS_LABELS } from '../../utils/labels.js';
import { activityItems } from './activity.js';

const NOTE_MAX = 2000;

/** "Ada Admin marked the order as paid", or "Marked as paid" when no staff member is recorded. */
function statusSentence(entry) {
  const who = entry.changedBy?.fullName;
  const status = ORDER_STATUS_LABELS[entry.toStatus].toLowerCase();
  if (entry.fromStatus === null) return who ? `${who} placed the order` : 'Order placed';
  if (entry.toStatus === 'cancelled') return who ? `${who} cancelled the order` : 'Order cancelled';
  return who ? `${who} marked the order as ${status}` : `Marked as ${status}`;
}

function NoteComposer({ orderId, onAdded }) {
  const id = useId();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) {
      setError('Write a note first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await ordersApi.addNote(orderId, body.trim());
      setBody('');
      toast.success('Note added.');
      onAdded();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Add a note
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={NOTE_MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Visible to staff only, e.g. a call with the customer or a delivery detail"
        className="block w-full rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-sm text-ink shadow-card placeholder:text-ink-muted focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
      />
      <FormError>{error}</FormError>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-ink-muted tabular">
          {body.length}/{NOTE_MAX}
        </span>
        <Button type="submit" size="sm" variant="secondary" disabled={saving}>
          {saving ? 'Adding…' : 'Add note'}
        </Button>
      </div>
    </form>
  );
}

export function OrderActivity({ orderId, history, notes, canEdit, onNoteAdded }) {
  const items = activityItems(history, notes);
  return (
    <div className="space-y-5">
      <ol aria-label="Order activity" className="relative space-y-5">
        <span aria-hidden="true" className="absolute top-2 bottom-2 left-3.75 w-px bg-line" />
        {items.map(({ kind, id, at, entry }) => (
          <li key={id} className="relative flex gap-3">
            {kind === 'status' ? (
              <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-line">
                <CircleDot aria-hidden="true" className="size-4 text-accent" />
              </span>
            ) : (
              <span className="relative z-10 shrink-0 rounded-full ring-4 ring-surface">
                <Avatar name={entry.author?.fullName ?? '?'} />
              </span>
            )}
            <div className="min-w-0 flex-1 pt-1">
              {kind === 'status' ? (
                <>
                  <p className="text-sm text-ink">{statusSentence(entry)}</p>
                  {entry.note && <p className="mt-1 text-sm text-ink-secondary">“{entry.note}”</p>}
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 text-sm text-ink">
                    <MessageSquareText aria-hidden="true" className="size-3.5 text-ink-muted" />
                    {entry.author?.fullName ?? 'Former staff member'} added a note
                  </p>
                  <p className="mt-1.5 rounded-lg bg-surface-sunken px-3 py-2 text-sm whitespace-pre-line text-ink">
                    {entry.body}
                  </p>
                </>
              )}
              <p className="mt-1 text-xs text-ink-muted">
                <time dateTime={at}>{formatDateTime(at)}</time>
              </p>
            </div>
          </li>
        ))}
      </ol>
      {canEdit && <NoteComposer orderId={orderId} onAdded={onNoteAdded} />}
    </div>
  );
}
