import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { noExportUserData } from '../../export/sceneGltf'
import { useFeature } from '../../features/useFeature'
import { useCatalogGetter } from '../../furniture/catalog'
import { itemRotation } from '../../furniture/tiltRotation'
import { canEditScene } from '../../state/editing'
import { useStore } from '../../state/store'
import { isActiveDragPointer } from '../dragHelpers'
import { priorityRaycast } from '../raycastPriority'
import {
  computeTiltDrag,
  TILT_HANDLE_RADIUS,
  TILT_ROD_LENGTH,
  tiltGizmoAnchorHeight,
} from './tiltGizmoMath'

const COLOR_IDLE = '#3b82f6'
const COLOR_ACTIVE = '#22c55e'

interface Gesture {
  id: string
  startPitch: number
  startRoll: number
  startX: number
  startY: number
  /** The `pointerId` that grabbed the tilt ball (MOBILE-1, BUG-1 class) — window
   *  `onMove`/`onUp` gate on this via `isActiveDragPointer` so a second finger's
   *  independent pointer stream can't drive or end the tilt. A per-gesture
   *  field, not the store's item-drag `dragPointerId`. */
  pointerId: number
}

const toDeg = (rad: number) => Math.round((rad * 180) / Math.PI)

/**
 * A draggable 3D handle for a single selected item's pitch/roll tilt
 * (PARITY-TILT tail) — the in-viewport counterpart to the inspector's
 * `TiltControls` sliders (`ui/inspector/TiltControls.tsx`). Renders as a short
 * "joystick" (rod + ball) anchored just above the item, tilted with the SAME
 * `[pitch, yaw, roll]` Euler tuple the furniture mesh itself uses
 * (`furniture/tiltRotation.ts:itemRotation`) so the rod always visually points
 * the way the item is actually leaning — drag the ball to change it.
 *
 * Screen-space drag, not a floor-plane raycast: pitch/roll have no natural
 * world-space plane to project onto (unlike `RotateGizmo`/`ResizeGizmo`,
 * which drag across the floor). Vertical pointer movement maps to pitch,
 * horizontal to roll, both clamped to the shared ±45° range
 * (`furniture/tiltRotation.ts:clampTilt`, the same limit the sliders use) via
 * the pure `tiltGizmoMath.ts:computeTiltDrag`. Pointer events (not mouse-only)
 * so the same handler covers touch, mirroring every other in-scene handle.
 *
 * Single-item only — tilt is a per-item transform with no group case, same as
 * `TiltControls`. Hidden for locked items and for Staircase (excluded in the
 * inspector too — tilting a staircase makes no physical sense). Gated behind
 * the `tiltFurniture` flag (pro tier): the same flag that gates the inspector
 * sliders, since the gizmo is an alternate affordance for the same capability,
 * not a separate feature. Mounted beside `RotateGizmo`/`ResizeGizmo` in both
 * the main and room-editor scenes.
 */
