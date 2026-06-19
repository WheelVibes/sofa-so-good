# RD-408 — Richer set-dressing: density, variety, jitter + hero props

**Status:** design / implementer-ready
**Date:** 2026-06-19
**Parent:** `docs/research/2026-06-19-photoreal-parity-deepdive.md` §2.8 (RD-408, M, H)
**Scope:** RESEARCH/DESIGN ONLY — no code in this change.

> **Goal.** Make auto-furnished rooms read as richly, believably decorated
> (Coohom-grade) — more props, more variety, natural position/rotation jitter,
> and a few larger "hero" decor pieces — *without* clutter, collisions, or a
> draw-call blowup. Stay tasteful-by-default and stay procedural/CC0.

The shipped set-dressing pass (`applyDecorStyling` /
`applyDecorStylingForPlan`) already does the hard plumbing: surface→prop
mapping, seeded determinism, `noClip` props, per-room seeds, wired into
`furnishPlanItems(withDecor=true)`. RD-408 is a *tuning + extension* of that
single file plus a couple of new primitives — not a rewrite.

---

## 1. Current limits — what caps richness today

All citations are `src/furniture/layout/decorStyling.ts` unless noted.

| # | Limit | Where | Effect |
|---|-------|-------|--------|
| L1 | **Hard cap of 2 props per host** (`MAX_PER_HOST = 2`) | `decorStyling.ts:35`, enforced at `:169` (`if (placed >= MAX_PER_HOST) break`) | A 3-seat sofa or a 2.0 m sideboard gets the same 2 props as a tiny side table. No scaling with surface size. This is the single biggest richness cap. |
| L2 | **No rotation jitter** — every prop ships `rotation: 0` | `:185` (`rotation: 0`) | Books/bowls/frames all sit perfectly axis-aligned → the dead giveaway of "auto-placed". `item.rotation` *is* fully wired to the mesh (`Furniture.tsx:135` `rotation={itemRotation(item)}`), so jitter is free — it's simply never set. |
| L3 | **Tiny, fixed position spread** — slot 0 = −0.12 m, slot 1 = +0.12 m on X only, ±0.03 m jitter | `offsetPos` `:127–135` | Props line up on a single X axis at the host centre. No Z spread, no clustering, no awareness of host footprint size. Two props on a king bed look like two props on a stool. |
| L4 | **First-N prop selection, no variety/weighting** | `:168` (`for (const propId of candidateProps)`) — always takes the first `MAX_PER_HOST` of the priority list | Identical hosts (e.g. two matching nightstands) always get the *same* props in the *same* order. No anti-repeat, no weighting, no style-awareness. |
| L5 | **Small host vocabulary, table/shelf-top only** | `HOST_PROPS` `:44–70` (19 hosts) | No floor-standing hero props (corner plants, floor vases), **no wall decoration at all** (wall-art / gallery clusters / wall shelves never auto-place), no rug-anchored or window-anchored dressing. |
| L6 | **No per-room total cap** | `applyDecorStyling` has no room budget; `applyDecorStylingForPlan` (`:206`) just sums per-host output | Today bounded only by host count × 2, so it's small — but once we raise L1/L5 we *need* a room cap to stay tasteful + perf-safe. |
| L7 | **No tier / Simple-vs-Pro density awareness** | none | Same density everywhere. Fine for correctness, but we may want a denser "styled" look only at higher fidelity (see §3). |
| L8 | **Hero/large props excluded by nature** | floor props (`potted-plant`, `floor-vase`) are *not* `noClip` (`defs/decor.ts:683,241` have no `noClip`) | The current pass only emits `noClip` table-top props so it can skip collision checks (`:20–21`). Floor-standing hero props need a real collision/clearance check — a new code path. |

**Net:** richness today ≈ `2 × (#host surfaces)` identical-orientation table-top
trinkets. Believable but sparse, repetitive, and rigid.

---

## 2. Plan — the richness levers (all plug into `decorStyling.ts`)

Design principle throughout: **deterministic** (seeded PRNG already exists,
`mulberry32` `:98`), **tasteful caps** (never random-junky), and **collision-safe**
(table-top props stay `noClip`; new floor heroes get a real clearance check).

### 2.1 Density: per-surface budget by size + type (replaces L1)

Replace the flat `MAX_PER_HOST = 2` with a **computed budget** from the host's
footprint area and a per-host-type ceiling:

