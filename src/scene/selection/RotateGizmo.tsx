import { Html } from '@react-three/drei'
import { type ThreeEvent, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Intersection, Mesh, Ray, Raycaster as RaycasterType } from 'three'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { canPlace, itemFootprint } from '../../collision/placement'
import { buildCollisionWalls } from '../../collision/wallsFromState'
import { isDefaultPlan, planCollisionWalls } from '../../floorplan/planGeometry'
import { useCatalog } from '../../furniture/catalog'
import { useStore } from '../../state/store'
import { computeRotation, gizmoRadius, pointerAngle, toDegrees } from './rotateGizmoMath'

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0)
const LIFT = 0.02
// Width of the (invisible) grab band on each side of the visible ring — a
// generous touch target.
const GRAB_HALF = 0.16

const COLOR_IDLE = '#3b82f6'
const COLOR_VALID = '#22c55e'
const COLOR_INVALID = '#ef4444'

/**
 * Ref callback that patches a mesh's `raycast` so any hit it produces sorts
 * first (distance ≈ 0). The gizmo draws always-on-top (depthTest:false) but the
 * R3F event system picks the geometrically-closest mesh — without this, taller
 * furniture sitting over the floor-level ring would steal the pointer-down. This
 * makes the visible handle the click target wherever it's drawn. Idempotent.
 */
function priorityRaycast(mesh: Mesh | null) {
  if (!mesh || (mesh as { __priorityPatched?: boolean }).__priorityPatched) return
  const original = mesh.raycast.bind(mesh)
  mesh.raycast = (raycaster: RaycasterType, intersects: Intersection[]) => {
    const before = intersects.length
    original(raycaster as RaycasterType & { ray: Ray }, intersects)
    for (let i = before; i < intersects.length; i++) intersects[i].distance = 1e-4
  }
  ;(mesh as { __priorityPatched?: boolean }).__priorityPatched = true
}

/**
 * A touch-friendly drag-to-rotate handle drawn on the floor around the single
 * selected item (orbit camera + select tool only). Dragging the ring/knob spins
 * the piece about its vertical axis; it snaps to 15° steps unless Shift is held.
 * Live collision feedback tints the ring green/red and an invalid release
 * reverts to the pre-gesture angle (mirrors the item-drag UX). Mounted beside
 * SelectionOutline in both the main and room-editor scenes.
 *
 * Lives inside the Canvas (needs the active camera + GL element for raycasting).
 * In select mode OrbitControls is disabled, so window-level pointer tracking
 * never competes with the camera.
 */
export function RotateGizmo() {
  const { camera, gl } = useThree()
  const catalog = useCatalog()

  const cameraMode = useStore((s) => s.cameraMode)
  const editorTool = useStore((s) => s.editorTool)
  const draggingItemId = useStore((s) => s.draggingItemId)
  const activeDefId = useStore((s) => s.activeDefId)
  const ids = useStore(useShallow((s) => s.selectedItemIds))
  const singleId = ids.length === 1 ? ids[0] : null
  const item = useStore(useShallow((s) => s.items.find((i) => i.id === singleId) ?? null))

  const ndc = useMemo(() => new Vector2(), [])
  const raycaster = useMemo(() => new Raycaster(), [])
  const hitPoint = useMemo(() => new Vector3(), [])

  const [rotating, setRotating] = useState(false)
  const [valid, setValid] = useState(true)
  const [liveRot, setLiveRot] = useState<number | null>(null)
  // Gesture scratch — mutated by the window listeners without re-subscribing.
  const gesture = useRef<{
    id: string
    cx: number
    cz: number
    grabAngle: number
    startRot: number
  } | null>(null)

  const def = item ? catalog[item.defId] : null
  const visible =
    cameraMode === 'orbit' &&
    editorTool === 'select' &&
    !!item &&
    !!def &&
    !item.locked &&
    !draggingItemId &&
    !activeDefId

  const obb = useMemo(() => (item && def ? itemFootprint(item, def) : null), [item, def])
  const radius = obb ? gizmoRadius(obb.hx, obb.hz) : gizmoRadius(0, 0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: ndc/raycaster/hitPoint are stable refs; gesture is a mutable ref read lazily; re-binding per render would thrash listeners.
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

    const onMove = (ev: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      const hit = project(ev.clientX, ev.clientY)
      if (!hit) return
      const angle = pointerAngle(g.cx, g.cz, hit[0], hit[1])
      const next = computeRotation(g.startRot, g.grabAngle, angle, !ev.shiftKey)

      const state = useStore.getState()
      const live = state.items.find((i) => i.id === g.id)
      const liveDef = live ? catalog[live.defId] : null
      if (!live || !liveDef) return
      state.rotateItem(g.id, next)
      setLiveRot(next)

      // Live collision feedback (parity with the item-drag tint).
      const planWalls = isDefaultPlan(state.floorPlan)
        ? undefined
        : planCollisionWalls(state.floorPlan, state.doors)
      const ok = canPlace({ ...live, rotation: next }, liveDef, {
        others: state.items.filter((o) => o.id !== g.id),
        defs: catalog,
        doors: state.doors,
        walls: planWalls ?? buildCollisionWalls(state.doors),
      })
      setValid(ok)
    }

    const onUp = () => {
      const g = gesture.current
      if (g && !valid) {
        // Invalid landing — revert to the angle captured at grab.
        useStore.getState().rotateItem(g.id, g.startRot)
      }
      gesture.current = null
      setRotating(false)
      setValid(true)
      setLiveRot(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [rotating, valid, camera, gl, catalog])

  if (!visible || !obb || !item) return null

  const color = rotating ? (valid ? COLOR_VALID : COLOR_INVALID) : COLOR_IDLE

  const onGrab = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const grabAngle = pointerAngle(obb.cx, obb.cz, e.point.x, e.point.z)
    gesture.current = {
      id: item.id,
      cx: obb.cx,
      cz: obb.cz,
      grabAngle,
      startRot: item.rotation,
    }
    useStore.getState().pushHistory()
    setValid(true)
    setLiveRot(item.rotation)
    setRotating(true)
  }

  return (
    <group position={[obb.cx, LIFT, obb.cz]} rotation={[0, item.rotation, 0]}>
      {/* Wide invisible grab band over the visible ring — generous touch target. */}
      <mesh
        ref={priorityRaycast}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={onGrab}
        renderOrder={5}
      >
        <ringGeometry args={[radius - GRAB_HALF, radius + GRAB_HALF, 48]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>
      {/* Visible ring. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
        <ringGeometry args={[radius - 0.022, radius + 0.022, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={rotating ? 0.95 : 0.7}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/* Front-facing grab knob (points where the item faces, local +Z). */}
      <mesh ref={priorityRaycast} position={[0, 0, radius]} onPointerDown={onGrab} renderOrder={7}>
        <sphereGeometry args={[0.075, 20, 20]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
      {/* Spoke from centre to the knob — reinforces the facing direction. */}
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
      {rotating && liveRot != null && (
        <Html position={[0, 0, radius + 0.18]} center distanceFactor={9}>
          <div className="rounded bg-[var(--surface-solid)]/95 px-2 py-0.5 text-xs font-semibold text-[var(--text)] shadow whitespace-nowrap pointer-events-none">
            {toDegrees(liveRot)}°
          </div>
        </Html>
      )}
    </group>
  )
}
