# Standing review cycle — log

One entry per review pass of the rotation in `/tmp/photoreal-mobile/review-cycle.md`. Newest
first. Each entry records the date, the HEAD reviewed, the area, what was found, and which area
comes next.

## 2026-09-19 — area 2, orbit/dollhouse pass

- **HEAD reviewed:** `c2c752ce` (v0.35.10.3), branch `feat/photoreal-adaptive-fallback`.
- **Area:** 2 — orbit/dollhouse pass (boot framing, all reveal states, section cut, estate,
  day/night) over the default 4-room flat.
- **Coverage:** 388 frames captured and looked at. Boot + 8 azimuths × 2 elevations (35°/60°) +
  top-down + 2 low-elevation section-cut poses + 2 close dolly poses, × hours 08:00/13:00/18:30/
  21:00 × lights off/on, on **desktop-metal** (1200×900, `capable` pinned, 184 frames) and
  **phone-metal** (390×844 touch, `weak`, 176 frames); a reduced **desktop-swiftshader** arm
  (13:00 + 21:00, 6 poses, 24 frames). Every frame was looked at (contact sheets, then suspicious
  originals at full resolution); numeric cross-checks via a temporary `sharp` probe
  (deleted after).
- **Findings:** 2 (`O1`, `O2`) — 1 high, 1 medium, same root cause. Full table with evidence
  paths, subsystem file:line and fix hypothesis in `docs/audit/orbit-dollhouse-2026-09-19.md`.
- **Top finding:** `O1` — the WALL-REVEAL-CORNER-SPREAD mechanism
  (`src/apartment/walls/wallRevealMath.ts`, `useWallReveal.ts`, `WallSegment.tsx`) renders every
  near-camera wall mitre as a hard-edged bright vertical seam (1.5–3× the adjacent wall's luma),
  growing into a large occluding wedge at the two close dolly poses (kitchen corner, living
  window). Confirmed on desktop-metal, phone-metal and desktop-swiftshader, both elevations,
  both lights states, all four hours — not lighting-dependent, not renderer-dependent.
- **Four false leads chased down and ruled out** (recorded in the doc so they aren't rechecked):
  a perceived global warm-tint on lights-on (interior-only, exterior pixels unchanged), a
  perceived phone-viewport framing crop at azimuths 90°/180° (thumbnail-scale illusion; full-res
  frames are correctly framed), a perceived checkerboard of neighbour lit windows (thumbnail
  illusion), and a perceived black seam in every top-down frame (a tree canopy tip seen from
  directly overhead, not a backdrop seam).
- **Not re-reported (already OPEN):** `(l)` WINDOW-LUMINANCE, `(ah)` ceiling lightmap blotches,
  `z16` LIGHTS-TOGGLE-RECOMPILE, `z20` SWIFTSHADER-FLOOR-DIVERGENCE (visible again in the
  SwiftShader dolly-kitchen frames, consistent with the existing item), and the walk-mode pass's
  W1–W15 / interaction-sweep residuals.
- **Fixes applied:** none — this was a review-only pass (`src/` untouched).
- **Next area:** **3 — interaction sweep regression re-run** (full catalogue, corrected
  recorder, triage events).

## 2026-09-19 — area 1, walk-mode photoreal pass

- **HEAD reviewed:** `713151c2` (v0.35.9.0), branch `feat/photoreal-adaptive-fallback`.
- **Area:** 1 — walk-mode photoreal pass over every room of the default 4-room Serangoon North
  Vista flat.
- **Coverage:** 306 frames captured and looked at (274 Metal + 32 SwiftShader). 8 rooms × 2 poses × 4 hours (08:00 / 13:00 / 18:30 / 21:00) × lights
  off/on, plus 8 glance-up poses, on **phone-metal** (390×844 touch, `weak`, 137 frames) and
  **desktop-metal** (1200×900, `capable` pinned, 137 frames); a reduced **phone-swiftshader** arm
  (13:00 + 21:00, 1 pose per room, 32 frames — slow, ~24 s per lights-on program compile). Every frame was looked at; suspicious ones were
  cross-checked with numeric luma patches.
- **Findings:** 15 (`W1`–`W15`) — 6 high, 6 medium, 3 low. Full table with evidence paths, probable
  subsystem and fix hypotheses in `docs/audit/walk-photoreal-2026-09-19.md`.
- **Top 5:** `W1` lights-on is one global hour-blind wash · `W2` the daytime band (08:00/13:00/
  18:30) produces almost no change in the interior and there is no sun patch anywhere ·
  `W3` the corridor gets no daylight at all (floor luma 16 at noon vs 150 in the bedroom next
  door, and brighter at 21:00 than at 13:00) · `W5` no ceiling luminaire is visible from below
  although lights-on paints a glow there · `W4` a hard 7.6× vertical lightmap seam across the
  bath2 wall.
- **Also worth a fix brief:** `W15` — the boot loader splash reappearing full-screen over a
  live desktop walk session after a lights-on toggle at 18:30 (1 frame in 254; almost certainly
  the `z16` lights-toggle recompile made user-visible).
- **Not re-reported (already OPEN):** `(l)` WINDOW-LUMINANCE, `(ah)` ceiling lightmap blotches,
  `z16` LIGHTS-TOGGLE-RECOMPILE, `z20` SWIFTSHADER-FLOOR-DIVERGENCE, and the
  `docs/audit/interaction-sweep-2026-09-18.md` residuals (kitchen wing blowout, first-switch
  recompile, fan POPs).
- **Root causes surfaced by the in-session scene probe:** the scene's **one** directional light
  has `castShadow = false` at every hour (behind `W2`/`W3`), and 5 ceiling pendants are
  `visible = true` yet appear in none of the 306 frames (behind `W5`).
- **Fixes applied:** none — this was a review-only pass (`src/` untouched).
- **Next area:** **2 — orbit/dollhouse pass** (boot framing, all reveal states, section cut,
  estate, day/night).