```
budget(host) = clamp(round(area / AREA_PER_PROP), 1, HOST_MAX[type] ?? 3)
```

- `AREA_PER_PROP ≈ 0.45 m²` → a 0.34 m² side table = 1 prop; a ~1.6 m² 3-seat
  sofa = 3 cushions + blanket; a ~1.8 m sideboard = 3 props.
- `HOST_MAX` ceiling per host type so a huge dining table doesn't get 6 bowls
  (e.g. sofa 4, bed 4, dining-table 3, sideboard/console 3, shelf 3, nightstand 2,
  side-table 1, desk 2). Keep ceilings conservative — tasteful beats dense.
- **Plug:** new `surfaceBudget(host, hostDef)` helper near `:127`; replace the
  `placed >= MAX_PER_HOST` guard at `:169` with `placed >= budget`.

Keep `MIN_HOST_AREA` (`:38`) as the "too small to dress" floor.

### 2.2 Position jitter + multi-row spread (replaces L3)

Generalise `offsetPos` (`:127`) to lay out *N* props across the host's **actual
footprint** (read `hostDef.defaultFootprint.w/d`, honour `host.rotation` so the
spread aligns to a rotated sofa):

- Distribute slots along the host's local long axis with even spacing, inset
  from the edges (e.g. usable span = `0.7 × dimension`), then add **seeded
  jitter** of ±`POS_JITTER` (≈ 0.04 m) on both local axes.
- Rotate the local (du, dv) offset by `host.rotation` into world X/Z before
  adding to `host.position`. (Currently offsets are world-X only and ignore
  rotation — wrong for any wall-flushed, rotated host.)
- **Plug:** rewrite `offsetPos` → `slotPositions(host, hostDef, count, rand)`
  returning `count` world `[x, z]`; call once per host, index by `placed`.

### 2.3 Rotation jitter (fixes L2)

Set each prop's `rotation` to a small seeded yaw so nothing is dead-square:

```
rotation = host.rotation + (rand() - 0.5) * ROT_JITTER   // ROT_JITTER ≈ 0.5 rad (~±14°)
```

Books/frames/bowls look hand-placed; cushions tilt naturally. Cushions/blankets
can take a wider jitter (`±20°`) than precise objects (frames `±8°`).

- **Plug:** replace the literal `rotation: 0` at `:185`. Per-prop jitter span via
  a small `ROT_JITTER_BY_PROP` map (default fallback). Deterministic via `rand()`
  so tests stay stable (assert non-zero + reproducible, not exact values).

### 2.4 Variety: weighted, anti-repeat, style-aware selection (fixes L4)

Three sub-levers, all inside the per-host loop (`:168`):

1. **Weighted shuffle, not first-N.** Give each candidate prop a weight; draw
   without replacement using `rand()` (Fisher–Yates biased by weight). The
   priority order in `HOST_PROPS` becomes weights (first = highest), so behaviour
   degrades gracefully to today's order when weights are equal.
2. **Anti-repeat across identical hosts.** Track a per-room `Set` of
   `(hostType→propId)` already used; when two matching nightstands exist, bias
   the second away from the first room-mate's pick so the pair differs. (Cheap:
   penalise already-used props' weight.)
3. **Style-aware sets (optional, low-risk).** The app *does* have styles —
   `LayoutPreset` (`presets/types.ts`) carries a `style` palette but no decor
   taxonomy. Add an **optional** `stylePalette` arg (e.g. `'japandi' | 'warm' |
   'coastal' | 'mono' | 'default'`) that *filters/weights* the candidate list
   (japandi → plants, books, sculpture; warm-industrial → books, candles, metal
   frames; coastal → vases, plants). Default `'default'` keeps today's behaviour.
   Thread it from `furnishPlanItems` (which knows the `preset`) → a new
   `style?` param on `applyDecorStylingForPlan` → `applyDecorStyling`. Strictly
   additive; ship behind the existing density work, not blocking.

- **Plug:** new `pickProps(candidates, budget, rand, usedInRoom, stylePalette)`
  replacing the `for (const propId of candidateProps)` body at `:168`.

### 2.5 Hero props — sparse, larger, floor + stacked (extends L5, needs L8 path)

A *few* deliberate large pieces lift a room from "tidy" to "designed". Add a
**second, room-level pass** (distinct from the per-host loop) that places **at
most 1–2 hero props per room**, chosen by room kind:

