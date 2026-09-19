# Orbit/dollhouse pass — default 4-room flat (review area 2)

Date 2026-09-19 · HEAD `c2c752ce` (v0.35.10.3, branch `feat/photoreal-adaptive-fallback`) ·
artefacts under `/tmp/review/orbit/` · scenarios `scripts/scenarios/review/orbit-dollhouse-*.json`
· **review only, no `src/` changes** (per the standing cycle, rotation item 2 —
`/tmp/photoreal-mobile/review-cycle.md`).

This resumes a run an earlier agent recorded before being killed by a rate limit; all frames
below were already on disk under `/tmp/review/orbit/` and were **not** re-recorded. Every frame
was looked at (contact sheets via `sharp`, then the suspicious originals at full resolution);
numeric cross-checks used a temporary `sharp` probe (`.patch-probe.tmp.mjs`, luma/RGB mean + min/
max over fixed pixel boxes — deleted at the end of this pass per the brief).

## Matrix run table

| Arm | Viewport | Renderer | Device class | Hours | Lights | Poses | Frames | Scenario |
|---|---|---|---|---|---|---|---|---|
| `desktop-metal-am` | 1200×900 | ANGLE Metal, Apple M4 | `capable`, pinned | 08:00, 13:00 | off + on | boot, 8×35°+8×60° azimuths, top, 2 low-elevation, 2 dolly (+2 early-reveal captures at 13:00) | **92** | `orbit-dollhouse-desktop-metal-am.json` |
| `desktop-metal-pm` | 1200×900 | ANGLE Metal, Apple M4 | `capable`, pinned | 18:30, 21:00 | off + on | same, early captures at 21:00 | **92** | `orbit-dollhouse-desktop-metal-pm.json` |
| `phone-metal-am` | 390×844 (touch) | ANGLE Metal, Apple M4 | `weak` | 08:00, 13:00 | off + on | same, no early captures | **88** | `orbit-dollhouse-phone-metal-am.json` |
| `phone-metal-pm` | 390×844 (touch) | ANGLE Metal, Apple M4 | `weak` | 18:30, 21:00 | off + on | same | **88** | `orbit-dollhouse-phone-metal-pm.json` |
| `desktop-swiftshader` | 1200×900 | SwiftShader (software) | `capable` | 13:00, 21:00 | off + on | reduced: boot, a45e35, a225e35, a45e60, top, dolly-kitchen | **24** | `orbit-dollhouse-desktop-swiftshader.json` |
| `validate` | mixed | — | — | — | — | harness sanity captures from the prior (killed) agent's setup | **4** | (ad hoc, not a review scenario) |

**Total 388 frames looked at.** Boot pose, all 8 azimuths at both elevations, top-down, both
low-elevation section-cut poses, and both close dolly poses (kitchen corner, living window) were
captured at every hour × lights combination on every Metal arm; the SwiftShader arm is
deliberately reduced per the brief (13:00 + 21:00, 6 poses, desktop only — software rasterisation
made each lights-on compile/settle cycle slow, consistent with `z16`/the walk-mode pass's note on
the same cost).

Camera was driven directly through `window.__three.controls`/`camera` (`window.__op`/`__otop`/
`__od`/`__oboot` helpers installed each run, mirroring `scripts/scenarios/galley-kitchen-sweep.json`'s
pattern), 3 s settle per pose, `deviceClass` pinned post-`scene-ready` per the playbook gotcha,
`interactiveDegrade` off, `cameraMode` asserted `'orbit'` before every capture.

## Ranked findings

### O1 — Wall-reveal CORNER-SPREAD produces a bright vertical seam at every near wall mitre, worst at close range (HIGH)

