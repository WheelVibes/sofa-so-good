/**
 * The variation register end to end: capture → change → export.
 *
 * Both modes, per the hard rule (`variationRegister` is pro-tier).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { isFeatureEnabled } from '../features/featureFlags'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { useStore } from '../state/store'
import {
  assembleRenoAllocation,
  assembleVariationRegister,
  buildRenovationBudgetCsv,
} from './renovationBudget'

/**
 * Flip one room's floor between two materials of DIFFERENT rate kinds, so the
 * change always moves the wet-works cost regardless of where the previous test
 * left it.
 *
 * The first version of these tests just set marble unconditionally, and
 * `beforeEach` reset the plan but NOT `finishes` — so by the CSV test the room
 * was already marble and "changing" it was a no-op. That test passed or failed
 * depending on which ran first, which is worse than failing.
 */
function changeAFinish() {
  const st = useStore.getState()
  const roomId = Object.keys(st.finishes.floor)[0]!
  const current = (st.finishes.floor as Record<string, string>)[roomId]
  const next = current === 'floor-tile-marble' ? 'floor-wood-oak' : 'floor-tile-marble'
  st.setFloorFinish(roomId as never, next as never)
}

beforeEach(() => {
  const plan = buildDefaultPlan()
  useStore.setState({ floorPlan: plan, baselinePlan: plan } as never)
  useStore.getState().clearTenderedSnapshot()
  useStore.getState().setUiMode('pro')
  useStore.getState().reresolveFeatureFlags()
})

