# IKEA compatible-model stacking — design

Combine compatible IKEA models so they sit physically snug and artifact-free,
like the IKEA room planner: a compatible mattress drops onto a bed frame at the
true mattress-support surface, centered on the sleeping area, sharing the
frame's rotation, joined as a group so they move/rotate as a unit.

## Context

- Compatibility is already resolved at runtime: `furniture/ikea/compatibility.ts`
  (`resolveCompatible`, ported from `python/scripts/compatibility.py`) matches a
  base's `compatibility.acceptsCategories` + `size` against imported IKEA defs.
- The inspector (`ui/inspector/IkeaBody.tsx`) already renders a **"Complete
  with…"** section listing matched groups — but clicking only *navigates*
  (`setActiveDefId`); it does **not** drop or stack anything.
- Items are floor-anchored: `FurnitureItem.position` is `[x, z]`, and
  `Furniture.tsx:110` renders every item under `<group position={[x, 0, z]}>`.
- A `surfaceHeight` prop convention already exists for surface-sitting items
  (lamps, microwave, decor). Collision (`collision/placement.ts`) reads it via
  `verticalSpan` and shifts the span up. Primitives self-lift internally; GLB
  items (`GltfModel`) do **not** read it.
- Emergent groups exist (`state/slices/groupsSlice.ts`): items share a
  `groupId`, move/rotate together, auto-dissolve below 2. `buildSetGroup`
  (`furniture/ikeaSets.ts`) is the precedent for stamping a shared `groupId` on
  freshly placed items.

## Scraper-data audit (does IKEA expose what we need?)

Verified the live IKEA PIP page (MALM bed frame) against the scraped
`metadata.json`:

- The scraper captures the **entire** Measurements modal verbatim (generic
  name/value row extraction in `scrape_measurements`), plus per-package
  measurements. It is **not** selectively dropping fields.
- IKEA does **not** publish a "mattress support height", "slatted base height",
  or "max mattress thickness". The only hint is good-to-know text: *"Adjustable
  bed sides allow you to use mattresses of different thicknesses."*
- Fields IKEA **does** expose and the scraper **does** capture, sufficient for
  fit + collision:
  - Bed frame: `Footboard height` (38 cm), `Headboard height`, overall
    `Height`, `Mattress length` (200 cm), `Mattress width` (90 cm),
    `Free height under furniture` (21 cm).
  - Mattress: `Thickness` (25 cm) + footprint `h` (0.2543 m), `size` (150x190).
  - Footprint `w/d/h` + `anchorOffset` (true mesh bbox + local centre) for every
    variant GLB.

**Conclusion:** no missing scraped field. The absent support-surface height is
exactly the gap the *category-fallback* path fills. Because the bed sides are
adjustable, IKEA's design intent is that the **mattress top sits flush near the
footboard rail** — so the snug rule is the designed behavior, not a guess.

## Fit strategy

Measurement-derived with category fallback. No GLB mesh-probing (the headboard
dominates the bbox; there is no clean slat region to raycast).

## Components

### 1. Support-surface resolver — `src/furniture/ikea/stacking.ts` (new)

Pure, render-free:

```
resolveStack(base: FurnitureItem, baseDef, topDef, topVariant)
  → { supportY, centerOffset: [dx, dz], rotation } | null
```

- **supportY** (Y where the *bottom* of the top item rests), per base category:
  - `beds`: parse `productMeasurements["Footboard height"]` (cm → m). Mattress
    *top* should align with the footboard rail, so
    `supportY = footboardHeight − topThickness`. Fallback `BED_SLAT_DEFAULT`
    (~0.13 m) when no footboard field. Clamp ≥ `Free height under furniture`
    when present.
  - seating (sofa accepting cushions): seat-height constant.
  - generic fallback: base footprint `h` (box top).
- **topThickness**: top variant footprint `h` (mattress already accurate).
- **centerOffset**: align top footprint centre to the base's *mattress recess*
  centre using `Mattress width/length` vs base footprint + `anchorOffset`
  (handles the headboard skewing the bbox centre off the sleeping area).