**⚠️ PARTIALLY FIXED v0.35.11.0 (MITRE-SEAM-IN-REVEAL) — the hypothesis below was disproved, not
confirmed.** A live raycast at the a225e35 pose found BOTH flanking meshes at `opacity 1.000`
(not fading), ruling out CORNER-SPREAD entirely for this pose — the real mechanism is two other
faces the bake structurally cannot cover: the wall body's own mitred end face (a diagonal
`computeBoxAtlasUv` was never taught to bucket correctly, sometimes additionally caught by
`markExteriorFaces`'s outward probe) and the ORBIT-CLEAN-CUT section cap reaching past a mitred
corner as an unmitred box. Both now take the analytic-fill sentinel `markMitreEndFaces`/
`markSectionCap` (see `src/apartment/CLAUDE.md`). Measured: seam patch **191.2 → 137.0** against
the adjacent wall's **82.5** (**2.32× → 1.66×**, target ≤1.15×) — a real, verified reduction, not
a full close: three's plain analytic ambient/direct fill still reads brighter than this wall's own
baked interior value, which is an honest residual, not re-opened corner geometry. Full mechanism,
the disproof and the fix: `CHANGELOG.md` v0.35.11.0.

**FURTHER CLOSED v0.35.11.2 (MITRE-END-INHERIT)** — the sentinel above is now a fallback, not the
first answer: a mitred end-face vertex projects onto its OWN wall's adjacent room-facing cap
(`lightmapMitre.ts`) instead of always taking the flat analytic fill. Real-GPU measurement at a
clean (non-animated) corner — the household-shelter/service-yard join, `a225e35`, 08:00 lights off
— found the residual was a DARK dip at this specific corner, not a bright one: **0.59–0.64× of the
adjacent wall before, 0.78–1.05× after**, i.e. closed rather than widened. The correction's SIGN
varies per corner (each now samples its own real bake instead of one flat guess, and not every
corner's true value sits below the sentinel), confirmed in the same direction on phone-metal
(`weak`) and SwiftShader at additional corners/hours; the scene-wide diagnostic log reports **0
mitred vertices fall back to the sentinel** on the default flat (every one resolved a real donor).
One honest residual: the walk-mode kitchen pose used to spot-check v0.35.11.0 is NOT
byte-identical under this change (meanAbsDiff 1.34 against a same-code twin-run floor of 0.057);
the affected pixels sit on a furniture cabinet corner + tile grout, not a wall body — furniture
never carries the mitred-end attribute this fix reads, so the cause is unconfirmed (most likely
inter-session grain/dither noise) rather than traced to this change. `wall-reveal-sweep.json` is
unaffected (0 divergence across all 36 azimuth steps, unchanged mechanism). Full numbers, the a225e35
before/after pixel trace and the walk-mode residual: `CHANGELOG.md` v0.35.11.2.

**Symptom.** Wherever two reveal-faded walls meet at a corner facing the camera, the mitre line
renders as a hard-edged, noticeably BRIGHTER vertical seam than either wall face beside it — not
a soft fade transition. At standard orbit distance it reads as a bright streak roughly 1.5–3×
the luma of the adjacent wall; at the two close "dolly" poses (kitchen corner, living window) the
same seam grows into a large, flat, hard-edged white triangular wedge that occludes part of the
room, and is joined by a second bright vertical sliver at a nearby wall seam.

**Evidence** (numeric, `sharp` mean luma over fixed boxes):

| Frame | Region | Luma | Adjacent-wall luma | Note |
|---|---|---|---|---|
| `desktop-metal-am/07-h8-off-a225e35.png` | corner mitre, x770 y290 30×140 | **180.8** (min 46 / max 243) | 60.9 | standard orbit distance, not a dolly pose |
| `desktop-metal-am/06-h8-off-a180e35.png` | 3 separate corners in one frame | **98.6 / 146.0 / 142.1** | 93.6 | multiple mitres light up simultaneously |
| `desktop-metal-am/15-h8-off-a225e60.png` | 2 corners, 60° elevation | **85.4 / 158.8** | 92.8 | reproduces at the higher elevation too |
| `desktop-metal-am/22-h8-off-dolly-living.png` | wedge, x0 y380 90×300 | **115.0** (min 2 / max 166) | 13.0 (opaque wall behind it) | close dolly — wedge, not a thin seam |
| `phone-metal-am/22-h8-off-dolly-living.png` | same wedge, portrait viewport | **97.3** (min 0 / max 175) | 91.3 | reproduces on the 390×844 touch viewport |
| `desktop-metal-am/21-h8-off-dolly-kitchen.png` | bright streak, x820 y470 | **121.0** (min 80 / max 254) | 100.3 (cabinet) | second dolly pose, same signature |
| `desktop-metal-pm/67-h21-off-dolly-kitchen.png` | corner wedge, night, lights off | present, hard edge (min 0 / max 84 in a 180×260 box) | — | reproduces at 21:00 with lights OFF — not lighting-dependent |
| `desktop-swiftshader/12-h13-on-dolly-kitchen.png`, `18-h21-off-dolly-kitchen.png` | same corner, SwiftShader | visible as a dashed vertical glow (software AA variant of the same edge) | — | reproduces on the software renderer too |
| `phone-metal-am/07-h8-off-a225e35.png` | same standard-distance streak | visually confirmed at full resolution | — | reproduces on portrait viewport, not just dolly |

Confirmed **present at both elevations (35°/60°), both lights states, hours 08:00/13:00/18:30/21:00,
all three renderer/viewport combinations tested** (desktop-metal, phone-metal, desktop-swiftshader).
Confirmed **absent** when a wall fades alone with no corner neighbour also fading (plain wall faces
in the same frames grade smoothly with no hard edge — see the "looks right" list).

**Subsystem.** `src/apartment/walls/wallRevealMath.ts:128` (`SPREAD_ONSET`), `:252`
(`cornerSpreadStrength`); applied in `src/apartment/walls/useWallReveal.ts:158–169` (room editor
shell) and `src/apartment/walls/WallSegment.tsx:530–543` (default-flat shell) — both call sites
are identical in shape: `strength = Math.max(strength, cornerSpreadStrength(toward, maxNb))`.
WALL-REVEAL-CORNER-SPREAD (documented in `src/scene/CLAUDE.md`) deliberately makes a wall that
shares a corner with a more-fading neighbour fade too, "graded... smoothly gated on the strongest
neighbour's own strength" — intended to avoid a *visible seam of mismatched opacity*. The seam
found here looks like the opposite failure mode of the same mechanism: at the corner PIXEL COLUMN
itself, `strength` jumps from this wall's own (low, near edge-on) value to the neighbour's higher
value over a narrow spread band, and every term hung off that opacity — the constant `#eceae4`
emissive lift (`(1 − opacity) * 0.7`, scene/CLAUDE.md rule 6) *and* the `exteriorBoost *
diffuseColor.a` sky-lit term (rule 7) — moves with it. Both terms are tuned against a SINGLE
wall's own smooth facing curve; at a corner they see a locally steeper alpha gradient than either
neighbour face experiences on its own, which would read exactly as a narrow, brighter-than-either-
side band right at the mitre. The close-dolly wedge is consistent with the same mechanism at
extreme grazing incidence, where `toward` for the near wall sits just past `SPREAD_ONSET` and the
spread and lift terms are both near their steepest part of the curve.

**Fix hypothesis.** Clamp or re-derive the emissive-lift and exterior-boost terms from the wall's
OWN facing strength (`own`, already published separately per the "first-degree" comment at
`useWallReveal.ts:155` and `WallSegment.tsx:527`) rather than from the corner-spread-inclusive
`strength`, so a corner's brightness terms never exceed what either contributing wall would show
alone; or add a `cornerSpreadStrength`-aware damping to the lift/boost uniforms specifically in
the spread band (`toward` between `SPREAD_ONSET` and `SPREAD_FULL`). Needs a real-GPU before/after
luma sweep at the same three corner boxes above (`h8-off-a180e35`/`a225e35`/`a225e60`) plus the two
dolly poses, both lights states, to confirm the fix doesn't just move the discontinuity.

**Reproduces:** yes — desktop-metal (am + pm), phone-metal (am + pm), desktop-swiftshader; both
elevations; boot/top/low-elevation poses unaffected (no near-camera corner in frame); every hour
and both lights states tested show it. **Severity: HIGH** — it is visible in ordinary orbit
browsing, not just an edge case, and it directly undermines the "looking into a real room"
illusion the dollhouse view exists to sell.

### O2 — Same corner-spread mechanism reads as a large occluding wedge at both dolly poses, not just a seam (MEDIUM, same root cause as O1)

**⚠️ PARTIALLY FIXED v0.35.11.0 (MITRE-SEAM-IN-REVEAL) — same fix as O1, re-verified at both dolly
poses.** The kitchen-corner dolly wedge is visibly gone (no large flat white wedge in the h13-on
frame); the living-window dolly wedge is down to a thin ~2 px bright sliver near the doorway,
from a large flat occluding wedge before. Neither pose was numerically re-measured against the
original evidence coordinates (camera framing shifts made the exact boxes non-comparable); the
visible severity drop is consistent with O1's measured 2.32× → 1.66×. The depth-prepass
interaction this row flagged as a second possible contributor was not found to be one — the
mitred end face and section cap fully account for what was measured.

**v0.35.11.2 (MITRE-END-INHERIT)** re-shot both dolly poses (kitchen-corner, living-window) at
13:00 and 21:00 on desktop-metal (`capable`), phone-metal (`weak`) and SwiftShader: visually
unchanged from v0.35.11.0 at these two poses — no wedge, no new bright/dark line reappeared —
which is the expected outcome, since O1's own numeric re-verification of this fix landed on a
different, non-animated corner (the household-shelter join) rather than either dolly pose; both
dolly frames carry an animating ceiling fan that dominates a naive pixel-diff, so the check here
is visual, not a pixel delta. See O1 for the numeric evidence and the walk-mode residual.

Recorded separately because the two "close dolly" checkpoints the brief calls out by name
(kitchen corner, living window) are visibly worse than the general case: the seam grows from a
1–2 px-equivalent bright line into a wedge tens of pixels wide that occludes cabinetry/furniture
behind it (see the `21-h8-off-dolly-kitchen.png` / `22-h8-off-dolly-living.png` frames referenced
above). If O1 is fixed by damping the corner-spread band's brightness terms, verify specifically
at these two dolly poses since the near-clip proximity may expose a second contributing factor
(possible interaction with the `WALL-REVEAL-DEPTH-PREPASS` twin at very close range — worth a
frame-time/material dump at exactly `window.__od(7.8,7.6,6.5,20,28)` before concluding O1's fix
alone is sufficient).

## "Looks right" (checked, no defect)

- **Plain wall reveal fade with no corner neighbour** grades smoothly at every azimuth tested
  (e.g. the near balcony wall in `desktop-metal-am/03-h8-off-a45e35.png`) — confirms O1/O2 is a
  corner-specific interaction, not a general fade problem.
- **ORBIT-NIGHT-CAPS** — section-cut wall tops are not blown out at 21:00 top-down
  (`desktop-metal-pm/88-h21-on-top.png`); no bright cap artefact found in any top-down frame,
  day or night.
- **Lights off/on correctly gates only fixture glow**, confirmed numerically: at the same pixel
  box, a floor lamp shade reads luma 41.4 (off) vs 167.6 (on) while the floor 2 m away is
  identical (19.6 / 19.6) between the two — no residual glow leak, at 21:00, low ambient.
- **Estate night-lights census is stable between lights-off and lights-on** — the same scattered
  neighbour windows are lit in both states at the same azimuth (only the OWN unit's interior
  changes), and reads as a genuinely lit real block at 21:00 rather than a grey box
  (`desktop-metal-pm/89-h21-on-low-a45e12.png`, `90-h21-on-low-a225e12.png`).
  Explicitly checked against the brief's "grey box vs real block" concern.
  Also stable across Metal ↔ SwiftShader at the same pose (`desktop-swiftshader/05-h13-off-top.png`
  vs the Metal equivalent — same tree, same layout, same shading).
  Not re-litigating SwiftShader's known floor-tone divergence (`z20` SWIFTSHADER-FLOOR-DIVERGENCE,
  already OPEN).
