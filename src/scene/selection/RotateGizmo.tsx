import { Html } from '@react-three/drei'
import { type ThreeEvent, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { canPlace, itemFootprint } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import { buildCollisionWalls } from '../../collision/wallsFromState'
import { noExportUserData } from '../../export/sceneGltf'
import { isFeatureEnabled } from '../../features/featureFlags'
import { useCatalogGetter } from '../../furniture/catalog'
import { canEditScene } from '../../state/editing'
import { useStore } from '../../state/store'
import { priorityRaycast } from '../raycastPriority'
import {
  enclosingRadius,
  gizmoRadius,
  neighbourAxes,
  pointerAngle,
  rotatePointAround,
  smartSnapRotation,
  snapDelta,
  toDegrees,
} from './rotateGizmoMath'

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0)
const LIFT = 0.02
// Width of the (invisible) grab band on each side of the visible ring — a
// generous touch target.
const GRAB_HALF = 0.16

const COLOR_IDLE = '#3b82f6'
const COLOR_VALID = '#22c55e'
const COLOR_INVALID = '#ef4444'
// Faint alignment-guide colour, drawn only while a neighbour-axis snap is active.
// Reads as a subtle precision cue distinct from the valid/invalid ring tints.
const COLOR_ALIGN = '#a78bfa'

interface GizmoTarget {
  id: string
  /** Footprint centre (for ring sizing) + the live transform (for the gesture). */
  cx: number
  cz: number
  halfDiag: number
  position: [number, number]
  rotation: number
}

interface Gesture {
  /** True for a single item — rotation snaps to absolute 15° marks and the knob
   *  tracks its facing. A multi-selection snaps the *delta* and orbits a pivot. */
  single: boolean
  pivot: [number, number]
  grabAngle: number
  startRot: number // single only: the item's rotation at grab
  originals: Array<{ id: string; position: [number, number]; rotation: number }>
  /** Single-item only: neighbour/wall reference yaws for the smart snap, captured
   *  once at grab (neighbours don't move during the gesture). Empty when smart
   *  snap is off (Simple mode / flag off) so the gizmo falls back to 15° only. */
  refs: number[]
}

/**
 * A touch-friendly drag-to-rotate handle drawn on the floor around the current
 * selection (orbit camera + select tool only). For a single item the ring/knob
 * spins the piece about its own axis, snapping to absolute 15° marks; for a
 * multi-selection it rotates every member rigidly about the group centroid,
 * snapping the delta. Hold Shift for free rotation. Live collision feedback
 * tints the ring green/red and an invalid release reverts to the pre-gesture
 * transform (mirrors the item-drag UX). Mounted beside SelectionOutline in both
 * the main and room-editor scenes.
 *
 * Lives inside the Canvas (needs the active camera + GL element for raycasting).
 * In select mode OrbitControls is disabled, so window-level pointer tracking
 * never competes with the camera.
 */
