/** Keeps rows whose name or PZ ID contains the typed text (case-insensitive, trimmed). */
export function filterAttendanceRows<T extends { name: string; pzId: string }>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(q) || r.pzId.toLowerCase().includes(q));
}