| Room kind | Hero candidates (existing defs) |
|-----------|--------------------------------|
| living / dining | large `potted-plant` (size `large`, e.g. fiddle/palm) in an empty corner; `floor-vase` with pampas beside a sofa/console |
| bedroom | `floor-vase` or medium `potted-plant` corner; **gallery wall** over the bed (see §2.6) |
| study | tall `potted-plant` corner |

Heroes are **floor-standing and NOT `noClip`**, so this pass must:

- Find candidate floor positions (room corners / dead zones) from the room bbox,
  inset by a wall clearance.
- **Collision + clearance check** against the already-arranged furniture using the
  existing helpers — `findItemOverlaps` (`collision/placement.ts`, already imported
  by `furnishPlan.ts:15`) and walkway/door clearance from `layout/designRules.ts`
  (`CLEARANCE`). Drop the hero if it can't fit (same philosophy as
  `dropOverlaps` in `furnishPlan.ts:171`).
- Because this needs collision data + room geometry, the hero pass is cleanest as
  a **new function in `decorStyling.ts`** that takes the room + arranged items +
  defs, OR is invoked from `furnishPlanItems` *after* `dropOverlaps` (it already
  has the plan, arranged furniture, and `findItemOverlaps`). **Recommended: a new
  `applyHeroProps(plan, furniture, defs, seed)` called from `furnishPlanItems`
  (`furnishPlan.ts:216`) alongside the existing styling pass**, so the `noClip`
  table-top pass stays collision-free and simple.

Cap: **≤ 1 hero per ≤ 12 m² room, ≤ 2 for larger** — heroes are punctuation, not
filler.

**New "stacked decor" hero variant (optional primitive):** a `decor-stack`
combining a few stacked books + a small sculpture/plant as one styled vignette
for large sideboard/console tops — one item, one styled cluster. Lower priority;
the weighted multi-prop budget (§2.1/2.4) already approximates this on shelf tops.

### 2.6 Wall + shelf decoration (fixes L5 — the biggest visible gap)

Walls are currently bare in auto-furnish. Add **wall-art placement** as part of
the hero/room pass (these are `mounted`, `noClip` per `defs/decor.ts:367,493` so
they don't need floor collision — only "is there a clear wall span" logic):

- **Over key anchors:** a single `wall-art` (or `wall-mirror`) centred above the
  **sofa**, the **bed headboard**, or a **sideboard/console**, at the def's
  `mountHeight`. One per anchor, deterministic.
- **Gallery cluster (hero):** 3 `wall-art` items in a tasteful grid/staircase
  above a sofa or bed — sizes/heights jittered, frames sharing a `frameColor`.
  Cap **one gallery wall per room**, only in living/master bedroom, only if the
  anchor's host has a backing wall (infer from host being wall-flushed: its
  position near a room edge + rotation facing into the room).
- Reuse `wall-art`'s `pattern`/`frameStyle` enums (`defs/decor.ts:367`) for visual
  variety; vary `artColor` per frame via the seeded PRNG.

- **Plug:** wall decoration shares the §2.5 room pass (needs room geometry + host
  positions to find the anchor wall). Keep it gated by a small
  `WALL_DECOR_PER_ROOM` cap.

### 2.7 Clutter + collision + perf guards (fixes L6)

- **Per-room total cap.** After the per-host + hero + wall passes, clamp total
  decor per room to `ROOM_DECOR_CAP` (≈ 10–12 items incl. wall art; scale gently
  with room area). Trim lowest-priority first. Prevents a 5-host living room from
  reading as a flea market. **Plug:** enforce in `applyDecorStylingForPlan`
  (`:213–217` loop) where per-room items are already grouped.
- **Table-top props stay `noClip`** → no collision math, as today (`:20–21`).
- **Floor heroes get real collision** (§2.5) → never overlap furniture/walkways.
- **Determinism preserved** — all randomness flows through the existing seeded
  `mulberry32`; per-room seed offset (`seed + idx * 997`, `:215`) keeps rooms
  distinct + reproducible.

### 2.8 Stay tasteful-by-default (cross-cutting)

- Conservative `HOST_MAX` ceilings + `ROOM_DECOR_CAP` (caps, not targets).
- Jitter is *small* (a few cm / ~10–15°) — natural, not chaotic.
- Heroes are *rare* (≤1–2/room). Gallery walls one-per-room max.
- Anti-repeat avoids the "same trinket everywhere" tell.
- A shared accent palette per room (derive 1–2 accent colours from the room seed,
  reuse for cushions/frames/spines) reads "coordinated" not "random" — cheap
  win, optional, layer last.

