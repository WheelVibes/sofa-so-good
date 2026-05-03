const KIB = 1024;
const MIB = 1024 * 1024;

/**
 * Format a byte count for display on a catalog card. Returns `123 B` for
 * sub-KB, rounded `850 KB` for sub-MB, and one-decimal `1.2 MB` for ≥1 MB.
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < KIB) return `${Math.round(n)} B`;
  if (n < MIB) return `${Math.round(n / KIB)} KB`;
  return `${(n / MIB).toFixed(1)} MB`;
}
