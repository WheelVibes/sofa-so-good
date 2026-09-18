// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * REVEAL-EASE-ATTACHMENTS — a source-contract test, not a behavioural one.
 *
 * WALL-REVEAL-EASE (v0.35.1.1) moved the wall's own fade off a fixed
 * `cur += (target − cur) * 0.18` per-frame lerp onto `easeRevealOpacity` (a
 * frame-rate-independent exponential approach) and named the transparent
 * threshold `REVEAL_TRANSPARENT_AT` — but every ATTACHMENT (a door leaf, its
 * frame, skirting, a threshold strip, a plan wall's trim/glass, a wall
 * fitting) still carried its OWN inline `0.985` literal and, where it derived
 * its own target rather than reading the host wall's published opacity, its
 * OWN fixed `* 0.18` lerp. Two nearly-identical orbit frames could then land
 * the wall and its attachment on OPPOSITE sides of the threshold — a pop
 * between a solid wall and a see-through leaf/frame/trim during an orbit
 * gesture, worst on a demand-rendered canvas at a variable frame rate.
 *
 * The fix routes every attachment through the shared `easeRevealOpacity` from
 * `wallRevealMath.ts` — either by FOLLOWING the host wall's already-eased
 * `getWallOpacity`/`getWallOwnStrength`-derived value (the default flat's
 * `Door`/`Skirting`/`Window`/`Thresholds`/`WallFittings`/`PlumbingFittings`/
 * `PlanRoomShell`, which all read a per-wall opacity a wall shell already
 * eased once) or, where no such per-frame published value exists
 * (`PlanShell`'s `FadeWall`/`useTrimFade`/`FadeWindow`, `PlanDoorLeaf`), by
 * re-deriving the SAME target and easing it with the SAME helper/time-constant
 * so an independently-owned opacity still settles in lockstep with its wall.
 *
 * **WALL-REVEAL-HYSTERESIS (v0.35.5.0/.1) then latched the WALL's own discrete
 * opaque↔fading flip through `wallRevealMath.ts:revealPhase(prev, eased)` —
 * enter fading below `REVEAL_FADE_ENTER` (0.975), return to opaque above
 * `REVEAL_FADE_EXIT` (0.995) — because a bare `< REVEAL_TRANSPARENT_AT`
 * compare flips every frame a wall's eased opacity dithers across the single
 * threshold. `WallSegment.tsx`/`useWallReveal.ts` were routed; every
 * attachment below still carried its OWN bare `< REVEAL_TRANSPARENT_AT` (or
 * `< 0.985`) compare — so an attachment could flip on a dither frame its own
 * wall no longer would, landing the two on opposite sides again. This round
 * routes every attachment's discrete flip through `revealPhase` too, latched
 * per material: a dedicated `transparentRef`/`opaqueTransparentRef` where one
 * already existed (`Door`/`Window`/`PlanRoomShell`'s `PlanOpeningMesh`/
 * `PlanDoorLeaf`), the mesh's own persisted `mat.transparent` where a loop
 * iterates several meshes with no per-item ref (`Skirting`/`Thresholds`/
 * `PlanRoomShell`'s `PlanRoomThresholds`/`PlanShell`'s `FadeWall`/
 * `useTrimFade`), or the persisted `hidden` `Set<number>` keyed by fitting
 * index (`WallFittings`/`PlumbingFittings`). `PlanShell`'s `FadeWindow` never
 * toggled a discrete phase (the glass pane's `transparent` flag is fixed at
 * JSX declaration) and needed no change here. No file below imports
 * `REVEAL_TRANSPARENT_AT` directly any more — `revealPhase` owns the compare
 * against `REVEAL_FADE_ENTER`/`REVEAL_FADE_EXIT` internally, matching
 * `WallSegment.tsx`/`useWallReveal.ts`, which never imported the raw constant
 * either.
 *
 * `wallRevealMath.ts` itself (the one legitimate DEFINITION site for both the
 * `0.985` value and the internal `easeRevealOpacity`/`REVEAL_MAX_DELTA` maths
 * that used to read `* 0.18`-shaped constants, plus `revealPhase` itself) is a
 * `.ts` module, not a `.tsx` component, so it is never walked here — the
 * exclusion the brief describes ("outside wallRevealMath.ts") falls out of
 * the `.tsx`-only scope rather than needing an explicit allowlist entry.
 */

const APARTMENT_DIR = join(__dirname, '..')

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const p = join(dir, entry)
    const s = statSync(p)
    if (s.isDirectory()) walkTsx(p, out)
    else if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(p)
  }
  return out
}

