/**
 * Small per-save-slot thumbnails, stored separately from the layout JSON (the
 * StorageAdapter stays JSON-only by design). A downscaled JPEG of the canvas is
 * kept in localStorage and shown in the Load dialog so saved designs are
 * recognisable at a glance.
 */
const key = (slot: string) => `sofa-so-good:thumb:${slot}`;

/** Capture the live WebGL canvas, downscaled, as a JPEG data URL (or null). */
export function captureThumb(): string | null {
  const canvas = document.querySelector('canvas');
  if (!canvas) return null;
  try {
    const w = 240;
    const h = Math.max(1, Math.round((w * canvas.height) / canvas.width));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(canvas, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.6);
  } catch {
    return null; // tainted canvas / unsupported
  }
}

export function saveThumb(slot: string, data: string | null): void {
  if (!data) return;
  try {
    localStorage.setItem(key(slot), data);
  } catch {
    /* quota — thumbnails are best-effort */
  }
}

export function getThumb(slot: string): string | null {
  try {
    return localStorage.getItem(key(slot));
  } catch {
    return null;
  }
}

export function deleteThumb(slot: string): void {
  try {
    localStorage.removeItem(key(slot));
  } catch {
    /* ignore */
  }
}