- **Phone (390×844) framing** correctly fits the whole plan at every azimuth including 90°/180°,
  despite the portrait aspect — the `fit()` helper's `min(half, half*aspect)` backs the camera up
  enough; small-thumbnail contact sheets made this look cropped at first glance, full-resolution
  frames show it isn't (a false lead, ruled out — recorded here so it isn't rechecked next pass).
  UI chrome (home + menu buttons) never overlaps the canvas at this viewport.
  A perceived "checkerboard" of lit neighbour windows at small thumbnail scale
  (`phone-metal-pm/55-h21-off-a45e60.png`) is also a thumbnail artefact — full resolution shows a
  normal scattered handful of lit windows, not a regular grid (a second false lead, ruled out).
  A perceived thin black seam at the top edge of every top-down frame is a tree canopy tip seen
  from directly overhead, not a sky-dome/backdrop seam (a third false lead, ruled out — checked
  at both day and night top-down and it is the same shape/position in both, consistent with static
  foliage geometry, not a lighting artefact).
- **Early (350 ms) vs settled (3000 ms) reveal-fade captures are pixel-identical**
  (`desktop-metal-am/47-h13-off-a45e35-early.png` vs `48-h13-off-a45e35.png`) — no double-layer
  flash caught mid-transition on a pure camera-position jump (the fade appears to already be at
  its target state by 350 ms for this jump size, or the fade doesn't animate on a discrete
  `__op()` call at all; either way no defect, though it means this harness didn't actually
  exercise a mid-fade frame — worth a slower camera tween if the next pass wants to test that).
