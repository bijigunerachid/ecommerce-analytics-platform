import { FORMATS, csvHeader, csvRows } from '../exports/csv.js';
import { HttpError, badRequest, forbidden, notFound } from '../utils/http-error.js';

export const MAX_EXPORT_ROWS = 100_000;
const PAGE_SIZE = 1000;

/**
 * GET /api/exports/:resource.csv?format=csv|excel&<list filters>
 *
 * Streams the rows matching the same filters as the list view, page by page, so memory use
 * stays flat. Larger exports than MAX_EXPORT_ROWS are refused up front (narrow the filters).
 * Rows are read in pages: a change made during a long export can shift a row between pages.
 */
export function createExportsController({ definitions, maxRows = MAX_EXPORT_ROWS }) {
  return {
    async download(req, res) {
      const match = /^([a-z-]+)\.csv$/.exec(req.params.file);
      const definition = match && Object.hasOwn(definitions, match[1]) && definitions[match[1]];
      if (!definition) throw notFound('Unknown export');
      if (definition.adminOnly && req.user.role !== 'admin') throw forbidden();

      const formatName = req.query.format ?? 'csv';
      const format = Object.hasOwn(FORMATS, formatName) && FORMATS[formatName];
      if (!format) {
        throw badRequest('Request validation failed', [
          { location: 'query', path: 'format', message: 'format must be csv or excel' },
        ]);
      }
      const parsed = definition.query.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest(
          'Request validation failed',
          parsed.error.issues.map((i) => ({
            location: 'query',
            path: i.path.join('.'),
            message: i.message,
          })),
        );
      }
      const query = parsed.data;

      // First page before any output, so errors and "too large" still become JSON responses.
      const first = await definition.fetchPage(query, 1, PAGE_SIZE);
      if (first.total > maxRows) {
        throw new HttpError(
          400,
          'EXPORT_TOO_LARGE',
          `This export has ${first.total} rows; the limit is ${maxRows}. Narrow the filters.`,
        );
      }

      const day = new Date().toISOString().slice(0, 10);
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${match[1]}-${day}.csv"`,
        'Cache-Control': 'no-store',
      });
      res.write(csvHeader(definition.columns, format));
      res.write(csvRows(first.rows, definition.columns, format));
      let written = first.rows.length;
      for (let page = 2; !first.complete && written < first.total; page += 1) {
        const next = await definition.fetchPage(query, page, PAGE_SIZE);
        if (next.rows.length === 0) break;
        res.write(csvRows(next.rows, definition.columns, format));
        written += next.rows.length;
      }

      await req.audit({
        action: 'export.downloaded',
        entityType: match[1].replaceAll('-', '_'),
        summary: `Exported ${written} ${definition.label} (${formatName === 'excel' ? 'Excel' : 'CSV'})`,
        details: { export: match[1], format: formatName, rows: written, filters: req.query },
      });
      res.end();
    },
  };
}
