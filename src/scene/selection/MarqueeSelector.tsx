import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { type Camera, Vector3 } from 'three'
import { obbCorners } from '../../collision/obb'
import { itemFootprint } from '../../collision/placement'
import { useCatalogGetter } from '../../furniture/catalog'
import { canEditScene } from '../../state/editing'
import { useStore } from '../../state/store'
import { marqueeHitsScreenPoints } from './marqueeHit'

const DRAG_THRESHOLD_PX = 4

interface MarqueeRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

// Module-level handle the in-canvas tracker writes the active camera to,
// so the DOM-side <MarqueeSelector /> (which lives outside the Canvas)
// can project world-XZ centres without using useThree.
const cameraHandle: { camera: Camera | null } = { camera: null }

/** Renders nothing — keeps `cameraHandle.camera` pointed at the active
 *  R3F camera. Mounted inside <Canvas>. */
export function MarqueeCameraTracker() {
  const { camera } = useThree()
  useEffect(() => {
    cameraHandle.camera = camera
    return () => {
      if (cameraHandle.camera === camera) cameraHandle.camera = null
    }
  }, [camera])
  return null
}

/**
 * Click-and-drag area selection in select mode. Lives in the DOM next
 * to the Canvas; reads the active camera via `cameraHandle` (set by the
 * in-canvas <MarqueeCameraTracker />). On pointer-up, projects each
 * item's world-XZ centre against the marquee rect and replaces (or
 * extends, with Shift) the multi-selection set.
 */
export function MarqueeSelector() {
  // Stable getter so a bulk import's catalog churn never re-renders this
  // in-canvas controller (it only reads the catalog lazily in handlers).
  const { ref: catalogRef } = useCatalogGetter()

  const [rect, setRect] = useState<MarqueeRect | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: catalogRef is a stable ref read lazily inside the handler — intentionally not a dep.
  useEffect(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return

    let pending: { x: number; y: number; shift: boolean } | null = null
    let active: MarqueeRect | null = null
    let suppressClickUntil = 0

    const reset = () => {
      pending = null
      active = null
      setRect(null)
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const state = useStore.getState()
      if (!canEditScene(state)) return
      if (state.activeDefId) return
      pending = { x: e.clientX, y: e.clientY, shift: e.shiftKey }
    }

    const onMove = (e: PointerEvent) => {
      if (!pending && !active) return
      const state = useStore.getState()
      if (state.draggingItemId) {
        reset()
        return
      }
      if (pending && !active) {
        const dx = e.clientX - pending.x
        const dy = e.clientY - pending.y
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        active = { x0: pending.x, y0: pending.y, x1: e.clientX, y1: e.clientY }
        setRect(active)
        return
      }
      if (active) {
        active = { ...active, x1: e.clientX, y1: e.clientY }
        setRect(active)
      }
    }

    const onUp = () => {
      if (!active) {
        pending = null
        return
      }
      const finished = active
      const wasShift = pending?.shift ?? false
      pending = null
      active = null

      const xMin = Math.min(finished.x0, finished.x1)
      const xMax = Math.max(finished.x0, finished.x1)
      const yMin = Math.min(finished.y0, finished.y1)
      const yMax = Math.max(finished.y0, finished.y1)

      const rectDom = canvas.getBoundingClientRect()
      const cam = cameraHandle.camera
      const state = useStore.getState()
      const hits: string[] = []
      if (cam) {
        cam.updateMatrixWorld()
        const v = new Vector3()
        for (const item of state.items) {
          const def = catalogRef.current[item.defId]
          if (!def) continue
          const obb = itemFootprint(item, def)
          // Project the footprint's 4 corners (+ centre) to screen, then select
          // if their bounding box *intersects* the marquee — so dragging over
          // part of a large piece selects it (lasso-style), not only when its
          // centre falls inside the rect.
          const pts: [number, number][] = []
          for (const [cx, cz] of [...obbCorners(obb), [obb.cx, obb.cz] as const]) {
            v.set(cx, 0, cz)
            v.project(cam)
            if (v.z < -1 || v.z > 1) continue
            pts.push([
              ((v.x + 1) / 2) * rectDom.width + rectDom.left,
              ((1 - v.y) / 2) * rectDom.height + rectDom.top,
            ])
          }
          if (marqueeHitsScreenPoints(pts, xMin, xMax, yMin, yMax)) {
            hits.push(item.id)
          }
        }
      }

      if (wasShift) {
        const existing = new Set(state.selectedItemIds)
        for (const id of hits) existing.add(id)
        state.setSelectedItemIds(Array.from(existing))
      } else {
        state.setSelectedItemIds(hits)
      }

      // Swallow the synthetic click that pointerup will spawn so the
      // floor mesh's onClick (which selects the room under the cursor)
      // doesn't immediately clobber the marquee result.
      suppressClickUntil = performance.now() + 250
      setRect(null)
    }

    const onClickCapture = (e: MouseEvent) => {
      if (performance.now() < suppressClickUntil) {
        e.stopPropagation()
        e.preventDefault()
      }
    }

    const onCancel = () => reset()

    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    canvas.addEventListener('click', onClickCapture, { capture: true })
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('click', onClickCapture, { capture: true })
    }
  }, [])

  if (!rect) return null

  const left = Math.min(rect.x0, rect.x1)
  const top = Math.min(rect.y0, rect.y1)
  const width = Math.abs(rect.x1 - rect.x0)
  const height = Math.abs(rect.y1 - rect.y0)

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width,
        height,
        border: '1px solid #3b82f6',
        background: 'rgba(59, 130, 246, 0.15)',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    />
  )
}
