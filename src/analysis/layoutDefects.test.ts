import { describe, expect, it } from 'vitest'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'
import {
  DEFECT_SEVERITY,
  defectScore,
  defectsByClass,
  SCORE_BASE,
  surveyLayoutDefects,
} from './layoutDefects'

/**
 * The ranked-defect baseline, and the agreement check that keeps it honest.
 *
 * `surveyLayoutDefects` deliberately RE-STATES rules that already live in
 * `roomCompleteness`, `roomOverhang`, `routeAccess`, `applianceWall`,
 * `diningChairTuck` and `windowSightline`, because a single ranked survey is
 * what v0.31.9.27 named as the prerequisite for any further arranger work: four
 * releases of levers each traded one defect class for another, and one line per
 * finding cannot tell a reshuffle from progress.
 *
 * Restating a rule risks drifting from it, so the counts below are pinned
 * against what those ratchets record. **Two disagreements showed up on the first
 * run and both were the survey being RIGHT:**
 *
 * - `outside-room` read 11 against `roomOverhang`'s 10, because this survey
 *   filtered by the room BOUNDS where that one filters by the inset RECT. A
 *   `dining-chair` in `tpl-1bed/ob-dining` sits between the two. Aligned to the
 *   rect.
 * - `blocked-window` read 3 against `windowSightline`'s 4, because that survey
 *   was not LEVEL-SCOPED and paired an `em-up` wardrobe with a ground-floor
 *   service-yard window. That test is fixed in the same release and now reads 3.
 *
 * `missing-fixture` at 6 is one MORE than `roomCompleteness`'s 5, and that is
 * deliberate: this survey also requires a WC and a basin, because the severity
 * order puts those at level 1 next to a kitchen with no hob. The sixth is
 * `tpl-terrace-ground/ctu-mbath`'s basin, which `bathroomFixtures.test.ts`
 * records. Leaving bathrooms out let the score bless a change that LOSES a
 * basin — exactly the trade v0.31.9.27 rejected the lever bundle for.
 *
 * **Re-baselined in v0.31.9.29** when levers A+C+D landed: `outside-room`
 * 10 -> 8, `unreachable-room` 12 -> 13, `marooned-wall-hugger` 37 -> 39, and the
 * score 61,012,173,703 -> 60,813,173,903. `missing-fixture` and
 * `stranded-satellite` are unchanged, and both are 1-for-1 SWAPS underneath —
 * `cs-kit`'s hob and counter for `emu-cbath`'s basin, and one dining chair
 * stranding in `tpl-hdb-jumbo` while another tucks elsewhere. Neither swap is
 * visible in a per-class count, which is the clearest illustration of why this
 * survey reports classes AND the ratchets keep their per-finding lists.
 *
 * **v0.31.9.32 (WALL-FIRST)**: `marooned-wall-hugger` 39 -> 38 and
 * `stranded-satellite` 17 -> 16, nothing worse, score 60,813,173,903 ->
 * 60,813,163,803. Note that NO per-class ratchet moved — the improved appliance
 * is outside `applianceWall`'s five-id regex and the improved chair is in a
 * template `diningChairTuck` does not list as clean. That is the case this
 * survey exists for: a real gain the per-finding lists cannot see.
 *
 * `stranded-satellite` was 17 and is NOT a disagreement: `diningChairTuck.test.ts`
 * asserts zero strays on eight named clean templates and says nothing about the
 * rest of the corpus. This is the first corpus-wide count.
 */
const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')!

const BASELINE = {
  'missing-fixture': 6,
  'outside-room': 8,
  'unreachable-room': 13,
  'stranded-satellite': 16,
  'marooned-wall-hugger': 38,
  'blocked-window': 3,
} as const

describe('ranked layout defects', () => {
  const defects = surveyLayoutDefects(PLAN_TEMPLATES, movein, BUILTIN_CATALOG)

  it('matches the recorded per-class counts', () => {
    expect(defectsByClass(defects)).toEqual(BASELINE)
  }, 300_000)

  it('scores the corpus, and a severity-1 finding cannot be bought with lesser ones', () => {
    const expected = Object.entries(BASELINE).reduce(
      (n, [cls, count]) =>
        n + count * SCORE_BASE ** (6 - DEFECT_SEVERITY[cls as keyof typeof BASELINE]),
      0,
    )
    expect(defectScore(defects)).toBe(expected)
    // The property that makes the score usable as a verdict: one missing hob
    // outweighs every lesser finding in the corpus put together. Base 10 FAILED
    // this — the ten `outside-room` findings summed to exactly one
    // `missing-fixture` — which is why `SCORE_BASE` is 100.
    const lesser = defects.filter((d) => d.severity > 1)
    expect(defectScore(lesser)).toBeLessThan(SCORE_BASE ** 5)
    // And the base only holds while no class runs away: 100 findings in one
    // class would equal a single finding one level up.
    for (const [cls, n] of Object.entries(defectsByClass(defects)))
      expect(n, `${cls} has outgrown SCORE_BASE`).toBeLessThan(SCORE_BASE)
  }, 300_000)

  it('surveys something in every class — the instrument is not vacuous', () => {
    // Three separate emptiness assertions on this thread have passed because a
    // loop body never ran. Every class must find at least one thing, or the rule
    // that produced it is not being exercised at all.
    for (const [cls, n] of Object.entries(defectsByClass(defects)))
      expect(n, `${cls} found nothing — rule not exercised`).toBeGreaterThan(0)
  }, 300_000)
})