describe('variation register flow', () => {
  it('is null until a design is marked as tendered', () => {
    // An unmarked design has nothing to vary FROM; an empty table would imply
    // otherwise.
    expect(assembleVariationRegister(useStore.getState())).toBeNull()
  })

  it('reads unchanged immediately after capture', () => {
    useStore.getState().captureTenderedSnapshot()
    expect(assembleVariationRegister(useStore.getState())?.unchanged).toBe(true)
  })

  it('records the revision and date that were priced', () => {
    useStore.getState().captureTenderedSnapshot()
    const snap = useStore.getState().tenderedSnapshot!
    expect(snap.revision).toBe(useStore.getState().drawingSetTemplate.revision)
    expect(snap.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('reports a variation once a finish changes after capture', () => {
    useStore.getState().captureTenderedSnapshot()
    changeAFinish()
    const reg = assembleVariationRegister(useStore.getState())
    expect(reg).toBeTruthy()
    expect(reg!.unchanged).toBe(false)
    expect(reg!.lines.length).toBeGreaterThan(0)
  })

  it('is not mutated by later edits to the live design', () => {
    // The snapshot is deep-cloned. Sharing a reference would make the register
    // read "no change" forever, which is the worst possible failure for it.
    useStore.getState().captureTenderedSnapshot()
    const before = useStore.getState().tenderedSnapshot!
    const capturedFloor = { ...before.finishes.floor }
    changeAFinish()
    expect(useStore.getState().tenderedSnapshot!.finishes.floor).toEqual(capturedFloor)
  })

  it('appends the register to the budget CSV, on the same sheet as the price', () => {
    useStore.getState().captureTenderedSnapshot()
    changeAFinish()
    const st = useStore.getState()
    const csv = buildRenovationBudgetCsv(
      assembleRenoAllocation(st),
      assembleVariationRegister(st),
      st.tenderedSnapshot,
    )
    const reg = assembleVariationRegister(st)
    expect(reg?.unchanged, `register said unchanged; lines=${JSON.stringify(reg?.lines)}`).toBe(
      false,
    )
    expect(csv).toContain('VARIATION REGISTER')
    expect(csv).toContain('NET VARIATION')
    // It names the issue that was priced, not just that something changed.
    expect(csv).toMatch(/against Rev [A-Z]/)
  })

  it('omits the register block entirely when nothing changed', () => {
    useStore.getState().captureTenderedSnapshot()
    const st = useStore.getState()
    const csv = buildRenovationBudgetCsv(
      assembleRenoAllocation(st),
      assembleVariationRegister(st),
      st.tenderedSnapshot,
    )
    expect(csv).not.toContain('VARIATION REGISTER')
  })

  it('is suppressed in Simple mode (pro-tier flag)', () => {
    useStore.getState().captureTenderedSnapshot()
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    // The panel gates on the flag before assembling; assert the gate itself.
    expect(isFeatureEnabled('variationRegister')).toBe(false)
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
  })
})

describe('the tendered snapshot survives a save/restore round trip', () => {
  it('serialises and hydrates back, so the register outlives a reload', async () => {
    // Session-only (as .307 shipped) undercut the whole point: a tender
    // snapshot has to survive the weeks between pricing and building.
    const { serialize, applySerialized, SerializedStateZ } = await import('../state/schema')
    useStore.getState().captureTenderedSnapshot()
    const captured = useStore.getState().tenderedSnapshot!
    const parsed = SerializedStateZ.parse(
      JSON.parse(JSON.stringify(serialize(useStore.getState()))),
    )
    const restored = applySerialized(parsed, new Set())
    expect(restored.tenderedSnapshot?.revision).toBe(captured.revision)
    expect(restored.tenderedSnapshot?.at).toBe(captured.at)
    expect(restored.tenderedSnapshot?.finishes.floor).toEqual(captured.finishes.floor)
  })

  it('hydrates a save with NO snapshot to null, not undefined', () => {
    // The slice's initial value is `null`, so the register's "nothing marked
    // yet" branch must read identically on a fresh boot and on a restore.
    return import('../state/schema').then(({ serialize, applySerialized, SerializedStateZ }) => {
      useStore.getState().clearTenderedSnapshot()
      const restored = applySerialized(
        SerializedStateZ.parse(JSON.parse(JSON.stringify(serialize(useStore.getState())))),
        new Set(),
      )
      expect(restored.tenderedSnapshot).toBeNull()
    })
  })
})

describe('the variation register as a drawing-set sheet', () => {
  it('appends a sheet once something has changed since tender', async () => {
    const { buildDrawingSetHtml } = await import('./drawingSet')
    const { BUILTIN_CATALOG } = await import('../furniture/builtinCatalog')
    useStore.getState().captureTenderedSnapshot()
    changeAFinish()
    const st = useStore.getState()
    const html = buildDrawingSetHtml(
      st.floorPlan,
      st.items,
      BUILTIN_CATALOG,
      'metric',
      st.baselinePlan,
      undefined,
      undefined,
      st.finishes,
      undefined,
      undefined,
      st.drawingSetTemplate,
      0,
      false,
      false,
      false,
      assembleVariationRegister(st),
      st.tenderedSnapshot,
    )
    expect(html).toContain('Variation register')
    expect(html).toContain('NET VARIATION')
    // Names the issue that was priced — the point of issuing it as a sheet.
    expect(html).toMatch(/Against Rev [A-Z]/)
    // And carries the not-a-quotation caveat onto the handover document.
    expect(html).toMatch(/not a contractor/i)
  })

  it('omits the sheet when nothing has changed', async () => {
    // An empty variation sheet in a handover set reads as "no changes", which
    // is a stronger claim than "nothing was compared".
    const { buildDrawingSetHtml } = await import('./drawingSet')
    const { BUILTIN_CATALOG } = await import('../furniture/builtinCatalog')
    useStore.getState().captureTenderedSnapshot()
    const st = useStore.getState()
    const html = buildDrawingSetHtml(
      st.floorPlan,
      st.items,
      BUILTIN_CATALOG,
      'metric',
      st.baselinePlan,
      undefined,
      undefined,
      st.finishes,
      undefined,
      undefined,
      st.drawingSetTemplate,
      0,
      false,
      false,
      false,
      assembleVariationRegister(st),
      st.tenderedSnapshot,
    )
    expect(html).not.toContain('Variation register')
  })
})
