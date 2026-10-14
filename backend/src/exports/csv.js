// CSV output (RFC 4180) that is also safe to open in spreadsheet programs.

// UTF-8 byte order mark (written as a code point so it stays visible in the source).
const BOM = String.fromCodePoint(0xfeff);

export const FORMATS = {
  // Plain CSV for tools and scripts.
  csv: { delimiter: ',', bom: false },
  // For Excel: a byte order mark so it reads UTF-8 (accented names), and semicolons, which
  // Excel expects in locales that use a decimal comma.
  excel: { delimiter: ';', bom: true },
};

// A cell starting with one of these is run as a formula by spreadsheet programs (CSV
// injection). Text cells get a leading apostrophe, which shows the text as typed.
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Formats one value. `type` is 'text' (sanitized against formulas), 'number', 'date'
 * (ISO 8601 UTC), or 'boolean'. Numbers and money stay as-is, so negative values keep working.
 */
export function formatCell(value, type, delimiter) {
  if (value === null || value === undefined) return '';
  let text;
  if (type === 'date') text = new Date(value).toISOString();
  else if (type === 'boolean') text = value ? 'true' : 'false';
  else if (type === 'number') text = String(value);
  else {
    text = String(value);
    if (FORMULA_START.test(text)) text = `'${text}`;
  }
  return /["\r\n]/.test(text) || text.includes(delimiter)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

/**
 * @param {{ key: string, label: string, type?: string, value?: (row) => unknown }[]} columns
 */
export function csvHeader(columns, { delimiter, bom }) {
  const line = columns.map((c) => formatCell(c.label, 'text', delimiter)).join(delimiter);
  return `${bom ? BOM : ''}${line}\r\n`;
}

export function csvRows(rows, columns, { delimiter }) {
  return rows
    .map(
      (row) =>
        columns
          .map((c) => formatCell(c.value ? c.value(row) : row[c.key], c.type ?? 'text', delimiter))
          .join(delimiter) + '\r\n',
    )
    .join('');
}
