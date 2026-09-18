# Standing review cycle — log

One entry per review pass of the rotation in `/tmp/photoreal-mobile/review-cycle.md`. Newest
first. Each entry records the date, the HEAD reviewed, the area, what was found, and which area
comes next.

## 2026-09-19 — area 1, walk-mode photoreal pass

- **HEAD reviewed:** `713151c2` (v0.35.9.0), branch `feat/photoreal-adaptive-fallback`.
- **Area:** 1 — walk-mode photoreal pass over every room of the default 4-room Serangoon North
  Vista flat.
- **Coverage:** 290 frames captured and looked at (274 Metal + 16 SwiftShader). 8 rooms × 2 poses × 4 hours (08:00 / 13:00 / 18:30 / 21:00) × lights
  off/on, plus 8 glance-up poses, on **phone-metal** (390×844 touch, `weak`, 137 frames) and
  **desktop-metal** (1200×900, `capable` pinned, 137 frames); a reduced **phone-swiftshader** arm
  (1 pose per room; **16 of a planned 32** — stopped after the 13:00 half, ~8 min/frame under
  software rasterisation once the lamps are on). Every frame was looked at; suspicious ones were
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
- **Fixes applied:** none — this was a review-only pass (`src/` untouched).
- **Next area:** **2 — orbit/dollhouse pass** (boot framing, all reveal states, section cut,
  estate, day/night).
