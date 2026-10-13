export function safeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['name', 'label', 'title', 'value']) {
      if (record[key] !== undefined && record[key] !== value) {
        const text = safeText(record[key]);
        if (text) return text;
      }
    }
    try {
      return JSON.stringify(value) ?? '';
    } catch {
      return '';
    }
  }
  return '';
}