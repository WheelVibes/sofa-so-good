import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { markPointerDownOnItem } from './clickVsDrag'
import { deselectOnMiss } from './deselectOnMiss'

function s() {
  return useStore.getState()
}

/** A primary-button release at the origin (no drag travel from the last
 *  pointerdown, which beforeEach fires at the origin too). */
function release(over?: Partial<MouseEvent>): MouseEvent {
  return { button: 0, clientX: 0, clientY: 0, ...over } as MouseEvent
}

describe('deselectOnMiss', () => {
  beforeEach(() => {
    s().__resetForTest()
    // A fresh gesture: the capture-phase window listener records the press
    // origin AND resets the "landed on an item" flag for this gesture.
    window.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }))
  })

  it('clears the selection when a click lands on empty space', () => {
    const id = s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    s().setSelectedItemIds([id])
    deselectOnMiss(release())
    expect(s().selectedItemIds).toEqual([])
  })

  it('does NOT deselect on the release of the gesture that selected an item', () => {
    // INSPECTOR-FLICKER: selecting opens the inspector, which shrinks the canvas
    // and shifts the item off the cursor, so this release's raycast misses and
    // fires onPointerMissed. The select gesture must survive its own release.
    const id = s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    s().setSelectedItemIds([id])
    markPointerDownOnItem() // the pointerdown landed on the item
    deselectOnMiss(release())
    expect(s().selectedItemIds).toEqual([id])
  })

  it('a later empty-space click (fresh gesture) still deselects', () => {
    const id = s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    s().setSelectedItemIds([id])
    markPointerDownOnItem()
    deselectOnMiss(release()) // survives the select gesture
    // Next gesture starts on empty space → flag reset by the window listener.
    window.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }))
    deselectOnMiss(release())
    expect(s().selectedItemIds).toEqual([])
  })

  it('ignores the tail of a camera drag (moved far from the press)', () => {
    const id = s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    s().setSelectedItemIds([id])
    deselectOnMiss(release({ clientX: 200, clientY: 200 }))
    expect(s().selectedItemIds).toEqual([id])
  })
})