---

## 3. Perf — keep draw calls bounded

Each decor prop is its own parametric primitive → its own mesh group → several
draw calls. The perf audit
(`docs/research/2026-06-19-performance-scalability-audit.md`) confirms
`InstancedBoxes` (`scene/InstancedBoxes.tsx`) already collapses repeated
batten/shelf geometry inside a primitive, and `ContactShadow` shares one texture.
Levers to keep RD-408 cheap:

1. **Per-room cap (§2.7) is the primary perf bound.** With `ROOM_DECOR_CAP ≈ 10`
   and ~4–6 styled rooms, worst case ≈ 40–60 extra small props — well within
   budget for a procedural scene. This is the number to defend.
2. **Shared materials.** Decor primitives already pull from
   `materials/furnitureMaterials.ts` cached helpers (e.g. `getFabricMaterial` in
   `ThrowCushion.tsx`); the material cache (`materials/cache.ts`) dedupes by
   colour/finish. Drawing the accent palette (§2.8) from a *small* fixed set
   maximises cache hits across props → fewer unique materials → fewer state
   changes. **Do not invent per-prop bespoke materials.**
3. **Instancing for repeated sub-geometry.** New primitives with repeated boxes
   (e.g. a stacked-books hero, gallery-frame backs) must use `InstancedBoxes`
   like existing primitives, not N separate meshes.
4. **Tier-aware density (optional, §2.7 / L7).** Procedural props are cheap, so a
   per-room cap is likely sufficient on all tiers. *If* profiling shows a hit on
   the flat/Performance renderer, scale `ROOM_DECOR_CAP` and hero count down by a
   `density` factor passed from the caller (Performance ≈ 0.6×, Medium/High 1×).
   Keep this a single multiplier, not a branchy code path. **Default: same density
   all tiers; only add the multiplier if a profile justifies it** (per perf-audit
   "don't fix preemptively" guidance).
