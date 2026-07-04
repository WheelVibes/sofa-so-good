// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { FurnitureItem } from '../furniture/types'
import { useStore } from '../state/store'
import {
  createDragHandlers,
  type DragGridCache,
  type RoomBoundsCache,
} from './dragControllerHandlers'

/**
 * Integration coverage for `DragController`'s window-level pointer handlers
 * (TEST-7) — the orchestration around the already-unit-tested pure helpers in
 * `dragHelpers.ts`. Per `docs/visual-verification-playbook.md`, R3F raycasting
 * can't be triggered headlessly, so `DragController` itself can't be mounted
 * in a `<Canvas>` here; `onMove`/`onUp` were extracted into
 * `createDragHandlers` (a behaviour-preserving seam, see that file's header)
 * so they can be driven directly with a stubbed `project` fn + real
 * `PointerEvent`s dispatched on `window` — the exact events the component
 * listens for. Mirrors the assertion style of
 * `scripts/scenarios/furniture-drag-multitouch.json` (BUG-1) and
 * `dragHelpers.test.ts`.
 */

// A minimal non-default floor plan with NO walls: `isDefaultPlan` is false (id
// isn't the built-in flat's id) so `placementWalls` resolves via
// `planCollisionWalls`, which returns `[]` for an empty `walls` array — zero
// wall obstacles, so only item-vs-item collision drives validity below. This
// keeps the suite decoupled from the real apartment's wall geometry.
const EMPTY_WALL_PLAN: FloorPlan = {
  id: 'test-empty-plan',
  name: 'Test',
  ceilingHeight: 2.8,
  extent: [20, 20],
  walls: [],
  openings: [],
  rooms: [],
} as unknown as FloorPlan

const item = (id: string, defId: string, x: number, z: number): FurnitureItem => ({
  id,
  defId,
  position: [x, z],
  rotation: 0,
  props: {},
})

/** Builds a fresh `onMove`/`onUp` pair wired to a stub `project` that maps
 *  screen (clientX, clientY) straight to world (x, z) — the camera/raycaster
 *  maths `DragController` performs to get there is out of scope for this
 *  suite; only the controller's orchestration around a resolved floor hit is
 *  under test. */
function setupHandlers() {
  const dragGridRef = { current: null as DragGridCache | null }
  const roomBoundsRef = { current: null as RoomBoundsCache | null }
  const snapBaseIdRef = { current: null as string | null }
  const setSnap = vi.fn((id: string | null) => {
    snapBaseIdRef.current = id
  })
  const catalogRef = {
    current: BUILTIN_CATALOG as Record<string, (typeof BUILTIN_CATALOG)[string]>,
  }
  const project = (clientX: number, clientY: number): [number, number] | null => [clientX, clientY]
  const { onMove, onUp } = createDragHandlers({
    project,
    catalogRef,
    dragGridRef,
    roomBoundsRef,
    snapBaseIdRef,
    setSnap,
  })
  return { onMove, onUp, setSnap }
}

const pointerEvent = (type: string, x: number, z: number, pointerId: number) =>
  new PointerEvent(type, { clientX: x, clientY: z, pointerId, bubbles: true, cancelable: true })

describe('DragController handlers — BUG-1 pointerId gating (TEST-7)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    useStore.setState({ floorPlan: EMPTY_WALL_PLAN })
  })

  it("only the initiating pointer's pointermove drives the drag; a foreign pointerId is a no-op", () => {
    const { onMove, onUp } = setupHandlers()
    useStore.getState().setItems([item('a', 'sofa-3seat', 0, 0)])
    useStore.getState().startDrag('a', { position: [0, 0], rotation: 0 }, [0, 0], 101)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    try {
      // The initiating pointer (101) drives the drag.
      window.dispatchEvent(pointerEvent('pointermove', 3, 3, 101))
      const afterFinger1 = useStore.getState().items.find((i) => i.id === 'a')?.position
      expect(afterFinger1).toEqual([3, 3])

      // A second finger's independent pointermove stream (pointerId 202) must
      // not hijack/teleport the item.
      window.dispatchEvent(pointerEvent('pointermove', 99, 99, 202))
      expect(useStore.getState().items.find((i) => i.id === 'a')?.position).toEqual(afterFinger1)

      // The second finger releasing must not end the drag either.
      window.dispatchEvent(pointerEvent('pointerup', 99, 99, 202))
      expect(useStore.getState().draggingItemId).toBe('a')
      expect(useStore.getState().dragPointerId).toBe(101)

      // Pointer 101 is still live and keeps driving the drag.
      window.dispatchEvent(pointerEvent('pointermove', 4, 4, 101))
      expect(useStore.getState().items.find((i) => i.id === 'a')?.position).toEqual([4, 4])

      // Only the initiating pointer's pointerup ends the gesture.
      window.dispatchEvent(pointerEvent('pointerup', 4, 4, 101))
      expect(useStore.getState().draggingItemId).toBeNull()
      expect(useStore.getState().dragPointerId).toBeNull()
    } finally {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  })

  it("a foreign pointer's pointercancel does not end a drag it didn't start", () => {
    const { onMove, onUp } = setupHandlers()
    useStore.getState().setItems([item('a', 'sofa-3seat', 0, 0)])
    useStore.getState().startDrag('a', { position: [0, 0], rotation: 0 }, [0, 0], 1)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointercancel', onUp)
    try {
      window.dispatchEvent(pointerEvent('pointermove', 2, 2, 1))
      window.dispatchEvent(pointerEvent('pointercancel', 50, 50, 9))
      expect(useStore.getState().draggingItemId).toBe('a')

      // The initiating pointer's own cancel DOES end it.
      window.dispatchEvent(pointerEvent('pointercancel', 2, 2, 1))
      expect(useStore.getState().draggingItemId).toBeNull()
    } finally {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointercancel', onUp)
    }
  })
})

