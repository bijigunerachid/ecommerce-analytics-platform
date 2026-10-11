import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { RANGE_PRESETS } from '../../hooks/useDateRange.js';

const MAX_DAYS = 366;

/** Presets plus a custom from/to range. Applies to every panel on the dashboard. */
export function DateRangeControl({ range }) {
  const [editing, setEditing] = useState(range.preset === 'custom');
  const [draft, setDraft] = useState({ from: range.from, to: range.to });
  const [error, setError] = useState(null);

  const options = [
    ...RANGE_PRESETS.map((p) => ({ value: p.id, label: p.label.replace('Last ', '') })),
    { value: 'custom', label: 'Custom' },
  ];

  function choose(value) {
    if (value === 'custom') {
      setDraft({ from: range.from, to: range.to });
      setEditing(true);
      return;
    }
    setEditing(false);
    setError(null);
    range.setPreset(value);
  }

  function apply(e) {
    e.preventDefault();
    const days = (new Date(draft.to) - new Date(draft.from)) / 86_400_000 + 1;
    if (!draft.from || !draft.to) return setError('Choose both dates.');
    if (draft.from > draft.to) return setError('The start date must be before the end date.');
    if (days > MAX_DAYS) return setError(`Choose at most ${MAX_DAYS} days.`);
    setError(null);
    range.setCustom(draft.from, draft.to);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label="Date range"
        size="md"
        options={options}
        value={editing ? 'custom' : range.preset}
        onChange={choose}
      />
      {editing && (
        <form onSubmit={apply} className="flex flex-wrap items-center gap-2" noValidate>
          <label className="sr-only" htmlFor="range-from">
            From
          </label>
          <input
            id="range-from"
            type="date"
            value={draft.from}
            max={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            className="h-9 rounded-lg border border-line-strong bg-surface-raised px-2 text-sm text-ink"
          />
          <span aria-hidden="true" className="text-ink-muted">
            –
          </span>
          <label className="sr-only" htmlFor="range-to">
            To
          </label>
          <input
            id="range-to"
            type="date"
            value={draft.to}
            min={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="h-9 rounded-lg border border-line-strong bg-surface-raised px-2 text-sm text-ink"
          />
          <Button type="submit" size="sm" variant="secondary">
            Apply
          </Button>
          {error && (
            <p role="alert" className="w-full text-xs text-text-critical">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
