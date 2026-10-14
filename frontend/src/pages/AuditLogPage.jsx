import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { auditApi, usersApi } from '../api/endpoints.js';
import {
  FilterBar,
  PageHeader,
  ResourceTable,
  SearchInput,
} from '../components/data/ResourceTable.jsx';
import { ExportMenu } from '../components/data/ExportMenu.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Card } from '../components/ui/Card.jsx';
import { FilterSelect } from '../components/ui/Field.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { cleanParams, useListParams } from '../hooks/useListParams.js';
import { formatDateTime } from '../utils/format.js';
import { AUDIT_ACTION_LABELS } from '../utils/labels.js';

const DATE_INPUT =
  'h-9 rounded-lg border border-line-strong bg-surface-raised px-2 text-sm text-ink shadow-card';

const ENTITY_LINKS = {
  order: (id) => `/orders/${id}`,
  product: (id) => `/products/${id}`,
  customer: (id) => `/customers/${id}`,
};

function EntityLink({ entry }) {
  const to = entry.entityId && ENTITY_LINKS[entry.entityType]?.(entry.entityId);
  if (!to) return null;
  return (
    <Link
      to={to}
      onClick={(e) => e.stopPropagation()}
      className="text-xs font-medium text-accent hover:underline"
    >
      Open {entry.entityType}
    </Link>
  );
}

function formatValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The recorded details: changed fields as before → after, anything else as a value. */
function DetailsModal({ entry, onClose }) {
  const rows = Object.entries(entry.details ?? {});
  return (
    <Modal open title={AUDIT_ACTION_LABELS[entry.action] ?? entry.action} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-ink">{entry.summary}</p>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2">
          <dt className="text-ink-muted">When</dt>
          <dd className="text-ink">{formatDateTime(entry.occurredAt)}</dd>
          <dt className="text-ink-muted">Who</dt>
          <dd className="text-ink">{entry.actor?.email ?? 'System'}</dd>
          <dt className="text-ink-muted">IP address</dt>
          <dd className="font-mono text-xs text-ink">{entry.ip ?? '—'}</dd>
        </dl>
        {rows.length > 0 && (
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Recorded details</caption>
            <thead className="text-ink-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 font-medium">
                  Field
                </th>
                <th scope="col" className="py-2 font-medium">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(([field, value]) => {
                const isChange = value && typeof value === 'object' && 'from' in value;
                return (
                  <tr key={field}>
                    <th scope="row" className="py-2 pr-4 align-top font-medium text-ink">
                      {field}
                    </th>
                    <td className="py-2 break-all text-ink-secondary">
                      {isChange ? (
                        <>
                          <span className="line-through decoration-ink-muted">
                            {formatValue(value.from)}
                          </span>{' '}
                          <span aria-hidden="true">→</span>
                          <span className="sr-only">changed to</span>{' '}
                          <span className="text-ink">{formatValue(value.to)}</span>
                        </>
                      ) : (
                        formatValue(value)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

export function AuditLogPage() {
  const [selected, setSelected] = useState(null);
  const { params, update } = useListParams({
    search: '',
    action: '',
    actorId: '',
    dateFrom: '',
    dateTo: '',
  });
  const query = useApiQuery((signal) => auditApi.list(cleanParams(params), { signal }), [params]);
  const usersQuery = useApiQuery((signal) => usersApi.list({ signal }), []);

  const columns = [
    {
      key: 'occurredAt',
      label: 'When',
      className: 'whitespace-nowrap',
      render: (e) => formatDateTime(e.occurredAt),
    },
    {
      key: 'actor',
      label: 'Who',
      render: (e) =>
        e.actor ? (
          <div>
            <p>{e.actor.fullName ?? e.actor.email}</p>
            {e.actor.fullName && <p className="text-xs text-ink-muted">{e.actor.email}</p>}
          </div>
        ) : (
          <span className="text-ink-secondary">System</span>
        ),
    },
    {
      key: 'action',
      label: 'Action',
      render: (e) => <Badge>{AUDIT_ACTION_LABELS[e.action] ?? e.action}</Badge>,
    },
    {
      key: 'summary',
      label: 'What happened',
      render: (e) => (
        <div className="space-y-0.5">
          <p>{e.summary}</p>
          <EntityLink entry={e} />
        </div>
      ),
    },
    {
      key: 'ip',
      label: 'IP address',
      render: (e) => <span className="font-mono text-xs text-ink-secondary">{e.ip ?? '—'}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        icon={ScrollText}
        description="Every sign-in and change, newest first. Entries cannot be edited or deleted."
        actions={<ExportMenu name="audit-log" params={cleanParams(params)} />}
      />
      <Card>
        <FilterBar>
          <SearchInput
            label="Search the audit log"
            placeholder="Search descriptions or emails"
            value={params.search}
            onChange={(search) => update({ search })}
          />
          <FilterSelect
            label="Action"
            value={params.action}
            onChange={(e) => update({ action: e.target.value })}
            options={[
              { value: '', label: 'Any action' },
              ...Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
          <FilterSelect
            label="Staff member"
            value={params.actorId}
            onChange={(e) => update({ actorId: e.target.value })}
            options={[
              { value: '', label: 'Anyone' },
              ...(usersQuery.data?.users ?? []).map((u) => ({
                value: String(u.id),
                label: u.fullName,
              })),
            ]}
          />
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="audit-from">
              From
            </label>
            <input
              id="audit-from"
              type="date"
              className={DATE_INPUT}
              value={params.dateFrom}
              max={params.dateTo || undefined}
              onChange={(e) => update({ dateFrom: e.target.value })}
            />
            <span aria-hidden="true" className="text-ink-muted">
              –
            </span>
            <label className="sr-only" htmlFor="audit-to">
              Until
            </label>
            <input
              id="audit-to"
              type="date"
              className={DATE_INPUT}
              value={params.dateTo}
              min={params.dateFrom || undefined}
              onChange={(e) => update({ dateTo: e.target.value })}
            />
          </div>
        </FilterBar>
        <ResourceTable
          caption="Audit log"
          query={query}
          columns={columns}
          rowKey={(e) => e.id}
          onPageChange={(page) => update({ page })}
          onRowClick={setSelected}
        />
      </Card>
      {selected && <DetailsModal entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
