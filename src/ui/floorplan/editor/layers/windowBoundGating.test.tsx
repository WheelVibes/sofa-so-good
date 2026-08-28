// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_CATALOG } from '../../../../furniture/builtinCatalog'
import type {
  FurnitureDef,
  FurnitureItem,
  FurnitureType,
  ParametricDef,
} from '../../../../furniture/types'
import { useStore } from '../../../../state/store'
import { FurnitureLayer } from './FurnitureLayer'
import { FurnitureRotateHandle } from './FurnitureRotateHandle'

/** A window-bound fixture def (curtain/blind) — statically snapped to its window. */
function windowBoundDef(): ParametricDef {
  for (const def of Object.values(BUILTIN_CATALOG)) {
    if (def.kind === 'parametric' && def.windowBound) return def
  }
  throw new Error('no window-bound parametric def found in catalog')
}

/** A normal (draggable/rotatable) parametric def. */
function normalDef(): ParametricDef {
  for (const def of Object.values(BUILTIN_CATALOG)) {
    if (def.kind === 'parametric' && !def.windowBound) return def
  }
  throw new Error('no normal parametric def found in catalog')
}

/** Place a single item on a wall-less custom plan and return the live item. */
function placeOne(defId: string): FurnitureItem {
  const s = useStore.getState()
  s.newFloorPlan({ name: 'Test plan', shell: true })
  s.setFloorPlan({ ...useStore.getState().floorPlan, walls: [], openings: [], rooms: [] })
  s.setItems([])
  const id = s.addItem({ defId: defId as never, position: [0, 0], rotation: 0, props: {} })
  s.selectItem(id)
  return useStore.getState().items.find((i) => i.id === id)!
}

const getDef = (id: FurnitureType): FurnitureDef | undefined => BUILTIN_CATALOG[id]

describe('FurnitureRotateHandle — window-bound gating', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  const baseProps = {
    getDef,
    PX: 100,
    toPx: (m: number) => m * 100,
    beginElementDrag: () => true,
    pointerWorld: () => [0, 0] as [number, number],
    setRotatingItem: vi.fn(),
  }

  it('renders the rotate ring/knob for a normal item', () => {
    const item = placeOne(normalDef().id)
    const { container } = render(
      <svg>
        <FurnitureRotateHandle item={item} {...baseProps} />
      </svg>,
    )
    expect(container.querySelector('[data-rot-handle]')).not.toBeNull()
  })

  it('renders nothing for a window-bound fixture (no rotate knob — would detach it)', () => {
    const item = placeOne(windowBoundDef().id)
    const { container } = render(
      <svg>
        <FurnitureRotateHandle item={item} {...baseProps} />
      </svg>,
    )
    expect(container.querySelector('[data-rot-handle]')).toBeNull()
  })
})

describe('FurnitureLayer — window-bound drag block', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  function renderLayer(item: FurnitureItem, setMovingItem: (v: unknown) => void) {
    return render(
      <svg>
        <FurnitureLayer
          items={[item]}
          getDef={getDef}
          catalogRef={{ current: BUILTIN_CATALOG }}
          PX={100}
          toPx={(m) => m * 100}
          tool="select"
          editMode="edit"
          fTilt={false}
          fPrice={false}
          labelsOn={false}
          planLabels="off"
          selectedItemId={item.id}
          selectedItemIds={new Set()}
          beginElementDrag={() => true}
          pointerWorld={() => [0, 0]}
          setMovingItem={setMovingItem as never}
          setRotatingMulti={vi.fn()}
          setScalingMulti={vi.fn()}
        />
      </svg>,
    )
  }

  it('starts a move drag for a normal item (control)', () => {
    const item = placeOne(normalDef().id)
    const setMovingItem = vi.fn()
    const { container } = renderLayer(item, setMovingItem)
    fireEvent.pointerDown(container.querySelector(`[data-item-id="${item.id}"]`)!)
    expect(setMovingItem).toHaveBeenCalledTimes(1)
    // Still selected (selectable), just not moved.
    expect(useStore.getState().selectedItemId).toBe(item.id)
  })

  it('does NOT start a move drag for a window-bound fixture, but keeps it selectable', () => {
    const item = placeOne(windowBoundDef().id)
    const setMovingItem = vi.fn()
    const { container } = renderLayer(item, setMovingItem)
    fireEvent.pointerDown(container.querySelector(`[data-item-id="${item.id}"]`)!)
    expect(setMovingItem).not.toHaveBeenCalled()
    // Selection still lands (so the inspector opens to inspect/unlock/resize).
    expect(useStore.getState().selectedItemId).toBe(item.id)
  })
})
