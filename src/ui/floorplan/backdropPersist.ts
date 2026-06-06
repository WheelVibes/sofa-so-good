import { IdbAssetStore } from '../../state/storage/IdbAssetStore'

/**
 * Persistence for the floor-plan trace backdrop (the reference photo/scan the
 * user draws walls over). The image blob + its calibration (real-world scale,
 * opacity, world offset) are stored in IDB under one fixed id so the backdrop
 * survives closing the editor and reloading the app — previously it lived only
 * in an in-session object URL and was lost on either.
 *
 * Every call is fail-soft: a storage error never propagates to the editor (the
 * backdrop is a convenience, not data worth crashing over).
 */

const BACKDROP_ID = 'floorplan-backdrop'

/** Calibration + display metadata stored alongside the blob. */
export interface BackdropMeta {
  /** Natural pixel dimensions of the image. */
  w: number
  h: number
  /** Overlay opacity (0–1). */
  opacity: number
  /** Metres per image pixel (calibrated via the Scale tool). */
  mPerPx: number
  /** World position (m) of the image's top-left corner. */
  ox: number
  oz: number
}

export interface PersistedBackdrop {
  blob: Blob
  mime: string
  meta: BackdropMeta
}

function toMeta(
  raw: Record<string, string | number | boolean | undefined> | undefined,
): BackdropMeta {
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    w: n(raw?.w, 0),
    h: n(raw?.h, 0),
    opacity: n(raw?.opacity, 0.5),
    mPerPx: n(raw?.mPerPx, 0.01),
    ox: n(raw?.ox, 0),
    oz: n(raw?.oz, 0),
  }
}

/** Store (or replace) the backdrop blob + calibration. */
export async function persistBackdrop(blob: Blob, meta: BackdropMeta): Promise<void> {
  try {
    await IdbAssetStore.put({
      assetId: BACKDROP_ID,
      kind: 'texture',
      mime: blob.type || 'image/png',
      name: 'floor-plan-backdrop',
      uploadedAt: new Date().toISOString(),
      blob,
      meta: { ...meta },
    })
  } catch {
    // Fail-soft: backdrop persistence is best-effort.
  }
}

/** Update only the calibration (keeps the stored blob). No-op if none stored. */
export async function updateBackdropMeta(meta: BackdropMeta): Promise<void> {
  try {
    const existing = await IdbAssetStore.get(BACKDROP_ID)
    if (!existing) return
    await IdbAssetStore.put({
      ...existing,
      meta: { ...meta },
      uploadedAt: new Date().toISOString(),
    })
  } catch {
    // ignore
  }
}

/** Read the persisted backdrop, or null if none / on error. */
export async function readPersistedBackdrop(): Promise<PersistedBackdrop | null> {
  try {
    const rec = await IdbAssetStore.get(BACKDROP_ID)
    if (!rec?.blob) return null
    return { blob: rec.blob, mime: rec.mime, meta: toMeta(rec.meta) }
  } catch {
    return null
  }
}

/** Remove the persisted backdrop. */
export async function removePersistedBackdrop(): Promise<void> {
  try {
    await IdbAssetStore.delete(BACKDROP_ID)
  } catch {
    // ignore
  }
}
