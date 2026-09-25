// @vitest-environment happy-dom
/**
 * R7-AA — a shared link must carry the heaviest furnish WHOLE.
 *
 * The real-browser ladder (`showroom-persistence-e2e.json`, R7-Y) found the
 * 149-item maisonette furnish arriving through a showroom link as 144 items:
 * the share loader's known-def set was `BUILTIN_CATALOG + userFurniture`, so
 * the bundled CC0 decor the furnish pass places from `GENERATED_FURNITURE`
 * (`ceramic-vase-wide` ×4, `book-set`) was dropped — and the toast blamed
 * "uploaded models". This pins the round trip at zero dropped items, and that
 * only a genuine upload is ever called one.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  designShareHash,
  droppedItemsNotice,
  encodeDesignShareCode,
} from '../../features/designShare'
import { PLAN_TEMPLATES } from '../../floorplan/templates'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { furnishPlanItems } from '../../furniture/furnishPlan'
import { GENERATED_FURNITURE } from '../../furniture/generatedCatalog'
import { isSenderOnlyDefId, knownFurnitureDefIds } from '../../furniture/knownDefIds'
import { LAYOUT_PRESETS } from '../../furniture/layoutPresets'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../store'
import { loadSharedDesignFromUrl, resetShareSessionForTests } from './bootstrap'
import { resetSharedLinkBackupForTests } from './sharedLinkBackup'

/** The heaviest furnish the app can produce: the maisonette, under whichever
 *  layout preset places the most items (the ladder's phase-0 recipe). */
function heaviestFurnish(): FurnitureItem[] {
  const tpl = PLAN_TEMPLATES.find((t) => t.id === 'tpl-hdb-maisonette')
  if (!tpl) throw new Error('maisonette template missing')
  useStore.getState().replaceFloorPlan(structuredClone(tpl), { furniture: 'clear' })
  const st = useStore.getState()
  let best: FurnitureItem[] = []
  for (const p of LAYOUT_PRESETS) {
    const items = furnishPlanItems(st.floorPlan, p, BUILTIN_CATALOG, st.doors)
    if (items.length > best.length) best = items
  }
  useStore.getState().setItems(best)
  return best
}

function lastToast() {
  const n = useStore.getState().notifications
  return n[n.length - 1]
}

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
  resetSharedLinkBackupForTests()
  resetShareSessionForTests()
  useStore.getState().__resetForTest()
})

afterEach(() => {
  window.location.hash = ''
  useStore.getState().__resetForTest()
})

describe('share link round-trip of the heaviest furnish', () => {
  it('arrives with every item — bundled decor included, zero dropped', async () => {
    const sent = heaviestFurnish()
    // The furnish really does lean on bundled GENERATED_FURNITURE props —
    // otherwise this test would not be exercising the regression.
    const generatedIds = new Set(GENERATED_FURNITURE.map((d) => d.id))
    const bundled = sent.filter((it) => generatedIds.has(it.defId) && !BUILTIN_CATALOG[it.defId])
    expect(bundled.length).toBeGreaterThan(0)
    expect(sent.length).toBeGreaterThanOrEqual(149)

    for (const viewOnly of [true, false]) {
      const code = encodeDesignShareCode(useStore.getState(), viewOnly)
      useStore.getState().__resetForTest()
      useStore.getState().setItems(sent)
      window.location.hash = designShareHash(code, viewOnly)
      await loadSharedDesignFromUrl()

      const got = useStore.getState().items
      expect(got).toHaveLength(sent.length)
      expect(got.map((i) => i.defId).sort()).toEqual(sent.map((i) => i.defId).sort())
      const toast = lastToast()
      expect(toast.kind).toBe('success')
      expect(toast.message ?? '').not.toMatch(/skipped/)
      expect(toast.message ?? '').not.toMatch(/uploaded models/)
    }
    // Furnishing the maisonette under every preset is the slow part (~9 s).
  }, 60_000)
})

describe('what a dropped item is called', () => {
  it('knows builtin, bundled, upload and pack ids', () => {
    const known = knownFurnitureDefIds({
      userFurniture: [{ id: 'user-abc' }],
      packFurniture: [{ id: 'pack-thing' }],
    })
    expect(known.has('ceramic-vase-wide')).toBe(true)
    expect(known.has('book-set')).toBe(true)
    expect(known.has(Object.keys(BUILTIN_CATALOG)[0])).toBe(true)
    expect(known.has('user-abc')).toBe(true)
    expect(known.has('pack-thing')).toBe(true)
    expect(known.has('user-someone-elses')).toBe(false)
  })

  it('only calls sender-only ids uploaded models', () => {
    expect(isSenderOnlyDefId('user-9f2c')).toBe(true)
    expect(isSenderOnlyDefId('ikea-billy')).toBe(true)
    expect(isSenderOnlyDefId('local:chairs/a.glb')).toBe(true)
    expect(isSenderOnlyDefId('ceramic-vase-wide')).toBe(false)
    expect(isSenderOnlyDefId('some-future-sofa')).toBe(false)

    expect(droppedItemsNotice(0, 0)).toBeUndefined()
    expect(droppedItemsNotice(2, 2)).toBe(
      "2 items skipped — uploaded models can't travel in a link.",
    )
    expect(droppedItemsNotice(1, 0)).toBe(
      '1 item skipped — not available in this version of the app.',
    )
    const mixed = droppedItemsNotice(3, 1) ?? ''
    expect(mixed).toMatch(/^1 item skipped — uploaded models/)
    expect(mixed).toMatch(/2 items skipped — not available/)
  })
})
