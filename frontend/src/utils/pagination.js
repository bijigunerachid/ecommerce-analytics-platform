/** Page numbers to show: first, last, and two around the current page; null marks a gap. */
export function pageWindow(page, totalPages) {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  for (const p of sorted) {
    if (out.length && p - out[out.length - 1] > 1) out.push(null);
    out.push(p);
  }
  return out;
}
