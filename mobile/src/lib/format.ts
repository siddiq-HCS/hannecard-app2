export function money(n: number | string | null | undefined): string {
  const v = typeof n === 'number' ? n : Number(n ?? 0);
  if (!Number.isFinite(v)) return '0.00';
  return `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

export function formatDate(iso: string | Date | undefined | null): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-GB');
}

export function formatDateTime(iso: string | Date | undefined | null): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
