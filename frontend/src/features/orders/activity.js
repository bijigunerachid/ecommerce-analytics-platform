/** Status changes and staff notes, merged into one list, oldest first. */
export function activityItems(history = [], notes = []) {
  return [
    ...history.map((h) => ({ kind: 'status', id: `s${h.id}`, at: h.changedAt, entry: h })),
    ...notes.map((n) => ({ kind: 'note', id: `n${n.id}`, at: n.createdAt, entry: n })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
}
