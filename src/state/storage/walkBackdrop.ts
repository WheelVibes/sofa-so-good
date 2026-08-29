/**
 * Persistence for the **user-uploaded walk-mode backdrop photo** — the custom
 * equirectangular image shown as `scene.background` when looking out the windows
 * in walk mode (the `custom` backdrop). The blob is stored in IDB under one fixed
 * id so the photo survives a reload, mirroring the floor-plan trace backdrop.
 *
 * Every call is fail-soft: a storage error never propagates (the backdrop is a
 * convenience, not data worth crashing over).
 */
import { UI_INITIAL } from '../slices/uiSlice'
import { useStore } from '../store'
import { IdbAssetStore } from './IdbAssetStore'

const WALK_BACKDROP_ID = 'walk-backdrop-photo'

/** Largest image accepted (bytes) — guards against a giant upload exhausting
 *  storage / GPU memory. ~25 MB comfortably fits a high-res equirect JPG. */
const MAX_WALK_BACKDROP_BYTES = 25 * 1024 * 1024

/** Store (or replace) the uploaded backdrop photo blob. */
export async function persistWalkBackdrop(blob: Blob): Promise<void> {
  try {
    await IdbAssetStore.put({
      assetId: WALK_BACKDROP_ID,
      kind: 'texture',
      mime: blob.type || 'image/jpeg',
      name: 'walk-backdrop-photo',
      uploadedAt: new Date().toISOString(),
      blob,
    })
  } catch {
    // Fail-soft: backdrop persistence is best-effort.
  }
}

/** Read the persisted backdrop blob, or null if none / on error. */
export async function loadWalkBackdrop(): Promise<Blob | null> {
  try {
    const rec = await IdbAssetStore.get(WALK_BACKDROP_ID)
    return rec?.blob ?? null
  } catch {
    return null
  }
}

/** Remove the persisted backdrop photo. */
export async function removeWalkBackdrop(): Promise<void> {
  try {
    await IdbAssetStore.delete(WALK_BACKDROP_ID)
  } catch {
    // ignore
  }
}

/**
 * Apply a user-picked image as the walk-mode backdrop: validate it's an image
 * within the size cap, persist the blob, swap the live object URL into the store
 * and select the `custom` backdrop. Returns an error message on rejection (the
 * caller surfaces it), or null on success.
 */
export async function applyWalkBackdropFile(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return 'Please choose an image file.'
  if (file.size > MAX_WALK_BACKDROP_BYTES) return 'That image is too large (max 25 MB).'
  await persistWalkBackdrop(file)
  const url = URL.createObjectURL(file)
  useStore.getState().setCustomBackdropUrl(url)
  useStore.getState().setBackdrop('custom')
  return null
}

/** Clear the custom walk backdrop everywhere: IDB, the live URL, and the store
 *  (reverting the selection to the app default if `custom` was active). */
export async function clearWalkBackdrop(): Promise<void> {
  await removeWalkBackdrop()
  const s = useStore.getState()
  s.setCustomBackdropUrl(null)
  // Fall back to the APP DEFAULT, not a hardcoded 'city' — dropping the custom
  // photo should return the user to the shipped view (WINDOW-SKY-DEFAULT).
  if (s.backdrop === 'custom') s.setBackdrop(UI_INITIAL.backdrop)
}

/** Boot hydration: if a backdrop photo was persisted, expose it as a live object
 *  URL so a restored `custom` selection renders. Does not change the selected
 *  backdrop kind (that comes from `editorPrefs`). */
export async function hydrateWalkBackdrop(): Promise<void> {
  const blob = await loadWalkBackdrop()
  if (!blob) return
  useStore.getState().setCustomBackdropUrl(URL.createObjectURL(blob))
}
