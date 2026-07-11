import { describe, expect, it } from 'vitest'
import { FEATURE_FLAG_KEYS } from '../../features/featureFlags'
import { resolveFlags } from '../../features/flags/resolve'
import { useStore } from '../../state/store'
import { FEATURE_DOCS } from '../docsUrl'
import { Icon } from '../toolbar/icons'
import {
  groupToolActions,
  resolveToolLabel,
  TOOL_ACTIONS,
  TOOL_CATEGORY_ORDER,
  toolActionsForSurface,
  visibleToolActions,
} from './toolActions'

describe('tool-action registry — invariants', () => {
  it('every action has a unique id', () => {
    const ids = TOOL_ACTIONS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every action gates on a real feature flag', () => {
    for (const a of TOOL_ACTIONS) {
      expect(FEATURE_FLAG_KEYS).toContain(a.flag)
    }
  })

  it('every action uses a real icon and a known category', () => {
    for (const a of TOOL_ACTIONS) {
      expect(Icon[a.icon]).toBeTypeOf('function')
      expect(TOOL_CATEGORY_ORDER).toContain(a.category)
    }
  })

  it('the tape tool carries its own icon, distinct from the Dimensions ruler (TB-8)', () => {
    const measure = TOOL_ACTIONS.find((a) => a.id === 'measure')
    expect(measure?.icon).toBe('Tape')
    // The ruler glyph stays on the toolbar's Dimensions overlay toggle.
    expect(measure?.icon).not.toBe('Measure')
    expect(Icon.Tape).toBeTypeOf('function')
  })

  it('every docs key (when set) maps to a documented guide section', () => {
    for (const a of TOOL_ACTIONS) {
      if (a.docs) expect(FEATURE_DOCS[a.docs]).toBeDefined()
    }
  })

  it('every action declares at least one surface and a callable run', () => {
    for (const a of TOOL_ACTIONS) {
      expect(a.surfaces.length).toBeGreaterThan(0)
      expect(a.run).toBeTypeOf('function')
      expect(a.isActive).toBeTypeOf('function')
    }
  })

  it('isActive + label resolve against a default store snapshot', () => {
    useStore.getState().__resetForTest()
    const s = useStore.getState()
    for (const a of TOOL_ACTIONS) {
      expect(typeof a.isActive(s)).toBe('boolean')
      expect(typeof resolveToolLabel(a, s)).toBe('string')
    }
  })
})

describe('tool-action registry — visibility resolution (both modes)', () => {
  // Pro-tier flags default-on → present in Pro, hidden in Simple. (See registry.)
  const pro = resolveFlags(true, {}, false, 'pro')
  const simple = resolveFlags(true, {}, false, 'simple')

  it('pro-tier analysis tools show in Pro and hide in Simple', () => {
    for (const id of ['drawings', 'daylight', 'design-score', 'accessibility', 'versions']) {
      const a = TOOL_ACTIONS.find((x) => x.id === id)!
      expect(pro[a.flag]).toBe(true)
      expect(simple[a.flag]).toBe(false)
      expect(visibleToolActions('desktop', pro).some((x) => x.id === id)).toBe(true)
      expect(visibleToolActions('desktop', simple).some((x) => x.id === id)).toBe(false)
    }
  })

  it('a simple-tier tool that is default-on stays visible in both modes', () => {
    // `measure` is simple-tier + default-on.
    expect(pro.measure).toBe(true)
    expect(simple.measure).toBe(true)
    expect(visibleToolActions('desktop', pro).some((x) => x.id === 'measure')).toBe(true)
    expect(visibleToolActions('desktop', simple).some((x) => x.id === 'measure')).toBe(true)
  })

  it('a flag that is off drops the action from every surface', () => {
    const off = { ...pro, comments: false }
    for (const surface of ['desktop', 'mobile', 'palette'] as const) {
      expect(visibleToolActions(surface, off).some((x) => x.id === 'comments')).toBe(false)
    }
  })

  it('mobile hides overview-only actions inside the room editor', () => {
    const inEditor = visibleToolActions('mobile', pro, { roomEditorActive: true })
    const inOverview = visibleToolActions('mobile', pro, { roomEditorActive: false })
    expect(inOverview.some((x) => x.id === 'walkthrough')).toBe(true)
    expect(inEditor.some((x) => x.id === 'walkthrough')).toBe(false)
  })
})

describe('tool-action registry — surface projections', () => {
  it('only palette-surface actions carry a palette projection', () => {
    const palette = toolActionsForSurface('palette').map((a) => a.id)
    // These analytical panels are reachable from ⌘K today.
    expect(palette).toEqual(
      expect.arrayContaining([
        'budget',
        'clearance',
        'design-score',
        'accessibility',
        'comments',
        'history',
        'versions',
      ]),
    )
    // Tape-measure + the drawing/daylight panels + walkthrough are menu-only.
    expect(palette).not.toContain('measure')
    expect(palette).not.toContain('drawings')
    expect(palette).not.toContain('walkthrough')
  })

  it('budget is palette-only — the File menus render it inside "Budget & costs" (TB-5)', () => {
    // The Tools menu/sheet must NOT render Budget any more: it anchors the
    // consolidated cost cluster in FileMenu / FileSection instead. ⌘K keeps it.
    expect(toolActionsForSurface('desktop').map((a) => a.id)).not.toContain('budget')
    expect(toolActionsForSurface('mobile').map((a) => a.id)).not.toContain('budget')
    expect(toolActionsForSurface('palette').map((a) => a.id)).toContain('budget')
  })

  it('groups preserve category order and drop empty sections', () => {
    const groups = groupToolActions(toolActionsForSurface('desktop'))
    expect(groups.map((g) => g.category)).toEqual(['analyze', 'review'])
    expect(groups.every((g) => g.actions.length > 0)).toBe(true)
  })
})
