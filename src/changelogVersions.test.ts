/**
 * `CHANGELOG.md` version headings must be unique.
 *
 * **Why this exists.** Two sessions worked this repo in parallel worktrees and
 * numbered their builds from the same `0.31.5.248` base, so 67 version strings
 * ended up meaning two unrelated things. Neither session could have detected it
 * alone: the collision only exists once the histories meet.
 *
 * dev-09's framing, and it is the right one — the file-level coordination worked
 * because **git forces a conflict**, so the artefact is shared whether the two
 * parties cooperate or not. The version counter had no such artefact, so it
 * relied on memory across two processes that never run simultaneously. That is
 * an absent mechanism, not a discipline failure, and no amount of care fixes it.
 * This test is the missing artefact: it lives in the file both parties must
 * touch, and it **fails on merge rather than on write** — exactly when the
 * collision comes into existence.
 *
 * **The 67 duplicates are gone (v0.31.8.1).** They were renumbered on the
 * maintainer's decision: the drawing-accuracy branch's `.249`-`.314` became
 * `.350`-`.415`, clear of the graphics arc's `.349` ceiling. I had measured the
 * renumbering and advised against it (135 source references across 45 files, to
 * fix labels no tooling reads — `APP_VERSION` is the only version the update
 * flow compares); the call was the maintainer's to make, and it was made.
 *
 * A `KNOWN_DUPLICATE_RANGES` escape hatch used to live here, because
 * acknowledging 67 collisions one line at a time is not reasonable. It was
 * removed with the duplicates it described rather than left behind as an empty
 * array with a test that iterated nothing — a suppression mechanism with no
 * remaining subject is indistinguishable from an absent check, and knip would
 * flag it besides. If a parallel-numbering collision ever happens at that scale
 * again, reintroduce it; for one or two, the named allowlist below is enough.
 *
 * **The allowlist is still load-bearing.** Silently ignoring duplicates restores
 * the original problem. Requiring *acknowledgement* means the next collision
 * costs one line and a sentence, and cannot happen unnoticed.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Version strings knowingly used twice, with the reason. Adding to this list is
 * how you acknowledge a collision; it is not how you make one acceptable.
 */
const KNOWN_DUPLICATE_VERSIONS: Readonly<Record<string, string>> = {
  // Historic, predates the parallel-worktree era. Not renumberable: the entries
  // it belongs to were pruned from `main` with the C1-C250 history, so there is
  // nothing left to renumber against.
  '0.29.3.6': 'Pre-existing duplicate inherited with the pruned C1-C250 history.',
}

const CHANGELOG = join(__dirname, '..', 'CHANGELOG.md')

/** Every `## vX.Y.Z.B` heading, in file order. */
function headingVersions(): string[] {
  const text = readFileSync(CHANGELOG, 'utf8')
  return [...text.matchAll(/^## v(\d+\.\d+\.\d+\.\d+)/gm)].map((m) => m[1] as string)
}

/** Versions appearing more than once, with their count. */
function duplicates(): Array<[string, number]> {
  const seen = new Map<string, number>()
  for (const v of headingVersions()) seen.set(v, (seen.get(v) ?? 0) + 1)
  return [...seen].filter(([, n]) => n > 1)
}

describe('CHANGELOG version headings', () => {
  it('finds headings at all — a regex that matches nothing would pass every check below', () => {
    // The failure mode this guards: a heading-format change makes the whole
    // test vacuous and it keeps reporting green. A sample is not an
    // enumeration, and its coverage is invisible in the result.
    const all = headingVersions()
    expect(all.length).toBeGreaterThan(500)
    expect(all[0]).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
  })

  it('has no UNACKNOWLEDGED duplicate version', () => {
    const unacknowledged = duplicates()
      .filter(([v]) => !(v in KNOWN_DUPLICATE_VERSIONS))
      .map(([v, n]) => `${v} (x${n})`)
      .sort()
    expect(
      unacknowledged,
      'Two commits claim the same version. Renumber the later range, or — if it genuinely cannot be renumbered — add it to KNOWN_DUPLICATE_VERSIONS with a reason. Acknowledgement is cheap; an unnoticed collision is not.',
    ).toEqual([])
  })

  it('does not carry a STALE allowlist entry', () => {
    // An allowlist that outlives its duplicates quietly permits new ones under
    // the same name. Every allowlisted version must still be duplicated.
    // This is the test that caught the range entry going stale the moment the
    // renumbering landed, which is the whole reason it is worth having.
    const counts = new Map(duplicates())
    const stale = Object.keys(KNOWN_DUPLICATE_VERSIONS).filter((v) => (counts.get(v) ?? 0) <= 1)
    expect(stale, 'these allowlisted versions are no longer duplicated — drop them').toEqual([])
  })

  it('still has a real duplicate to acknowledge, so the allowlist is not a formality', () => {
    // Pairs with the stale check above: that one fails if an entry has no
    // subject, this one fails if the allowlist has no entries left to test. If
    // `0.29.3.6` is ever resolved, delete the allowlist AND this test rather
    // than leaving either as scaffolding.
    expect(duplicates().map(([v]) => v)).toEqual(['0.29.3.6'])
  })
})
