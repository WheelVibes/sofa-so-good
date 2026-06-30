import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICE_RULES } from '../analysis/renovationCost'
import { DEFAULT_QUOTE_TEMPLATE } from '../export/quoteTemplate'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import type { HistorySnapshot } from '../state/slices/historySlice'
import { buildHistoryTimeline, describeHistoryStep } from './historyTimeline'

function item(defId: string, x = 0): FurnitureItem {
  return { id: `${defId}-${x}`, defId, position: [x, 0], rotation: 0, props: {} }
}

function snap(over: Partial<HistorySnapshot> = {}): HistorySnapshot {
  return {
    items: [],
    doors: {},
    finishes: {} as never,
    floorPlan: {} as never,
    comments: [],
    drawingCallouts: [],
    quoteTemplate: DEFAULT_QUOTE_TEMPLATE,
    priceRules: DEFAULT_PRICE_RULES,
    ...over,
  }
}

const catalog: Record<string, FurnitureDef> = {
  sofa: { name: 'Sofa' } as FurnitureDef,
  lamp: { name: 'Lamp' } as FurnitureDef,
}

describe('describeHistoryStep', () => {
  it('labels a single furniture addition by name', () => {
    const a = snap({ items: [] })
    const b = snap({ items: [item('sofa')] })
    expect(describeHistoryStep(a, b, catalog)).toBe('Added Sofa')
  })

  it('labels a single removal by name', () => {
    const a = snap({ items: [item('lamp')] })
    const b = snap({ items: [] })
    expect(describeHistoryStep(a, b, catalog)).toBe('Removed Lamp')
  })

  it('counts multiple additions', () => {
    const a = snap({ items: [] })
    const b = snap({ items: [item('sofa', 0), item('lamp', 1)] })
    expect(describeHistoryStep(a, b, catalog)).toBe('Added 2 items')
  })

  it('labels a swap when both gained and lost', () => {
    const a = snap({ items: [item('sofa')] })
    const b = snap({ items: [item('lamp')] })
    expect(describeHistoryStep(a, b, catalog)).toBe('Swapped furniture')
  })

  it('detects an in-place move of the same furniture set', () => {
    const a = snap({ items: [item('sofa', 0)] })
    const b = snap({ items: [item('sofa', 5)] }) // moved
    expect(describeHistoryStep(a, b, catalog)).toBe('Moved furniture')
  })

  it('detects finish changes', () => {
    const a = snap({ finishes: { walls: { living: 'a' } } as never })
    const b = snap({ finishes: { walls: { living: 'b' } } as never })
    expect(describeHistoryStep(a, b, catalog)).toBe('Changed finishes')
  })

  it('detects door toggles', () => {
    const a = snap({ doors: { d1: { open: false } } as never })
    const b = snap({ doors: { d1: { open: true } } as never })
    expect(describeHistoryStep(a, b, catalog)).toBe('Toggled a door')
  })

  it('detects floor-plan edits', () => {
    const a = snap({ floorPlan: { id: 'x' } as never })
    const b = snap({ floorPlan: { id: 'y' } as never })
    expect(describeHistoryStep(a, b, catalog)).toBe('Edited floor plan')
  })
})

describe('buildHistoryTimeline', () => {
  it('flattens past + current + future into a chronological list with current marked', () => {
    const past = [snap({ items: [] }), snap({ items: [item('sofa')] })]
    const current = snap({ items: [item('sofa', 0), item('lamp', 1)] })
    // future stores the nearest-future state LAST (redo stack).
    const future = [snap({ items: [item('sofa', 0), item('lamp', 1), item('lamp', 2)] })]
    const { entries, currentIndex } = buildHistoryTimeline(past, current, future, catalog)
    expect(entries).toHaveLength(4)
    expect(currentIndex).toBe(2)
    expect(entries[2].isCurrent).toBe(true)
    expect(entries[0].label).toBe('Initial layout')
    // index 1: [] → [sofa] = Added Sofa; index 2: +lamp; index 3 (future): +lamp
    expect(entries[1].label).toBe('Added Sofa')
    expect(entries[2].label).toBe('Added Lamp')
    expect(entries[3].label).toBe('Added Lamp')
  })

  it('a lone current state is the only (initial) entry', () => {
    const { entries, currentIndex } = buildHistoryTimeline([], snap(), [])
    expect(entries).toHaveLength(1)
    expect(currentIndex).toBe(0)
    expect(entries[0].label).toBe('Initial layout')
    expect(entries[0].isCurrent).toBe(true)
  })
})
