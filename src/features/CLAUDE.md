# src/features — feature flags & the Simple/Pro split

Area rules for the flag registry. The hard rules (every feature gated, every flag
categorised `tier`) are in the root `CLAUDE.md`; this file records what an audit of the
split actually found, so the same ground isn't re-walked.

- **Simple mode BEATS a dev override — check this before trying to A/B a pro flag.**
  `flags/resolve.ts:resolveFlags` orders its branches `devOnly` → **`tier === 'pro' &&
  uiMode === 'simple'`** → override → default. The pro/simple branch returns `false`
  *before* the override branch is reached, so a Simple user cannot enable a pro feature by
  any means, and neither can a probe: `?ff=<flag>:on` is silently ineffective while
  `uiMode` is `simple`. To measure what a pro flag DOES, run **both arms in Pro** and vary
  only that flag (`?ff=<flag>:off` vs `:on`), which keeps the control honest (meta-rule
  xvi). Anything the flag bakes at build time — a floor material, a texture — also needs
  the flag set BEFORE boot, or the already-built object is stale and the comparison
  measures nothing (meta-rule iv).

- **The split was audited in full (v0.31.5.45) and is essentially CORRECT — 205 flags,
  108 `pro` / 97 `simple`.** The overwhelming majority of `pro` entries gate genuinely
  analytical/professional surfaces exactly as the root rule intends: drawings, clearance /
  daylight / accessibility checks, quotes and price rules, DXF/CAD export, AI, versions,
  MEP and trade sheets, the asset designer. No re-tiering was done. What the audit was
  looking for is the narrow class that gates **passive rendering quality** — something a
  default user never sees and could not ask for, where the difference is visual rather
  than professional:
  · **Inert by default anyway, so the tier costs a default user nothing:**
    `hdriEnvironment` (only applies once the user picks an HDRI; `hdriId` defaults null),
    `iesLights` (only when a fixture carries an IES profile), `pomFloors` (additionally
    tier-gated to High/Maximum by `pomFloorTierEnabled`).
  · **User-driven camera tools, correctly pro:** `cameraDof`, `twoPointPerspective`,
    `parallelProjection` — these are instruments, not the default look.
  · **`tileBreakup` — the one true passive-look flag, and MEASURED AS IMMATERIAL.** It
    gates the floor-tile repetition break-up that `RoomFloor.tsx` / `PlanRoomFloor.tsx`
    bake in, and the default flat has tiled floors in the kitchen, both bathrooms and the
    shelter, so on paper it is a realism feature default users are denied. Measured with
    `scripts/dev-probes/tile-breakup.mjs` (both arms Pro, one flag varied, flag applied
    pre-boot, eye pitched down at the floor in each tiled room): kitchen **0.11
    meanAbsDiff / 0.01% of pixels**, bath1 0.36 / 0.69%, bath2 0.22 / 0.38%, shelter 0.27 /
    0.01% — at or below this repo's documented ~0.27 / 0.12% noise floor everywhere except
    a marginal bath1. Cropping shows why: the procedural `stoneTile` painter already varies
    each tile, so the extra break-up has little left to do. **Re-tiering it would hand
    Simple users a change they cannot see**, which fails meta-rule (ii).
  · **`proceduralSky` is the only pro flag that denies default users a VISIBLE capability**
    — the sun-driven exterior — and that is recorded as WINDOW-TIME-INVARIANT in
    `src/scene/CLAUDE.md`. It remains a content/product decision, not a bug.

- **Meta-rule (xiii) cuts one way only.** "A default-look change must not sit behind a
  `tier: 'pro'` flag" governs where YOU put a fix you are shipping. It is not licence to
  re-tier an existing feature: which capabilities define the Simple tier is a product
  decision, and the two rounds that tripped over `proceduralSky` (SKY-ANALYTIC-ORBIT
  measuring byte-identical, then WINDOW-TIME-INVARIANT) are documentation of a trap, not a
  mandate to move it.
