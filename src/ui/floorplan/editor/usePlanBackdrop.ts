import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react'
import { type FloorPlan, planBounds } from '../../../floorplan/types'
import { useStore } from '../../../state/store'
import {
  type BackdropMeta,
  persistBackdrop,
  readPersistedBackdrop,
  removePersistedBackdrop,
  updateBackdropMeta,
} from '../backdropPersist'
import { initialBackdropPlacement, MAX_PLAN_BACKDROP_BYTES } from './backdropPlacement'
import type { Backdrop, Tool } from './planConstants'

/**
 * Owns the 2D-editor's **trace backdrop** (a reference photo/scan the user draws
 * walls over): the `backdrop` state, its live object-URL lifecycle, and the
 * IndexedDB persistence (rehydrate on open, debounced calibration writes, blob
 * store on load, delete on remove). Extracted from `FloorPlanEditor` — a
 * cohesive, persistence-backed concern independent of the drawing/interaction
 * state.
 *
 * The editor keeps reading `backdrop`/`setBackdrop` (the AI wall-recognition and
 * Scale tool mutate `mPerPx`), so both are returned alongside the load/remove
 * handlers. `loadBackdrop` switches back to the select tool once the image is in
 * (via the passed `setTool`), matching the prior inline behaviour.
 */
export function usePlanBackdrop(
  editing: boolean,
  setTool: (t: Tool) => void,
  plan: FloorPlan,
): {
  backdrop: Backdrop | null
  setBackdrop: Dispatch<SetStateAction<Backdrop | null>>
  loadBackdrop: (file: File) => void
  removeBackdrop: () => void
} {
  const [backdrop, setBackdrop] = useState<Backdrop | null>(null)
  const backdropUrlRef = useRef<string | null>(null)

  // Rehydrate a previously-saved backdrop when the editor opens (the component
  // is always mounted and only renders when `editing`, so this can't be a
  // once-on-mount effect). Skips if one is already loaded so reopening doesn't
  // create a duplicate object URL.
  useEffect(() => {
    if (!editing) return
    let cancelled = false
    void readPersistedBackdrop().then((p) => {
      if (cancelled || !p) return
      setBackdrop((prev) => {
        if (prev) return prev
        const url = URL.createObjectURL(p.blob)
        backdropUrlRef.current = url
        return { url, ...p.meta }
      })
    })
    return () => {
      cancelled = true
    }
  }, [editing])

  // Revoke the live object URL only on a true unmount (not on editor close).
  useEffect(
    () => () => {
      if (backdropUrlRef.current) URL.revokeObjectURL(backdropUrlRef.current)
    },
    [],
  )

  // Persist calibration changes (opacity/scale/offset) without rewriting the
  // blob, debounced so a slider/drag doesn't hammer IDB.
  useEffect(() => {
    if (!backdrop) return
    const meta: BackdropMeta = {
      w: backdrop.w,
      h: backdrop.h,
      opacity: backdrop.opacity,
      mPerPx: backdrop.mPerPx,
      ox: backdrop.ox,
      oz: backdrop.oz,
      ...(backdrop.scaleCalibrated ? { scaleCalibrated: true } : {}),
    }
    const t = setTimeout(() => void updateBackdropMeta(meta), 400)
    return () => clearTimeout(t)
  }, [backdrop])

  // Load a dropped/picked image as the trace backdrop: rejected uploads get an
  // error toast; an accepted image is uniform-fit inside the plan bounds and
  // centred on the plan (the user then calibrates exactly with the Scale tool).
  const loadBackdrop = (file: File) => {
    const fail = (message: string) =>
      useStore.getState().notify.start({ kind: 'error', title: 'Trace image', message })
    if (!file.type.startsWith('image/')) {
      fail('That file is not an image — drop a floor-plan photo or scan (PNG/JPG/WebP).')
      return
    }
    if (file.size > MAX_PLAN_BACKDROP_BYTES) {
      fail('That image is too large (max 25 MB).')
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const [ew, ed] = planBounds(plan)
      const meta: BackdropMeta = {
        w: img.naturalWidth,
        h: img.naturalHeight,
        opacity: 0.5,
        ...initialBackdropPlacement(img.naturalWidth, img.naturalHeight, ew, ed),
      }
      setBackdrop((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { url, ...meta }
      })
      backdropUrlRef.current = url
      // Persist the blob + calibration so the backdrop survives reload/reopen.
      void persistBackdrop(file, meta)
      setTool('select')
    }
    img.src = url
  }

  // Remove the backdrop: drop the live URL, clear state, and delete the stored blob.
  const removeBackdrop = () => {
    setBackdrop((b) => {
      if (b) {
        URL.revokeObjectURL(b.url)
        if (backdropUrlRef.current === b.url) backdropUrlRef.current = null
      }
      return null
    })
    void removePersistedBackdrop()
  }

  return { backdrop, setBackdrop, loadBackdrop, removeBackdrop }
}
