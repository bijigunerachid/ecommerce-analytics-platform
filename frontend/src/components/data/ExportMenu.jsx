import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { exportsApi } from '../../api/endpoints.js';
import { saveFile } from '../../utils/download.js';
import { errorMessage } from '../../utils/errors.js';
import { buttonClass } from '../ui/button-styles.js';
import { Menu } from '../ui/Menu.jsx';
import { useToast } from '../ui/toast-context.js';

/**
 * "Export" menu for a list or report: downloads every row matching `params` (the filters on
 * screen) as CSV, or as CSV laid out for Excel.
 */
export function ExportMenu({ name, params = {}, label = 'Export' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(format) {
    setBusy(true);
    try {
      const file = await exportsApi.download(name, params, format);
      saveFile(file);
      toast.success(`Downloaded ${file.filename}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Menu
      label={label}
      items={[
        { label: 'CSV', icon: FileText, onSelect: () => run('csv') },
        { label: 'CSV for Excel', icon: FileSpreadsheet, onSelect: () => run('excel') },
      ]}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          disabled={busy}
          className={buttonClass('secondary', 'md', 'gap-2')}
        >
          <Download aria-hidden="true" className="size-4" />
          {busy ? 'Exporting…' : label}
          <ChevronDown aria-hidden="true" className="size-4 text-ink-muted" />
        </button>
      )}
    />
  );
}