- Constants live in `src/layout/designRules.ts` next to `CLEARANCE`.
- Returns `null` (with reason) when no fit can be derived.

### 2. Placement core — same file

```
stackOnto(base, baseDef, topDef, topVariant) → { item, groupId } | { error }
```

1. `resolveStack` → fit, else `{ error }`.
2. Position: rotate `centerOffset` by base rotation, add to `base.position`;
   top inherits `rotation = base.rotation`.
3. Vertical lift: set `props.surfaceHeight = supportY` on the new item (the only
   Y mechanism).
4. Group: reuse `base.groupId` (`addToGroup`) if present, else mint one and
   stamp **both** base and top.
5. Return the item for the store to `addFurniture` in one history step.

**Required render change** (`Furniture.tsx:110`): change the outer group Y from
hard `0` to a resolved lift **for GLB-kind items only** —
`item.props.surfaceHeight ?? 0`. Primitives already self-lift in local space, so
gating on render kind avoids double-lifting. Collision is correct for free:
`verticalSpan` already reads `surfaceHeight`, so the mattress span sits at
`[supportY, supportY + thickness]` and clears the frame solids.

### 3. Triggers

**(A) Inspector "Complete with" picker** — enhance the existing section in
`IkeaBody.tsx`. Add a **"Place on this"** action per match that routes through
`stackOnto` → `addFurniture` + group stamp in one history step. Keep the
existing navigate-on-click as a secondary affordance. Disable with a tooltip
when `stackOnto` returns an error.

**(B) Drag-snap** — hook `DragController`. While dragging an IKEA item that is a
confirmed `resolveCompatible` match (as top) against the item under the cursor
(as base), and the drag XZ is over the base footprint: show a snap highlight
(reuse hover/`AlignmentGuides` styling) and, on drop, route through `stackOnto`
instead of free placement. No match → normal drag. Snap engages only on a
confirmed compatibility match.

### 4. Data flow

```
metadata.json (complete) ─► IkeaGltfDef (compatibility + footprint + productMeasurements)
   │
trigger (picker | drag-drop) ─► stackOnto()
   │   ├─ resolveStack() → supportY (measurement | fallback), centerOffset, rotation
   │   ├─ addToGroup | mint groupId
   │   └─ new FurnitureItem { position, rotation, props.surfaceHeight }
   ▼
store.addFurniture (1 history step)
   ▼
Furniture.tsx ─ GLB group lifted by surfaceHeight ─► snug render
collision/placement.ts ─ verticalSpan reads surfaceHeight ─► height-aware collision
```

### 5. Error handling & edge cases

- No fit resolved → category constant; if absent too, return error, disable the
  picker action / suppress drag-snap. Never float silently.
- Size mismatch → already gated by `resolveCompatible`.
- Ungroup/delete → existing groups logic auto-dissolves <2 and clears `groupId`;
  stacked items ride that. Deleting the base leaves the top at its lifted Y
  (matches current group-member-delete behavior).
- Save round-trip → `surfaceHeight` is a plain prop, `groupId` is schema v2;
  both already persist. No schema change.

### 6. Testing

- `stacking.test.ts` (unit): real MALM + VITMOSEN numbers → `supportY ≈
  footboard − thickness`, mattress top ≈ footboard height, centered on mattress
  recess (not bbox centre), rotation inherited, `groupId` on both. Category
  fallback path. Error path.
- placement test: stacked mattress span clears frame solids; a second floor item
  at the same XZ still collides.
- **Visual verification (required by CLAUDE.md):** drop a MALM frame, stack a
  mattress via picker + via drag-snap, screenshot, confirm snug on the rails
  with no float/clip; report from the screenshots.

## Scope (YAGNI)

- No parent-child relationship type — `groupId` only.
- No GLB mesh-probing.
- Optional scraper "Adjustable bed sides" flag → deferred to `TODO.md`.

## Docs to update (REQUIRED)

`CLAUDE.md` + `README.md` — document stacking under **IKEA models** / design
tools in the same change.
