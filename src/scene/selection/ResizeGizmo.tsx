import { type ThreeEvent, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { obbCorners } from '../../collision/obb'
import { canPlace, itemFootprintParts } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import { buildCollisionWalls } from '../../collision/wallsFromState'
import { noExportUserData } from '../../export/sceneGltf'
import { useCatalogGetter } from '../../furniture/catalog'
import type { FurnitureItem } from '../../furniture/types'
import { canEditScene } from '../../state/editing'
import { useStore } from '../../state/store'
import { isActiveDragPointer } from '../dragHelpers'
import { priorityRaycast } from '../raycastPriority'
import { groupResizeFactor, resizedTransform } from './resizeGizmoMath'
import { clearResizeReadout, setResizeReadout } from './resizeReadoutSignal'

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0)
const LIFT = 0.02
const COLOR_IDLE = '#3b82f6'
const COLOR_VALID = '#22c55e'
const COLOR_INVALID = '#ef4444'
const HANDLE = 0.12

/** A member's pre-gesture transform for the resize gesture. */
interface ResizeOriginal {
  id: string
  position: [number, number]
  scale: number
}

interface Gesture {
  pivot: [number, number]
  grabDist: number
  originals: ResizeOriginal[]
  /** The `pointerId` that grabbed this corner handle (MOBILE-1, BUG-1 class) —
   *  window `onMove`/`onUp` gate on this via `isActiveDragPointer` so a second
   *  finger's independent pointer stream can't drive or end the resize. A
   *  per-gesture field, not the store's item-drag `dragPointerId`. */
  pointerId: number
}

/** The selection's effective uniform scale of one item (props → def → 1). */
function effectiveScale(item: FurnitureItem, def: { kind: string; scale?: number }): number {
  if (typeof item.props.scale === 'number') return item.props.scale
  return (def.kind !== 'parametric' ? def.scale : undefined) ?? 1
}

/**
 * Corner resize handles drawn on the floor around a MULTI-selection (2+ items,
 * orbit + select tool only) — the 3D mirror of the 2D plan editor's group
 * resize. Dragging a corner scales every selected item uniformly about the
 * opposite corner (`resizeGizmoMath`), so the whole selection grows/shrinks as
 * one block. Collision-tinted; an invalid release reverts via the pre-gesture
 * snapshot. A single item still resizes via the inspector's Size section.
 *
 * Mounted beside `RotateGizmo`/`SelectionOutline` in both the main and
 * room-editor scenes; lives inside the Canvas (needs the camera + GL element).
 */
