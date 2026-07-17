import { beforeEach, describe, expect, it } from 'vitest'
import { findItemOverlaps } from '../../collision/placement'
import { FEATURE_FLAGS } from '../../features/featureFlags'
import { resolveFlags } from '../../features/flags/resolve'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { buildMergedCatalog } from '../../furniture/catalog'
import { defaultLayout } from '../../furniture/defaultLayout'
import { defaultParamProps } from '../../furniture/types'
import { LAYOUT_VARIANT_COUNT } from '../../layout/autoArrange'
import { useStore } from '../store'

const ROOM = 'livingDining'

/** Populate the (empty) test store with the default furnished flat's items,
 *  hydrating parametric defaults the same way the app does on load. */
const furnish = () => {
  const items = defaultLayout().map((e) => {
    const def = BUILTIN_CATALOG[e.defId]
    return def?.kind === 'parametric'
      ? { ...e, props: { ...defaultParamProps(def), ...e.props } }
      : e
  })
  useStore.getState().setItems(items)
}

/** Position/rotation signature of the whole item list (id-order-independent). */
const sig = () =>
  useStore
    .getState()
    .items.map(
      (i) =>
        `${i.id}:${i.position[0].toFixed(3)},${i.position[1].toFixed(3)}@${i.rotation.toFixed(3)}`,
    )
    .sort()
    .join('|')

const overlaps = () => {
  const s = useStore.getState()
  return findItemOverlaps(s.items, buildMergedCatalog(s))
}

describe('layoutVariantSlice — rerollRoomLayout (LAYOUT-REROLL)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    furnish()
  })

  it('starts with no tracked variants', () => {
    expect(useStore.getState().layoutVariants).toEqual({})
  })

  it('advances the per-room variant seed 1 → 2 → 3 → 0 (wraps)', () => {
    const seen: number[] = []
    for (let i = 0; i < LAYOUT_VARIANT_COUNT + 1; i++) {
      useStore.getState().rerollRoomLayout(ROOM)
      seen.push(useStore.getState().layoutVariants[ROOM])
    }
    // First tap → 1, then 2, 3, wrap to 0, then 1 again.
    expect(seen).toEqual([1, 2, 3, 0, 1])
  })

  it('changes the layout and keeps it collision-clean', () => {
    expect(useStore.getState().items.length).toBeGreaterThan(0)
    const before = sig()
    expect(overlaps()).toHaveLength(0)
    useStore.getState().rerollRoomLayout(ROOM)
    expect(sig()).not.toBe(before)
    expect(overlaps()).toHaveLength(0)
  })

  it('every variant in the cycle stays collision-clean', () => {
    for (let i = 0; i < LAYOUT_VARIANT_COUNT; i++) {
      useStore.getState().rerollRoomLayout(ROOM)
      expect(overlaps()).toHaveLength(0)
    }
  })

  it('one reroll = one undo step (pushHistory + setItems)', () => {
    const before = sig()
    useStore.getState().rerollRoomLayout(ROOM)
    expect(sig()).not.toBe(before)
    useStore.getState().undo()
    expect(sig()).toBe(before)
  })

  it('is a no-op for an empty room id', () => {
    const before = sig()
    useStore.getState().rerollRoomLayout('')
    expect(sig()).toBe(before)
    expect(useStore.getState().layoutVariants).toEqual({})
  })

  // A11Y: the reroll silently repositions every item — a screen-reader user
  // needs a toast announcement to know anything happened at all.
  it('announces the reroll via a toast (no silent layout change)', () => {
    useStore.getState().rerollRoomLayout(ROOM)
    const toasts = useStore.getState().notifications
    expect(toasts.some((t) => t.title === 'Layout rerolled')).toBe(true)
  })

  it('does not toast for a no-op empty room id', () => {
    useStore.getState().rerollRoomLayout('')
    expect(useStore.getState().notifications).toHaveLength(0)
  })
})

describe('layoutReroll flag gating', () => {
  it('is a simple-tier flag, default on, not dev-only', () => {
    expect(FEATURE_FLAGS.layoutReroll.tier).toBe('simple')
    expect(FEATURE_FLAGS.layoutReroll.default).toBe(true)
    expect(FEATURE_FLAGS.layoutReroll.devOnly).toBeFalsy()
  })

  it('is present in BOTH Simple and Pro mode (core arrange loop)', () => {
    expect(resolveFlags(false, {}, false, 'simple').layoutReroll).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').layoutReroll).toBe(true)
  })
})
