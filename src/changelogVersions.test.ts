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
 * **The allowlist is the load-bearing part.** Failing outright would force a
 * renumbering that was measured and declined (150 references across 46 source
 * files, to fix labels no tooling reads — `APP_VERSION` is the only version the
 * update flow compares). Silently ignoring duplicates restores the original
 * problem. Requiring *acknowledgement* means the next collision costs one line
 * and a sentence, and cannot happen unnoticed.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Version strings knowingly used twice, with the reason. Adding to this list is
 * how you acknowledge a collision; it is not how you make one acceptable.
 */
const KNOWN_DUPLICATE_VERSIONS: Readonly<Record<string, string>> = {
  // Historic, predates the parallel-worktree era.
  '0.29.3.6': 'Pre-existing duplicate inherited with the pruned C1-C250 history.',
  // The SECOND collision between the same two sessions, and the first this guard
  // caught — it fired on the 0.31.7.2 merge, which is exactly the moment it was
  // built for. The two sessions resumed numbering from the shared 0.31.6.0 base
  // (PR #110) and each reached .1/.2/.3 before their histories met again.
  '0.31.6.1':
    'Parallel worktrees resumed from the shared 0.31.6.0 base: drawing-accuracy (staging-merge + duplicate audit) and the Blender/graphics-realism arc (bpy groundwork).',
  '0.31.6.2':
    'Same collision: floor build-ups / FFL derivation vs Blender HDRI resolution + render_still.py.',
  '0.31.6.3': 'Same collision: this guard itself vs the docs/skills convention.',
}

/** Ranges where every build number is a known parallel-numbering collision. */
const KNOWN_DUPLICATE_RANGES: ReadonlyArray<{
  from: string
  to: string
  reason: string
}> = [
  {
    from: '0.31.5.249',
    to: '0.31.5.349',
    reason:
      'Two sessions numbered from the same 0.31.5.248 base in separate worktrees — the drawing-accuracy branch (.249-.314) and the graphics-realism arc (.249-.349, shipped as 0.31.6.0 in PR #110). Renumbering measured and declined; see the note at the top of CHANGELOG.md.',
  },
]

const CHANGELOG = join(__dirname, '..', 'CHANGELOG.md')

/** Every `## vX.Y.Z.B` heading, in file order. */
function headingVersions(): string[] {
  const text = readFileSync(CHANGELOG, 'utf8')
  return [...text.matchAll(/^## v(\d+\.\d+\.\d+\.\d+)/gm)].map((m) => m[1] as string)
}

/** `[major, minor, patch, build]`, for range comparison. */
function parts(v: string): [number, number, number, number] {
  const p = v.split('.').map(Number)
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0]
}

function inRange(v: string, from: string, to: string): boolean {
  const cmp = (a: string, b: string) => {
    const [pa, pb] = [parts(a), parts(b)]
    for (let i = 0; i < 4; i += 1) {
      if (pa[i]! !== pb[i]!) return pa[i]! - pb[i]!
    }
    return 0
  }
  return cmp(v, from) >= 0 && cmp(v, to) <= 0
}

function acknowledged(v: string): boolean {
  if (v in KNOWN_DUPLICATE_VERSIONS) return true
  return KNOWN_DUPLICATE_RANGES.some((r) => inRange(v, r.from, r.to))
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
    const seen = new Map<string, number>()
    for (const v of headingVersions()) seen.set(v, (seen.get(v) ?? 0) + 1)
    const unacknowledged = [...seen]
      .filter(([v, n]) => n > 1 && !acknowledged(v))
      .map(([v, n]) => `${v} (x${n})`)
      .sort()
    expect(
      unacknowledged,
      'Two commits claim the same version. If this is a parallel-worktree collision that should NOT be renumbered, add it to KNOWN_DUPLICATE_VERSIONS or KNOWN_DUPLICATE_RANGES with a reason — acknowledgement is cheap, an unnoticed collision is not.',
    ).toEqual([])
  })

  it('does not carry a STALE allowlist entry', () => {
    // An allowlist that outlives its duplicates quietly permits new ones in the
    // same range. Every explicitly named version must still be duplicated.
    const seen = new Map<string, number>()
    for (const v of headingVersions()) seen.set(v, (seen.get(v) ?? 0) + 1)
    const stale = Object.keys(KNOWN_DUPLICATE_VERSIONS).filter((v) => (seen.get(v) ?? 0) <= 1)
    expect(stale, 'these allowlisted versions are no longer duplicated — drop them').toEqual([])
  })

  it('acknowledges the collision this test was written for', () => {
    // A demonstration that the allowlist is doing real work rather than being
    // an empty formality: the 0.31.5.249-.349 range IS duplicated today.
    const seen = new Map<string, number>()
    for (const v of headingVersions()) seen.set(v, (seen.get(v) ?? 0) + 1)
    const dupes = [...seen].filter(([, n]) => n > 1).map(([v]) => v)
    expect(dupes.length).toBeGreaterThan(50)
    expect(dupes.every(acknowledged)).toBe(true)
  })
})