export function RotateGizmo() {
  const { camera, gl } = useThree()
  // Non-reactive accessor (window listeners read it lazily) — never re-render
  // this in-canvas controller on catalog churn.
  const { ref: catalogRef } = useCatalogGetter()

  const editing = useStore(canEditScene)
  const draggingItemId = useStore((s) => s.draggingItemId)
  const activeDefId = useStore((s) => s.activeDefId)
  // Live selected (unlocked) items — re-renders when their transform changes.
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

  const [rotating, setRotating] = useState(false)
  const [valid, setValid] = useState(true)
  // While rotating: the absolute angle (single) or signed delta (group), radians.
  const [live, setLive] = useState<number | null>(null)
  // Local yaw (relative to faceRot) of the active neighbour-axis snap, or null
  // when none — drives the faint alignment guide. Null whenever snapping to the
  // 15° grid, free-rotating (Shift), or rotating a group.
  const [alignYaw, setAlignYaw] = useState<number | null>(null)
  const gesture = useRef<Gesture | null>(null)

  // Resolve the target set + ring geometry from the live selection.
  // biome-ignore lint/correctness/useExhaustiveDependencies: catalogRef is a stable ref read lazily; recomputes on selection change.
  const geom = useMemo(() => {
    const targets: GizmoTarget[] = []
    for (const it of selected) {
      const def = catalogRef.current[it.defId]
      if (!def) continue
      const obb = itemFootprint(it, def)
      targets.push({
        id: it.id,
        cx: obb.cx,
        cz: obb.cz,
        halfDiag: Math.hypot(obb.hx, obb.hz),
        position: [it.position[0], it.position[1]],
        rotation: it.rotation,
      })
    }
    if (targets.length === 0) return null
    const single = targets.length === 1
    if (single) {
      const t = targets[0]
      // Pivot about the item's own position so the gesture only spins it.
      return {
        single,
        targets,
        pivot: [t.position[0], t.position[1]] as [number, number],
        radius: gizmoRadius(t.halfDiag, t.halfDiag),
        faceRot: t.rotation,
      }
    }
    const pivot: [number, number] = [
      targets.reduce((a, t) => a + t.position[0], 0) / targets.length,
      targets.reduce((a, t) => a + t.position[1], 0) / targets.length,
    ]
    return {
      single,
      targets,
      pivot,
      radius: enclosingRadius(pivot[0], pivot[1], targets),
      faceRot: 0,
    }
  }, [selected])

  const visible = editing && !draggingItemId && !activeDefId && !!geom

  // biome-ignore lint/correctness/useExhaustiveDependencies: ndc/raycaster/hitPoint/catalogRef are stable refs; gesture is a mutable ref read lazily; re-binding per render would thrash listeners.
  useEffect(() => {
    if (!rotating) return
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

    const apply = (g: Gesture, delta: number) => {
      const state = useStore.getState()
      for (const o of g.originals) {
        const next = rotatePointAround(o.position[0], o.position[1], g.pivot[0], g.pivot[1], delta)
        state.moveItem(o.id, next)
        state.rotateItem(o.id, o.rotation + delta)
      }
    }

    const checkValid = (g: Gesture): boolean => {
      const after = useStore.getState()
      const sel = new Set(g.originals.map((o) => o.id))
      // Rigid rotation preserves intra-selection distances, so ignore in-group
      // pairs (any overlap pre-existed) and test against the rest + walls.
      const others = after.items.filter((i) => !sel.has(i.id))
      // Same walls a drag uses — the room's perimeter inside the editor — so a
      // rotation can't swing a piece out past the room walls either.
      const walls = placementWalls(after) ?? buildCollisionWalls(after.doors)
      for (const o of g.originals) {
        const it = after.items.find((i) => i.id === o.id)
        const def = it ? catalogRef.current[it.defId] : null
        if (!it || !def) continue
        if (!canPlace(it, def, { others, defs: catalogRef.current, doors: after.doors, walls }))
          return false
      }
      return true
    }

    const onMove = (ev: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      const hit = project(ev.clientX, ev.clientY)
      if (!hit) return
      const angle = pointerAngle(g.pivot[0], g.pivot[1], hit[0], hit[1])
      const free = ev.shiftKey
      let delta: number
      if (g.single) {
        // Free candidate yaw (relative grab), then smart snap: neighbour/wall axis
        // within threshold wins, else the 15° grid; Shift (free) bypasses both.
        const candidate = g.startRot + (angle - g.grabAngle)
        const { yaw, snappedToRef } = smartSnapRotation(candidate, g.refs, !free)
        delta = yaw - g.startRot
        setLive(yaw)
        setAlignYaw(snappedToRef >= 0 ? yaw : null)
      } else {
        delta = snapDelta(angle - g.grabAngle, !free)
        setLive(delta)
      }
      apply(g, delta)
      setValid(checkValid(g))
    }

    const onUp = () => {
      const g = gesture.current
      const originals = g ? g.originals.map((o) => ({ ...o })) : []
      if (g && !valid) {
        // Invalid landing — restore every member's pre-gesture transform.
        const state = useStore.getState()
        for (const o of g.originals) {
          state.moveItem(o.id, o.position)
          state.rotateItem(o.id, o.rotation)
        }
      }
      gesture.current = null
      setRotating(false)
      useStore.getState().setRotatingGizmo(false)
      setValid(true)
      setLive(null)
      setAlignYaw(null)
      // A valid rotation that actually turned something becomes a pending
      // tick/cross edit; a grab that rotated nothing drops the dead snapshot
      // pushed in onGrab so the first undo isn't a no-op step (BUG-016).
      const cur = useStore.getState()
      let changed = false
      if (g && valid) {
        const byId = new Map(cur.items.map((i) => [i.id, i]))
        changed = originals.some((o) => {
          const it = byId.get(o.id)
          return (
            !!it &&
            (it.position[0] !== o.position[0] ||
              it.position[1] !== o.position[1] ||
              it.rotation !== o.rotation)
          )
        })
      }
      if (changed) {
        const priorItems = cur.past[cur.past.length - 1]?.items
        cur.setPendingEdit({
          kind: 'transform',
          ids: originals.map((o) => o.id),
          originals,
          priorItems,
        })
      } else {
        cur.dropRedundantHistory()
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [rotating, valid, camera, gl])

  if (!visible || !geom) return null

  const { single, targets, pivot, radius, faceRot } = geom
  const color = rotating ? (valid ? COLOR_VALID : COLOR_INVALID) : COLOR_IDLE

  const onGrab = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    // Starting a new rotation commits any edit still awaiting confirmation.
    if (useStore.getState().pendingEdit) useStore.getState().confirmPendingEdit()
    const grabAngle = pointerAngle(pivot[0], pivot[1], e.point.x, e.point.z)
    // Capture neighbour/wall reference axes once, for a single item, when the
    // smart-snap feature is on (pro-tier; forced off in Simple → empty refs →
    // plain 15° snap, so casual users keep the familiar behaviour).
    let refs: number[] = []
    if (single && isFeatureEnabled('smartRotateSnap')) {
      const st = useStore.getState()
      const walls = placementWalls(st) ?? buildCollisionWalls(st.doors)
      refs = neighbourAxes(targets[0].id, st.items, walls)
    }
    gesture.current = {
      single,
      pivot,
      grabAngle,
      startRot: single ? targets[0].rotation : 0,
      originals: targets.map((t) => ({ id: t.id, position: t.position, rotation: t.rotation })),
      refs,
    }
    useStore.getState().pushHistory()
    setValid(true)
    setLive(single ? targets[0].rotation : 0)
    setRotating(true)
    useStore.getState().setRotatingGizmo(true)
  }

  // Readout: single → absolute heading; group → signed turn applied.
  const readout =
    live == null
      ? ''
      : single
        ? `${toDegrees(live)}°`
        : `${live >= 0 ? '+' : '−'}${Math.abs(Math.round((live * 180) / Math.PI))}°`

  return (
    <group
      position={[pivot[0], LIFT, pivot[1]]}
      rotation={[0, faceRot, 0]}
      userData={noExportUserData()}
    >
      {/* Wide invisible grab band over the visible ring — generous touch target. */}
      <mesh
        ref={priorityRaycast}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={onGrab}
        renderOrder={5}
      >
        <ringGeometry args={[radius - GRAB_HALF, radius + GRAB_HALF, 64]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>
      {/* Visible ring. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
        <ringGeometry args={[radius - 0.022, radius + 0.022, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={rotating ? 0.95 : 0.7}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/* Grab knob. For a single item it sits at the facing (+Z) so it doubles as
          a heading indicator; for a group it sits due north of the centroid. */}
      <mesh ref={priorityRaycast} position={[0, 0, radius]} onPointerDown={onGrab} renderOrder={7}>
        <sphereGeometry args={[0.075, 20, 20]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
      {/* Spoke from centre to the knob. */}
      <mesh position={[0, 0, radius / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
        <planeGeometry args={[0.02, radius]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/* Faint neighbour-alignment guide: a full-diameter line along the snapped
          axis, shown only while a neighbour/wall snap is active (the group is
          already rotated to the snapped yaw, so local +Z is that axis). Subtle +
          slightly above the ring's plane → no z-fighting. */}
      {rotating && single && alignYaw != null && (
        <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
          <planeGeometry args={[0.012, radius * 2]} />
          <meshBasicMaterial
            color={COLOR_ALIGN}
            transparent
            opacity={0.55}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      )}
      {rotating && readout && (
        <Html position={[0, 0, radius + 0.18]} center distanceFactor={9}>
          <div className="rounded bg-[var(--surface-solid)]/95 px-2 py-0.5 text-xs font-semibold text-[var(--text)] shadow whitespace-nowrap pointer-events-none">
            {readout}
          </div>
        </Html>
      )}
    </group>
  )
}
