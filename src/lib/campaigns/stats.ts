/** Unique recipients as a percentage of emails accepted for sending. */
export function campaignRate(count: number, sent: number): string {
  if (sent <= 0) return '—';
  return `${Math.min(100, Math.max(0, count / sent * 100)).toLocaleString('en-US', {maximumFractionDigits: 1})}%`;
}