/**
 * Blank out comment bodies while preserving line structure, so the guard scans
 * declarations rather than the prose explaining them (several files here —
 * `Door.tsx`, `WallSegment.tsx` — narrate the OLD `~0.985` threshold and the
 * old `0.18`-per-frame lerp in a `//` comment; those are history, not code).
 * Same approach as `src/styles/phantomTokenGuard.test.ts`.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
}

describe('REVEAL-EASE-ATTACHMENTS: no stray reveal-fade literal outside wallRevealMath.ts', () => {
  it('self-check: stripComments blanks a `//` comment quoting the banned literals', () => {
    expect(stripComments('// the old 0.985 threshold and the 0.18 lerp').trim()).toBe('')
    expect(stripComments('const x = op < 0.985 // was 0.18').trim()).toBe('const x = op < 0.985')
  })

  it('no `.tsx` file under src/apartment carries the inline 0.985 transparent threshold', () => {
    const offenders: string[] = []
    for (const f of walkTsx(APARTMENT_DIR)) {
      const code = stripComments(readFileSync(f, 'utf8'))
      if (code.includes('0.985')) offenders.push(f.slice(APARTMENT_DIR.length + 1))
    }
    expect(offenders).toEqual([])
  })

  it('no `.tsx` file under src/apartment carries the old fixed `* 0.18` per-frame lerp', () => {
    const offenders: string[] = []
    for (const f of walkTsx(APARTMENT_DIR)) {
      const code = stripComments(readFileSync(f, 'utf8'))
      if (/\*\s*0\.18\b/.test(code)) offenders.push(f.slice(APARTMENT_DIR.length + 1))
    }
    expect(offenders).toEqual([])
  })

  // The nine files this round (and REVEAL-EASE-ATTACHMENTS before it) touched —
  // a regression here would mean a bare compare crept back in, or a file lost
  // its `revealPhase` import while still flipping a discrete `transparent` flag.
  const ATTACHMENT_FILES = [
    'Door.tsx',
    'Skirting.tsx',
    'Window.tsx',
    'PlanRoomShell.tsx',
    'PlanDoorLeaf.tsx',
    'PlanShell.tsx',
    'floor/Thresholds.tsx',
    'fittings/WallFittings.tsx',
    'fittings/PlumbingFittings.tsx',
  ]

  it('every attachment imports revealPhase to latch its discrete flip', () => {
    for (const f of ATTACHMENT_FILES) {
      const source = readFileSync(join(APARTMENT_DIR, f), 'utf8')
      expect(source).toMatch(/\brevealPhase\b/)
    }
  })

  it('no attachment compares against REVEAL_TRANSPARENT_AT directly any more (WALL-REVEAL-HYSTERESIS)', () => {
    // `revealPhase` owns the compare against REVEAL_FADE_ENTER/REVEAL_FADE_EXIT
    // internally (see wallRevealMath.ts) — a consumer that still imports/reads
    // the raw threshold is a bare compare that slipped back in.
    for (const f of ATTACHMENT_FILES) {
      const source = readFileSync(join(APARTMENT_DIR, f), 'utf8')
      expect(source).not.toMatch(/REVEAL_TRANSPARENT_AT/)
    }
  })

  it('the two components that recompute their own target ease it with easeRevealOpacity', () => {
    // PlanDoorLeaf and PlanShell have no per-frame published wall opacity to
    // follow (unlike Door/Skirting/Window, which read `getWallOpacity`), so they
    // must ease their independently-derived target with the shared helper.
    for (const f of ['PlanDoorLeaf.tsx', 'PlanShell.tsx']) {
      const source = readFileSync(join(APARTMENT_DIR, f), 'utf8')
      expect(source).toMatch(/easeRevealOpacity\(/)
    }
  })
})