export function ResizeGizmo() {
  const { camera, gl } = useThree()
  const { ref: catalogRef } = useCatalogGetter()

  const editing = useStore(canEditScene)
  const draggingItemId = useStore((s) => s.draggingItemId)
  const activeDefId = useStore((s) => s.activeDefId)
  const selected = useStore(
    useShallow((s) =>
      s.items.filter(
        (i) => s.selectedItemIds.includes(i.id) && !i.locked && !s.hiddenItemIds.includes(i.id),
      ),
    ),
  )

  const ndc = useMemo(() => new Vector2(), [])
  const raycaster = useMemo(() => new Raycaster(), [])
  const hitPoint = useMemo(() => new Vector3(), [])

  const [resizing, setResizing] = useState(false)
  const [valid, setValid] = useState(true)
  const gesture = useRef<Gesture | null>(null)

  // The selection's world-space AABB (from every footprint corner). Only a
  // 2+ selection gets handles — a single item resizes via the inspector.
  // biome-ignore lint/correctness/useExhaustiveDependencies: catalogRef is a stable lazy ref; recompute on selection change.
  const box = useMemo(() => {
    if (selected.length < 2) return null
    let minX = Number.POSITIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY
    for (const it of selected) {
      const def = catalogRef.current[it.defId]
      if (!def) continue
      // Union every footprint PART's corners so the box spans the true geometry
      // (an L-sofa's chaise included), not just the shallow enclosing OBB.
      for (const part of itemFootprintParts(it, def)) {
        for (const [x, z] of obbCorners(part)) {
          if (x < minX) minX = x
          if (z < minZ) minZ = z
          if (x > maxX) maxX = x
          if (z > maxZ) maxZ = z
        }
      }
    }
    if (!Number.isFinite(minX)) return null
    return { minX, minZ, maxX, maxZ }
  }, [selected])

  const visible = editing && !draggingItemId && !activeDefId && !!box

  // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs; gesture is a mutable ref read lazily.
  useEffect(() => {
    if (!resizing) return
    const dom = gl.domElement

    const project = (clientX: number, clientY: number): [number, number] | null => {
      const rect = dom.getBoundingClientRect()
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1),
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(FLOOR_PLANE, hitPoint)) return null
      return [hitPoint.x, hitPoint.z]
    }

    const onMove = (ev: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      // MOBILE-1 (BUG-1 class): a second finger's own pointermove stream must
      // not drive this resize — only the pointer that grabbed the corner handle.
      if (!isActiveDragPointer(g.pointerId, ev.pointerId)) return
      const hit = project(ev.clientX, ev.clientY)
      if (!hit) return
      const dist = Math.hypot(hit[0] - g.pivot[0], hit[1] - g.pivot[1])
      const f = groupResizeFactor(g.grabDist, dist)
      const state = useStore.getState()
      const sel = new Set(g.originals.map((o) => o.id))
      const cand = state.items.map((it) => {
        const o = g.originals.find((x) => x.id === it.id)
        if (!o) return it
        const r = resizedTransform(o.position, o.scale, g.pivot, f)
        const ns = r.scale
        return {
          ...it,
          position: r.position,
          props: { ...it.props, scale: ns, scaleX: ns, scaleY: ns, scaleZ: ns },
        }
      })
      state.setItems(cand)
      // Publish the live selection W×D so the HUD tracks the drag. Union every
      // selected member's footprint PARTS (true geometry, matches the box below).
      let bx0 = Number.POSITIVE_INFINITY
      let bz0 = Number.POSITIVE_INFINITY
      let bx1 = Number.NEGATIVE_INFINITY
      let bz1 = Number.NEGATIVE_INFINITY
      for (const it of cand) {
        if (!sel.has(it.id)) continue
        const def = catalogRef.current[it.defId]
        if (!def) continue
        for (const part of itemFootprintParts(it, def)) {
          for (const [x, z] of obbCorners(part)) {
            if (x < bx0) bx0 = x
            if (z < bz0) bz0 = z
            if (x > bx1) bx1 = x
            if (z > bz1) bz1 = z
          }
        }
      }
      if (Number.isFinite(bx0)) setResizeReadout({ w: bx1 - bx0, d: bz1 - bz0 })
      // Collision: each scaled member vs the rest + walls (group members excluded
      // from each other — they scale rigidly, so any intra overlap pre-existed).
      const others = cand.filter((i) => !sel.has(i.id))
      const walls = placementWalls(state) ?? buildCollisionWalls(state.doors)
      let ok = true
      for (const o of g.originals) {
        const cit = cand.find((c) => c.id === o.id)
        const def = cit ? catalogRef.current[cit.defId] : null
        if (!cit || !def) continue
        if (!canPlace(cit, def, { others, defs: catalogRef.current, doors: state.doors, walls })) {
          ok = false
          break
        }
      }
      setValid(ok)
    }

    const onUp = (ev: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      // MOBILE-1: only the initiating pointer may end the gesture.
      if (!isActiveDragPointer(g.pointerId, ev.pointerId)) return
      clearResizeReadout()
      const cur = useStore.getState()
      if (!valid) {
        // Invalid landing — restore the pre-gesture snapshot (positions + scales).
        const prior = cur.past[cur.past.length - 1]?.items
        if (prior) cur.setItems(prior)
      }
      gesture.current = null
      setResizing(false)
      useStore.getState().setRotatingGizmo(false)
      const wasValid = valid
      setValid(true)
      const after = useStore.getState()
      let changed = false
      if (g && wasValid) {
        const byId = new Map(after.items.map((i) => [i.id, i]))
        changed = g.originals.some((o) => {
          const it = byId.get(o.id)
          return !!it && (it.position[0] !== o.position[0] || it.position[1] !== o.position[1])
        })
      }
      if (changed && g) {
        const priorItems = after.past[after.past.length - 1]?.items
        after.setPendingEdit({
          kind: 'transform',
          ids: g.originals.map((o) => o.id),
          originals: after.items
            .filter((i) => g.originals.some((o) => o.id === i.id))
            .map((i) => ({ id: i.id, position: i.position, rotation: i.rotation })),
          priorItems,
        })
      } else {
        after.dropRedundantHistory()
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      clearResizeReadout()
    }
  }, [resizing, valid, camera, gl])

  if (!visible || !box) return null

  const { minX, minZ, maxX, maxZ } = box
  const color = resizing ? (valid ? COLOR_VALID : COLOR_INVALID) : COLOR_IDLE
  // Each corner + its diagonally-opposite pivot.
  const corners: Array<{ x: number; z: number; px: number; pz: number }> = [
    { x: minX, z: minZ, px: maxX, pz: maxZ },
    { x: maxX, z: minZ, px: minX, pz: maxZ },
    { x: maxX, z: maxZ, px: minX, pz: minZ },
    { x: minX, z: maxZ, px: maxX, pz: minZ },
  ]

  const onGrab = (pivot: [number, number]) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const st = useStore.getState()
    if (st.pendingEdit) st.confirmPendingEdit()
    const originals: ResizeOriginal[] = selected.map((it) => ({
      id: it.id,
      position: [it.position[0], it.position[1]],
      scale: effectiveScale(it, catalogRef.current[it.defId] ?? { kind: 'parametric' }),
    }))
    // Record the initiating pointerId (MOBILE-1, BUG-1 class) + best-effort
    // capture on the corner handle mesh, same guarded pattern as
    // Furniture.tsx/RotateGizmo — only this pointer may drive/end the resize.
    try {
      ;(e.nativeEvent.target as Element | null)?.setPointerCapture?.(e.nativeEvent.pointerId)
    } catch {}
    gesture.current = {
      pivot,
      grabDist: Math.max(0.05, Math.hypot(e.point.x - pivot[0], e.point.z - pivot[1])),
      originals,
      pointerId: e.nativeEvent.pointerId,
    }
    st.pushHistory()
    setValid(true)
    setResizing(true)
    st.setRotatingGizmo(true)
  }

  return (
    <group userData={noExportUserData()}>
      {/* Dashed bounding box outline (a thin ring of 4 edges). */}
      {corners.map((c, i) => {
        const n = corners[(i + 1) % corners.length]
        const mx = (c.x + n.x) / 2
        const mz = (c.z + n.z) / 2
        const len = Math.hypot(n.x - c.x, n.z - c.z)
        const ang = Math.atan2(n.z - c.z, n.x - c.x)
        return (
          <mesh
            key={`edge-${i}`}
            position={[mx, LIFT, mz]}
            rotation={[-Math.PI / 2, 0, -ang]}
            renderOrder={5}
          >
            <planeGeometry args={[len, 0.015]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.6}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        )
      })}
      {/* Corner handles — drag to scale the selection about the opposite corner. */}
      {corners.map((c, i) => (
        <mesh
          key={`h-${i}`}
          ref={priorityRaycast}
          position={[c.x, LIFT, c.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={onGrab([c.px, c.pz])}
          renderOrder={7}
        >
          <planeGeometry args={[HANDLE, HANDLE]} />
          <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}