- **Global colour tone difference between lights-off/-on boot frames** (initially looked like the
  whole exterior/estate warming when lights turn on) is entirely explained by the interior
  brightening — sky, trees, neighbour block pixels are unchanged between
  `desktop-metal-am/01-h8-off-boot.png` and `23-h8-on-boot.png` (a fourth false lead, ruled out).

## Already known (not re-reported)

Not re-reporting: `(l)` WINDOW-LUMINANCE, `(ah)` ceiling lightmap blotches, `z16`
LIGHTS-TOGGLE-RECOMPILE, `z20` SWIFTSHADER-FLOOR-DIVERGENCE (visibly present again in the
SwiftShader dolly-kitchen frames — softer, paler tones than the Metal equivalent — consistent
with the existing OPEN item, not a new finding), and the walk-mode pass's W1–W15
(`docs/audit/walk-photoreal-2026-09-19.md`) and interaction-sweep residuals
(`docs/audit/interaction-sweep-2026-09-18.md`).

## Top-5 next fixes

1. **O1** — damp the corner-spread band's emissive-lift/exterior-boost terms so a wall corner
   never reads brighter than either contributing face (`wallRevealMath.ts`, `useWallReveal.ts`,
   `WallSegment.tsx`).
2. **O2** — re-verify the two dolly poses specifically after an O1 fix; check for a second,
   depth-prepass-related contributor at extreme near-clip range.
3. Re-run this same corner-luma probe on **real GPU, both elevations, all 4 hours** before/after
   any fix — this pass used ANGLE Metal (real hardware) throughout, so the numbers above are
   already GPU-true, but a fix changes shader math and deserves the same box coordinates re-shot.
4. Confirm the fix doesn't regress `wallRevealSingleLayer.test.ts` /
   `wallRevealDepthPrepass.test.ts` / any corner-spread unit test — this is exactly the kind of
   change those suites exist to catch.
5. Once O1/O2 are closed, re-shoot the two dolly poses as the arc's "sells the photoreal illusion
   up close" reference frames — they are the two poses most likely to appear in the sofa-photoreal
   goal's showroom marketing, so they are worth a dedicated before/after pair.

## Cleanup

`.patch-probe.tmp.mjs` deleted after this pass (per the brief). The five untracked
`scripts/scenarios/review/orbit-dollhouse-*.json` scenario files are committed alongside this
doc so the matrix is reproducible.
