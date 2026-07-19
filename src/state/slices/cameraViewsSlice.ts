import { cameraPose } from '../../scene/cameras/cameraForward'
import { suggestViews } from '../../scene/cameras/suggestViews'
import type { RootState } from '../store'
import type { SliceCreator } from './types'
import type { LightsMode } from './uiSlice'

/** A saved orbit-camera bookmark: a named position + look-at target, plus the
 *  lighting state so a "shot" reproduces the full look (angle + ambiance). */
export interface SavedView {
  id: string
  name: string
  /** Camera world position [x, y, z]. */
  pos: [number, number, number]
  /** OrbitControls look-at target [x, y, z]. */
  target: [number, number, number]
  /** Optional small JPEG data-URL preview of the view (captured at save time). */
  thumb?: string
  /** Optional captured lighting (added later; absent = don't touch lighting). */
  mode?: 'system' | 'manual'
  hour?: number
  lights?: LightsMode
  /** Optional presenter note shown as a caption in presentation mode. */
  note?: string
  /** Present this view as an interactive 360° panorama slide (captured live
   *  from the view's pose when the slide is reached). Optional + additive —
   *  older persisted views simply have no flag. */
  pano?: boolean
}

const LS_KEY = 'hdb_camera_views'
const MAX_VIEWS = 12

/**
 * Saved camera views ("bookmarks") — a competitor-parity QOL feature letting the
 * user snapshot a favourite angle of the flat and jump back to it. The live pose
 * is read from the {@link cameraPose} singleton (written each frame by
 * <OrbitCamera>); applying a view bumps `applyViewNonce` with `pendingViewPose`,
 * which <OrbitCamera> consumes to retarget the camera. Persisted to localStorage
 * (global to the device, not per-saved-design) — kept out of the save schema.
 */
export interface CameraViewsSlice {
  savedViews: SavedView[]
  /** Bumped to ask <OrbitCamera> to apply `pendingViewPose`. */
  applyViewNonce: number
  pendingViewPose: { pos: [number, number, number]; target: [number, number, number] } | null
  /** Save an explicit computed pose (position + look-at target) under a name,
   *  tagged with the CURRENT lighting/time-of-day state — the pose-agnostic
   *  half of `saveCurrentView`, reusable by callers that compute a pose
   *  without a live camera (e.g. `suggestSavedViews`). Returns the new id. */
  saveView: (
    pose: { pos: [number, number, number]; target: [number, number, number] },
    name: string,
    thumb?: string | null,
  ) => string
  /** Snapshot the current live camera pose under a name (+ an optional preview
   *  thumbnail captured by the caller). Returns the new id. */
  saveCurrentView: (name: string, thumb?: string | null) => string
  /** Auto-generate a starter set of saved views (SAVED-VIEWS-SUGGEST): a
   *  corner three-quarter angle per major furnished room + one whole-flat
   *  overview (`scene/cameras/suggestViews.ts`), skipping any name that's
   *  already saved so re-running is a no-op on the parts that exist. Returns
   *  the number of NEW views added and toasts a summary. */
  suggestSavedViews: () => number
  /** Retarget the orbit camera to a saved view (also forces orbit mode). */
  applyView: (id: string) => void
  deleteView: (id: string) => void
  renameView: (id: string, name: string) => void
  /** Set (or clear, with an empty string) a view's presenter note. */
  setViewNote: (id: string, note: string) => void
  /** Mark/unmark a view as a 360° panorama slide in presentation mode. */
  setViewPano: (id: string, pano: boolean) => void
}

function loadViews(): SavedView[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (v): v is SavedView =>
        v &&
        typeof v.id === 'string' &&
        typeof v.name === 'string' &&
        Array.isArray(v.pos) &&
        v.pos.length === 3 &&
        Array.isArray(v.target) &&
        v.target.length === 3,
    )
  } catch {
    return []
  }
}

function persistViews(views: SavedView[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(views))
  } catch {
    // private mode / quota — non-critical, ignore.
  }
}

let idCounter = 0
const viewId = () => `view-${Date.now().toString(36)}-${idCounter++}`

export const CAMERA_VIEWS_INITIAL: Pick<
  CameraViewsSlice,
  'savedViews' | 'applyViewNonce' | 'pendingViewPose'
> = {
  savedViews: loadViews(),
  applyViewNonce: 0,
  pendingViewPose: null,
}

export const createCameraViewsSlice: SliceCreator<CameraViewsSlice, RootState> = (set, get) => ({
  ...CAMERA_VIEWS_INITIAL,
  saveView: (pose, name, thumb) => {
    const id = viewId()
    const st = get()
    const view: SavedView = {
      id,
      name: name.trim() || `View ${st.savedViews.length + 1}`,
      pos: pose.pos,
      target: pose.target,
      ...(thumb ? { thumb } : {}),
      mode: st.timeMode,
      hour: st.manualHour,
      lights: st.lightsMode,
    }
    const next = [...get().savedViews, view].slice(-MAX_VIEWS)
    persistViews(next)
    set({ savedViews: next })
    return id
  },
  saveCurrentView: (name, thumb) =>
    get().saveView(
      {
        pos: [cameraPose.px, cameraPose.py, cameraPose.pz],
        target: [cameraPose.tx, cameraPose.ty, cameraPose.tz],
      },
      name,
      thumb,
    ),
  suggestSavedViews: () => {
    const st = get()
    const existingNames = new Set(st.savedViews.map((v) => v.name))
    const computed = suggestViews(st.floorPlan, st.items).filter((v) => !existingNames.has(v.name))
    for (const v of computed) get().saveView({ pos: v.pos, target: v.target }, v.name)
    const count = computed.length
    get().notify.start({
      title: count > 0 ? 'Views suggested' : 'No new views to suggest',
      kind: count > 0 ? 'success' : 'info',
      message:
        count > 0
          ? `Added ${count} saved view${count === 1 ? '' : 's'} — a corner angle per room + an overview.`
          : 'Every suggested view is already saved.',
    })
    return count
  },
  applyView: (id) => {
    const view = get().savedViews.find((v) => v.id === id)
    if (!view) return
    set((s) => ({
      pendingViewPose: { pos: view.pos, target: view.target },
      applyViewNonce: s.applyViewNonce + 1,
      cameraMode: 'orbit',
    }))
    // Restore the captured lighting (back-compat: older views have none).
    if (view.lights) get().setLightsMode(view.lights)
    if (view.mode === 'manual' && typeof view.hour === 'number') get().setManualHour(view.hour)
    else if (view.mode === 'system') get().setTimeMode('system')
  },
  deleteView: (id) => {
    const next = get().savedViews.filter((v) => v.id !== id)
    persistViews(next)
    set({ savedViews: next })
  },
  renameView: (id, name) => {
    const next = get().savedViews.map((v) =>
      v.id === id ? { ...v, name: name.trim() || v.name } : v,
    )
    persistViews(next)
    set({ savedViews: next })
  },
  setViewNote: (id, note) => {
    const trimmed = note.trim()
    const next = get().savedViews.map((v) =>
      v.id === id ? { ...v, note: trimmed || undefined } : v,
    )
    persistViews(next)
    set({ savedViews: next })
  },
  setViewPano: (id, pano) => {
    const next = get().savedViews.map((v) => (v.id === id ? { ...v, pano: pano || undefined } : v))
    persistViews(next)
    set({ savedViews: next })
  },
})