5. **No new GLBs / textures** — everything procedural/CC0, so no cache-eviction or
   licensing surface (CLAUDE.md dev-gating + GLTF-cache rules don't apply).

---

## 4. Sequence — agent-sized tasks

All density/jitter/variety tasks edit the **same file**
(`decorStyling.ts`) → they **must serialize** (conflict-group **A**). Hero +
wall passes touch `furnishPlan.ts` + new primitives (conflict-group **B**,
partially overlaps A via the shared call site). New primitives are independent
files (conflict-group **C**).

| ID | One-line | Effort | Files | Conflict-group |
|----|----------|--------|-------|----------------|
| **RD408-001** ✅ | Per-surface density budget by area+type (replace `MAX_PER_HOST`) | S | `decorStyling.ts`, `decorStyling.test.ts` | **A** (serialize first) — **shipped v0.1.0.47** |
| **RD408-002** ✅ | Position multi-slot spread over host footprint + rotation-aware, seeded jitter | M | `decorStyling.ts`, `decorStyling.test.ts` | **A** (after 001) — **shipped v0.1.0.47** |
| **RD408-003** ✅ | Rotation jitter per prop (per-prop jitter spans) | S | `decorStyling.ts`, `decorStyling.test.ts` | **A** (after 002) — **shipped v0.1.0.47** |
| **RD408-004** | Weighted + anti-repeat prop selection (`pickProps`) | M | `decorStyling.ts`, `decorStyling.test.ts` | **A** (after 003) |
| **RD408-005** | Optional style-aware prop weighting; thread `style` from `furnishPlanItems` | M | `decorStyling.ts`, `furnishPlan.ts`, tests | **A+B** (after 004) |
| **RD408-006** | Expand `HOST_PROPS` vocabulary + new tasteful primitives if needed (e.g. stacked-books hero, tray vignette) | M | `primitives/*.tsx` (new), `primitives/index.ts`, `PrimitiveKind` union, `defs/decor.ts`, primitive tests | **C** (parallel-safe) |
| **RD408-007** | Hero floor-prop pass (`applyHeroProps`): corner plants/floor vases with real collision/clearance check | L | `decorStyling.ts` (or new `heroProps.ts`), `furnishPlan.ts`, tests | **B** (after 001–004; uses `findItemOverlaps`/`CLEARANCE`) |
| **RD408-008** | Wall-art + gallery-cluster placement over sofa/bed/console anchors | M | same module as 007, tests | **B** (after 007) |
| **RD408-009** | Per-room total cap + lowest-priority trim (clutter/perf guard) | S | `decorStyling.ts` (`applyDecorStylingForPlan`), tests | **A/B** (after 007/008 land so cap sees all passes) |
| **RD408-010** | (Optional) tier/density multiplier + shared per-room accent palette | S | `decorStyling.ts`, caller, tests | **A** (last) |

**Recommended execution order:** A-chain `001 → 002 → 003 → 004 → 005`, in
parallel with **C** (`006`), then **B** (`007 → 008`), then `009` (cap over all
passes), then optional `010`. `006` is the only safely-parallel task.

**Docs to update on landing** (per CLAUDE.md "keep docs current"):
`src/furniture/CLAUDE.md` (the "Auto-arrange decor styling" bullet — new budget,
jitter, hero/wall passes, room cap), `docs/ARCHITECTURE.md` if the module gains a
new file (`heroProps.ts`), and `CHANGELOG.md`. No `FEATURE_FLAGS` entry needed —
this enriches an existing surface (auto-furnish), not a new user-facing feature;
confirm with the owner whether "richer styling" should ride the existing
auto-furnish flag.

---

## 5. Headless verification

Per CLAUDE.md visual-verification rule (this is an app-behaviour change) +
`decorStyling.test.ts` extension:

**Unit (`decorStyling.test.ts`) — assert in addition to existing cases:**
- Density scales with host size: a 3-seat sofa yields > a side table (RD408-001).
- Jitter is **non-zero and reproducible**: same seed → identical positions
  *and* rotations; at least one prop has `rotation !== 0` and a non-grid offset
  (RD408-002/003). (Assert determinism + non-zero, never exact float values.)
- Variety/anti-repeat: two identical hosts in a room do **not** receive an
  identical ordered prop list (RD408-004).
- Hero collision-safety: every hero floor prop passes `findItemOverlaps` against
  the arranged furniture (no overlap) and respects room-edge clearance
  (RD408-007).
- Per-room cap: no room exceeds `ROOM_DECOR_CAP` decor items (RD408-009).
- All decor still references valid catalog def ids; table-top props still
  `noClip` (keep the existing two assertions).
- Determinism preserved end-to-end (`applyDecorStylingForPlan` same-seed test).

**Scenario / screenshot** (`scripts/shot.mjs --scenario`, see
`docs/visual-verification-playbook.md`):
- Furnish a styled living/dining + master bedroom plan via `window.__store`,
  screenshot from a hero angle, **visually review**: props look hand-placed (not
  grid-aligned), no floating/clipping props, hero plant in a real corner not
  blocking a walkway, gallery wall reads tastefully (not cluttered). Capture a
  before/after.
- Assert headlessly via the store: decor item count is up vs. baseline but under
  the room cap; no two non-`noClip` decor items overlap furniture.

---

## Appendix — key files (cite map)

- `src/furniture/layout/decorStyling.ts` — the pass to tune (budget `:35`, jitter
  `:127`/`:185`, selection `:168`, per-room `:206`).
- `src/furniture/layout/decorStyling.test.ts` — extend coverage.
- `src/furniture/furnishPlan.ts` — wiring (`furnishPlanItems` `:199`, decor call
  `:216`, `dropOverlaps`/`findItemOverlaps` for the hero collision pattern `:171`).
- `src/furniture/defs/decor.ts` — all decor defs incl. `noClip`/`mounted` flags,
  hero candidates (`potted-plant` `:683`, `floor-vase` `:241`, `wall-art` `:367`,
  `wall-mirror` `:299`, `wall-shelf` `:493`), set-dressing props `:819+`.
- `src/furniture/primitives/` — primitive impls; rotation wired at
  `Furniture.tsx:135`; instancing via `scene/InstancedBoxes.tsx`.
- `src/furniture/presets/types.ts` — `LayoutPreset.style` (style-aware hook).
- `src/layout/designRules.ts` — `CLEARANCE` for hero/walkway checks.
- `src/furniture/collision/placement.ts` — `findItemOverlaps` for hero collision.
- `docs/research/2026-06-19-performance-scalability-audit.md` — draw-call budget,
  `InstancedBoxes`/material-cache facts (§3).
- `src/furniture/CLAUDE.md` — area rules + the decor-styling bullet to update.
