/**
 * The shipped default flat must PASS its own lamp-specification advisories.
 *
 * Before v0.31.8.0 it did not: the two bathroom ceiling lights and the kitchen
 * light carried the catalogue's IP20 / 3000 K default, so `buildLampSpecAdvisory`
 * raised 5 findings — 2 ingress, 3 colour-temperature — against the app's own
 * move-in content. A default that violates the advisories teaches users the
 * warnings are noise, which is worse than having no warnings at all.
 *
 * Two things are pinned here, and BOTH matter:
 *
 *  1. The default flat produces no findings. Guarded against vacuity by also
 *     asserting a fixture count — "no findings" must not be able to mean
 *     "nothing was examined", which is how this check would rot if the flat's
 *     lights were renamed or the room resolution broke.
 *
 *  2. The CATALOGUE default is still IP20 / 3000 K. This is the half that keeps
 *     the fix honest: the content was corrected, the check was not loosened. If
 *     someone ever "fixes" this by raising the catalogue default, test 1 would
 *     still pass while the advisory silently stopped firing for every user who
 *     drops a plain ceiling light in their own bathroom.
 */
import { describe, expect, it } from 'vitest'
import { buildLampSpecAdvisory } from '../../analysis/lampSpecAdvisory'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { roomAtItem } from '../../floorplan/levels'
import { BUILTIN_CATALOG } from '../builtinCatalog'
import { defaultLayout } from '../defaultLayout'
import { LIGHT_EMITTERS, resolveLampSpec } from '../lightEmitters'
import { defaultParamProps } from '../types'

/** The advisory inputs for the default flat, resolved the way `ui/report.ts` does. */
function defaultFlatFixtures() {
  const plan = buildDefaultPlan()
  return defaultLayout().flatMap((entry) => {
    if (!LIGHT_EMITTERS[entry.defId]) return []
    const room = roomAtItem(plan, { position: entry.position })
    if (!room) return []
    const def = BUILTIN_CATALOG[entry.defId]
    const props =
      def?.kind === 'parametric'
        ? { ...defaultParamProps(def), ...entry.props }
        : (entry.props ?? {})
    const lamp = resolveLampSpec(entry.defId, props)
    return [{ id: entry.id, label: entry.id, room, cct: lamp.cct, ip: lamp.ip }]
  })
}

describe('default flat lamp specification', () => {
  it('examines every placed fixture, so a clean result is not vacuous', () => {
    const fixtures = defaultFlatFixtures()
    // 19 emitters resolve to a room in the shipped flat. Asserted as a floor
    // rather than an equality so adding a lamp doesn't fail the suite, but
    // deleting the lighting (or breaking `roomAtItem`) does.
    expect(fixtures.length).toBeGreaterThanOrEqual(19)
    expect(buildLampSpecAdvisory(fixtures).checked).toBe(fixtures.length)
  })

  it('raises no advisory on the shipped content', () => {
    const advisory = buildLampSpecAdvisory(defaultFlatFixtures())
    // Named, not just counted — a bare length assertion gives no clue which
    // fixture regressed.
    expect(advisory.findings.map((f) => `${f.kind} ${f.fixtureId}`)).toEqual([])
  })

  it('specifies the wet rooms and the kitchen rather than relying on defaults', () => {
    const byId = new Map(defaultFlatFixtures().map((f) => [f.id, f]))
    for (const id of ['default-bath1-light', 'default-bath2-light']) {
      expect(byId.get(id)).toMatchObject({ ip: 44, cct: 4000 })
    }
    expect(byId.get('default-k-pendant')).toMatchObject({ cct: 4000 })
  })

  it('leaves the CATALOGUE default at IP20 / 3000 K, so the advisory still fires', () => {
    // The content was fixed; the check was not weakened. A user dropping a plain
    // ceiling light into their own bathroom must still be warned.
    expect(resolveLampSpec('ceiling-light', {})).toEqual({ cct: 3000, ip: 20 })
  })
})
