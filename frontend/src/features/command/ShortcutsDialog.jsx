import { Kbd } from '../../components/ui/Kbd.jsx';
import { modKeyLabel } from '../../utils/platform.js';
import { Modal } from '../../components/ui/Modal.jsx';

function Row({ keys, children }) {
  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-ink-secondary">{children}</span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((k, i) =>
          k === 'then' ? (
            <span key={i} className="px-0.5 text-xs text-ink-muted">
              then
            </span>
          ) : (
            <Kbd key={i}>{k}</Kbd>
          ),
        )}
      </span>
    </li>
  );
}

/** Lists the keyboard shortcuts (opened with "?"). */
export function ShortcutsDialog({ open, onClose, items }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" size="sm">
      <div className="space-y-4">
        <section>
          <h3 className="text-sm font-medium text-ink">General</h3>
          <ul className="divide-y divide-line">
            <Row keys={[modKeyLabel(), 'K']}>Open the command palette</Row>
            <Row keys={['/']}>Search</Row>
            <Row keys={['?']}>Show this list</Row>
            <Row keys={['Esc']}>Close a dialog or menu</Row>
          </ul>
        </section>
        <section>
          <h3 className="text-sm font-medium text-ink">Go to</h3>
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <Row key={item.to} keys={['G', 'then', item.key.toUpperCase()]}>
                {item.label}
              </Row>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