export function TiltGizmo() {
  const { ref: catalogRef } = useCatalogGetter()
  const tiltOn = useFeature('tiltFurniture')

  const editing = useStore(canEditScene)
  const draggingItemId = useStore((s) => s.draggingItemId)
  const activeDefId = useStore((s) => s.activeDefId)
  const selectedItemIds = useStore((s) => s.selectedItemIds)
  const hiddenItemIds = useStore((s) => s.hiddenItemIds)
  const item = useStore((s) =>
    selectedItemIds.length === 1
      ? (s.items.find(
          (i) => i.id === selectedItemIds[0] && !i.locked && !hiddenItemIds.includes(i.id),
        ) ?? null)
      : null,
  )
  const tiltItem = useStore((s) => s.tiltItem)

  const [dragging, setDragging] = useState(false)
  const [live, setLive] = useState<{ pitch: number; roll: number } | null>(null)
  const gesture = useRef<Gesture | null>(null)

  const def = item ? catalogRef.current[item.defId] : undefined
  const isStaircase = def?.kind === 'parametric' && def.primitive === 'Staircase'

  const visible =
    tiltOn && editing && !draggingItemId && !activeDefId && !!item && !!def && !isStaircase

  useEffect(() => {
    if (!dragging) return

    const onMove = (ev: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      // MOBILE-1 (BUG-1 class): a second finger's own pointermove stream must
      // not drive this tilt — only the pointer that grabbed the ball.
      if (!isActiveDragPointer(g.pointerId, ev.pointerId)) return
      const { pitch, roll } = computeTiltDrag(
        g.startPitch,
        g.startRoll,
        ev.clientX - g.startX,
        ev.clientY - g.startY,
      )
      tiltItem(g.id, { pitch, roll })
      setLive({ pitch, roll })
    }

    const onUp = (ev: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      // MOBILE-1: only the initiating pointer may end the gesture.
      if (!isActiveDragPointer(g.pointerId, ev.pointerId)) return
      gesture.current = null
      setDragging(false)
      setLive(null)
      useStore.getState().setRotatingGizmo(false)
      const cur = useStore.getState()
      const it = cur.items.find((i) => i.id === g.id)
      const changed = !!it && ((it.pitch ?? 0) !== g.startPitch || (it.roll ?? 0) !== g.startRoll)
      if (changed && it) {
        cur.setPendingEdit({
          kind: 'transform',
          ids: [g.id],
          originals: [{ id: g.id, position: it.position, rotation: it.rotation }],
          priorItems: cur.past[cur.past.length - 1]?.items,
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
  }, [dragging, tiltItem])

  if (!visible || !item || !def) return null

  const scaleY =
    typeof item.props.scaleY === 'number'
      ? item.props.scaleY
      : typeof item.props.scale === 'number'
        ? item.props.scale
        : 1
  const itemHeight = def.defaultFootprint.h * scaleY
  const anchorY = tiltGizmoAnchorHeight(itemHeight, item.elevation ?? 0)
  const color = dragging ? COLOR_ACTIVE : COLOR_IDLE
  const pitch = live?.pitch ?? item.pitch ?? 0
  const roll = live?.roll ?? item.roll ?? 0

  const onGrab = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const st = useStore.getState()
    if (st.pendingEdit) st.confirmPendingEdit()
    st.pushHistory()
    // Record the initiating pointerId (MOBILE-1, BUG-1 class) + best-effort
    // capture on the grab ball mesh, same guarded pattern as
    // Furniture.tsx/RotateGizmo/ResizeGizmo — only this pointer may drive/end
    // the tilt.
    try {
      ;(e.nativeEvent.target as Element | null)?.setPointerCapture?.(e.nativeEvent.pointerId)
    } catch {}
    gesture.current = {
      id: item.id,
      startPitch: item.pitch ?? 0,
      startRoll: item.roll ?? 0,
      startX: e.nativeEvent.clientX,
      startY: e.nativeEvent.clientY,
      pointerId: e.nativeEvent.pointerId,
    }
    setLive({ pitch: item.pitch ?? 0, roll: item.roll ?? 0 })
    setDragging(true)
    st.setRotatingGizmo(true)
  }

  return (
    <group
      position={[item.position[0], anchorY, item.position[1]]}
      rotation={itemRotation({ pitch, roll, rotation: item.rotation })}
      userData={noExportUserData()}
    >
      {/* Anchor ring at the item's top-centre, purely a visual base for the rod. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <ringGeometry args={[0.05, 0.07, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.55}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/* Rod from the anchor to the grab ball — tilts with the item's live
          pitch/roll (the whole group carries the item's Euler tuple) so it
          always reads as "which way is this piece leaning". */}
      <mesh position={[0, TILT_ROD_LENGTH / 2, 0]} renderOrder={6}>
        <cylinderGeometry args={[0.012, 0.012, TILT_ROD_LENGTH, 10]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.85}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/* Wide invisible grab sphere — generous touch target, same pattern as
          RotateGizmo's grab band. */}
      <mesh
        ref={priorityRaycast}
        position={[0, TILT_ROD_LENGTH, 0]}
        onPointerDown={onGrab}
        renderOrder={7}
      >
        <sphereGeometry args={[TILT_HANDLE_RADIUS + 0.05, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>
      {/* Visible grab ball. */}
      <mesh position={[0, TILT_ROD_LENGTH, 0]} renderOrder={7}>
        <sphereGeometry args={[TILT_HANDLE_RADIUS, 20, 20]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
      {dragging && (
        <Html position={[0, TILT_ROD_LENGTH + 0.18, 0]} center distanceFactor={9}>
          <div className="measure-chip pointer-events-none">
            {`P ${toDeg(pitch)}° · R ${toDeg(roll)}°`}
          </div>
        </Html>
      )}
    </group>
  )
}