describe('DragController handlers — invalid release keeps position + blocked pill (bug #6)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    useStore.setState({ floorPlan: EMPTY_WALL_PLAN })
  })

  it('an invalid drop STAYS at the dropped spot and resolves to a blocked pending edit (no snap-back)', () => {
    const { onMove, onUp } = setupHandlers()
    // 'b' is a fixed obstacle. Dragging 'a' (same def/footprint) fully onto it
    // is an invalid (colliding) drop. Bug #6: the item no longer snaps back —
    // it stays where dropped and the pending edit is `blocked` (EditConfirmBar
    // disables the tick), so it can never be committed but the user can still
    // drag it valid or cancel.
    useStore.getState().setItems([item('a', 'sofa-3seat', 0, 0), item('b', 'sofa-3seat', 10, 0)])
    useStore.getState().startDrag('a', { position: [0, 0], rotation: 0 }, [0, 0], 5)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    try {
      window.dispatchEvent(pointerEvent('pointermove', 10, 0, 5))
      expect(useStore.getState().dragValid).toBe(false)
      expect(useStore.getState().items.find((i) => i.id === 'a')?.position).toEqual([10, 0])

      window.dispatchEvent(pointerEvent('pointerup', 10, 0, 5))

      expect(useStore.getState().draggingItemId).toBeNull()
      // No snap-back: the item stays exactly where it was dropped.
      expect(useStore.getState().items.find((i) => i.id === 'a')?.position).toEqual([10, 0])
      // A blocked pending edit shows the pill with a disabled tick.
      const pe = useStore.getState().pendingEdit
      expect(pe?.blocked).toBe(true)
      // And it can't be committed — confirm is a no-op while blocked.
      useStore.getState().confirmPendingEdit()
      expect(useStore.getState().pendingEdit?.blocked).toBe(true)
      // Cancel reverts to the pre-drag transform.
      useStore.getState().cancelPendingEdit()
      expect(useStore.getState().pendingEdit).toBeNull()
      expect(useStore.getState().items.find((i) => i.id === 'a')?.position).toEqual([0, 0])
    } finally {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  })

  it('keeps the moved position on a valid release, with a non-blocked pending edit (control case)', () => {
    const { onMove, onUp } = setupHandlers()
    useStore.getState().setItems([item('a', 'sofa-3seat', 0, 0)])
    useStore.getState().startDrag('a', { position: [0, 0], rotation: 0 }, [0, 0], 5)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    try {
      window.dispatchEvent(pointerEvent('pointermove', 8, 8, 5))
      expect(useStore.getState().dragValid).toBe(true)
      window.dispatchEvent(pointerEvent('pointerup', 8, 8, 5))
      expect(useStore.getState().draggingItemId).toBeNull()
      expect(useStore.getState().items.find((i) => i.id === 'a')?.position).toEqual([8, 8])
      expect(useStore.getState().pendingEdit?.blocked).toBeFalsy()
    } finally {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  })
})

describe('DragController handlers — alignment guide publishing', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    useStore.setState({ floorPlan: EMPTY_WALL_PLAN })
  })

  it('publishes an alignment guide via setDragGuides when the dragged item snaps to a neighbour', () => {
    const { onMove } = setupHandlers()
    useStore.getState().setItems([item('a', 'sofa-3seat', 0, 0), item('b', 'sofa-3seat', 5, 5)])
    useStore.getState().startDrag('a', { position: [0, 0], rotation: 0 }, [0, 0], 7)

    window.addEventListener('pointermove', onMove)
    try {
      // Land close enough (< the 0.1 m align threshold) to b's X centre (5)
      // but far away on Z so only the X guide engages.
      window.dispatchEvent(pointerEvent('pointermove', 5.03, 12, 7))

      const { dragGuides } = useStore.getState()
      expect(dragGuides).toHaveLength(1)
      expect(dragGuides[0].axis).toBe('x')
      expect(dragGuides[0].value).toBeCloseTo(5, 5)
      // The centre-align snap also pulled the item onto the guide.
      expect(useStore.getState().items.find((i) => i.id === 'a')?.position[0]).toBeCloseTo(5, 5)
    } finally {
      window.removeEventListener('pointermove', onMove)
    }
  })

  it('publishes no guides when nothing is near an alignment candidate', () => {
    const { onMove } = setupHandlers()
    useStore.getState().setItems([item('a', 'sofa-3seat', 0, 0), item('b', 'sofa-3seat', 5, 5)])
    useStore.getState().startDrag('a', { position: [0, 0], rotation: 0 }, [0, 0], 7)

    window.addEventListener('pointermove', onMove)
    try {
      window.dispatchEvent(pointerEvent('pointermove', 40, 40, 7))
      expect(useStore.getState().dragGuides).toHaveLength(0)
    } finally {
      window.removeEventListener('pointermove', onMove)
    }
  })
})
