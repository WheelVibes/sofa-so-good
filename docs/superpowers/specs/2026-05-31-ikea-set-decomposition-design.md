# IKEA multi-piece sets → customizable groups — design

A scraped IKEA **set** (e.g. "VIHALS table and 2 folding chairs") is delivered
by IKEA as a single fused GLB whose mesh parts are named only by material
(`board`, `leg`, …) — there is no way to tell the table from the chairs. Today
the importer would land it as one atomic object: the user could move/refinish
the whole frozen set but never select a chair, remove one, add a fifth, or
re-space them.

This design makes a set a **group of independent member items** that the user
can move/rotate as one, drill into to edit a single piece, add to / remove from,
and that survives save/load.

It has two clearly-bounded parts that ship in order:

1. **Scraper** — detect sets, discover their member products, scrape each member
   as a normal standalone product, and emit a **set recipe** (members + counts +
   roles). No fused GLB is kept.
2. **App** — a **group concept** in the store, a **set-recipe → group** expander
   that arranges members with the existing footprint-aware arranger, and the
   interaction/persistence to make groups first-class.

Part 1 is independently testable and produces the real recipe data Part 2
consumes, so it is built first.

---

## Background: what IKEA actually exposes (verified)

For the VIHALS combination `s69599421`:

- The product **JSON feed** (`products/<last3>/<art>.json`) carries `name`,
  `typeName` ("table and 2 folding chairs"), category ("Dining sets") — but
  **no member article numbers**. The set is one product as far as the feed
  knows.
- The product **HTML page** has a **"What's included"** section
  (`pipf-list-view-item__wrapper`) listing member articles as dotted numbers
  (`705.957.33`, `405.927.45`, …). Stripping the dots yields the 8-digit
  standalone article numbers.
- Those members resolve as ordinary single-piece products with their own GLBs:
  - `705.957.33` → `70595733` → "VIHALS / gateleg table"
  - `405.927.45` → `40592745` → "VIHALS / folding chair"
- The page does **not** machine-readably state member **quantities** or
  **spatial arrangement**. Quantity is inferred (see Part 1 §"Quantities");
  arrangement is computed app-side (Part 2).

---

## Part 1 — Scraper: set detection + member recipe

All changes are in `python/scripts/ikea_model_scraper.py` plus its output schema.

### 1.1 Detecting that a product is a set

A product is treated as a set when **either** signal fires:

- **Category signal** — `category_hierarchy` / `catalogRefs` leaf or parent
  names match a set pattern: `/\b(set|sets)\b/i` under a furniture category
  (e.g. "Dining sets up to 2 seats", "Table and chair sets").
- **Type signal** — `type_name` matches a multi-piece pattern:
  `/\band\b.*\bchairs?\b/i` or `/\b\d+\s+(folding\s+)?chairs?\b/i`
  (e.g. "table and 2 folding chairs").

Detection is intentionally a touch eager; a "set" that turns out to have only
one member after discovery is demoted back to a normal product (§1.5), so false
positives are self-correcting.

### 1.2 Discovering member products (hybrid: page-first, series fallback)

`async def discover_set_members(page, product_json) -> list[MemberRef]`:

- **A — "What's included" (primary).** Parse the page's `What's included`
  list region for dotted article numbers (`\d{3}\.\d{3}\.\d{2}`), excluding the
  set's own number. Each becomes a `MemberRef{ article_number, name }` (name
  from the list item when present, else filled from the member JSON later).
- **B — Series match (fallback).** If A yields nothing (section absent /
  markup changed), query the product's `series` + category for standalone
  members of the expected roles (a table + chairs) and match by series name +
  finish text. Lower confidence; flagged `member_source: "series"`.
- The union is de-duplicated by article number, preserving page order (table
  tends to be listed first).

`MemberRef → standalone URL`: prefer a member URL captured from the list-item
anchor when present; otherwise build `https://www.ikea.com/<locale>/p/-<art>/`.
The bare `-<art>/` slug 301-redirects to the canonical product URL — verified:
`/sg/en/p/-70595733/` → `…/vihals-gateleg-table-white-70595733/`. Playwright
follows the redirect, and the existing extractor reads the canonical URL after
navigation, so either source works.

### 1.3 Scraping each member

Each discovered member URL is run through the **existing single-product path**
(`process_product` / its inner extraction), producing a normal variant-group
folder + GLB + metadata exactly as any standalone product would. Members are
crawled with the same limit/visited-set bookkeeping (a member already scraped
standalone is reused, not re-downloaded). The set itself does **not** download
its fused GLB.

### 1.4 Quantities

Quantity per member is resolved in priority order:

1. **Explicit count in the included list** (e.g. "2 ×" / "Qty 2" text in the
   list item), when present.
2. **Parsed from `type_name`** — leading integer before a role word
   ("table and **2** folding chairs" → chair ×2; the table is ×1 by default).
3. **Default ×1**.

### 1.5 Output: the set recipe

A set writes one extra file at the scraper output root:
`sets/<set_group_key>.json` (the set's own `group_key`, name-led per the
existing `variant_group_key`). Members are **not** duplicated into it — it
references them by `group_key`:

```jsonc
{
  "set_key": "vihals-vihals-table-and-2-folding-chairs",
  "set_name": "VIHALS / VIHALS table and 2 folding chairs",
  "set_article": "s69599421",
  "series": "VIHALS series",
  "style_group": "...",
  "design_text": "gateleg table white/red",
  "member_source": "included",            // "included" | "series"
  "members": [
    { "group_key": "vihals-gateleg-table", "role": "table", "qty": 1,
      "article_number": "70595733" },
    { "group_key": "vihals-folding-chair", "role": "chair", "qty": 2,
      "article_number": "40592745" }
  ]
}
```

- **role** is derived from each member's `design.category` / `type_name`
  (table | chair | bench | stool | other). It drives the app arranger.
- If discovery finds **< 2** total members, the set is **demoted**: no recipe is
  written and the product is scraped as a normal standalone (the combined GLB
  *is* then downloaded, since it's the only model we have). This is logged.
- `member_source: "series"` recipes are logged as lower-confidence for review.

### 1.6 Scraper testing

A `python/scripts/test_set_decomposition.py` (pytest, no network) covering:
- `is_set_product` on real `type_name` / category fixtures (positive +
  negative, incl. a plain "MALM bed frame" → not a set).
- Dotted-article extraction from a saved "What's included" HTML fixture →
  correct member articles, set's own number excluded.
- Quantity parsing from `type_name` ("…2 folding chairs" → 2; "…and chair" → 1).
- Role classification from member `type_name`/category.
- Demotion when < 2 members discovered.

---

## Part 2 — App: groups + set-recipe expansion

### 2.1 Store: a group concept

`FurnitureItem` gains one **optional** field (back-compat, like `flipX`/`locked`):

```ts
/** Items sharing a groupId move/rotate as a unit and select together.
 *  Optional + default undefined so existing saves stay valid. */
groupId?: string;
```

No separate group entity is stored — a group **is** the set of items sharing a
`groupId`. This keeps the atomic-item model intact (items remain independently
addressable) while letting group operations fold over `items`. A small set of
store helpers (new `groupsSlice.ts`, or folded into `itemsSlice`):

- `itemsInGroup(groupId)` → members.
- `groupBounds/groupCentroid(groupId)` → for unit move/rotate pivots.
- `groupItems(ids)` → assign a fresh `groupId` to the given items.
- `ungroup(groupId)` → clear `groupId` on its members.
- `removeFromGroup(itemId)` / deletion auto-dissolves a group that drops to
  **< 2** members (a 1-item group is just an item).

### 2.2 Selection: unit select + drill-in

In `selectionSlice` / the click handler (`scene/selection`):

- **First click on a grouped item** selects the **whole group**
  (`selectedItemIds = itemsInGroup(groupId)`), and sets a transient
  `activeGroupId`.
- **Second click on a member of the already-selected group** (or Alt/⌥-click)
  selects **just that member** for individual edit ("drill-in"), leaving
  `activeGroupId` set so the next outside click re-collapses to group context.
- Clicking elsewhere clears `activeGroupId`.
- Existing flat multi-select (marquee / shift-click) is unchanged; it simply
  selects items, which may span groups.

### 2.3 Drag/rotate as a unit

`DragController` **already** handles multi-item drag exactly as a group needs:
when `group.length > 1` it translates every selected member by the anchor's
delta, ignores in-group pairwise overlaps, re-checks `canPlace` against walls +
unselected items, and rejects the whole move on any collision
(`DragController.tsx:130-171`). So once §2.2 makes a click select the whole
group, **unit drag is free** — it flows through this path unchanged. The only
genuinely new transform is **group rotate about the group centroid** (not each
item's own origin) so the arrangement stays rigid; today rotate is per-item.
Group rotate reuses the same post-transform `canPlace` rejection rule.

### 2.4 Add / remove members

- **Remove**: deleting a selected member uses §2.1 auto-dissolve. No special UI.
- **Add**: when a single group is active, the Inspector shows an **"Add to
  group"** affordance; dropping/placing a catalog item while a group is active
  assigns the new item that `groupId`. Plain catalog drops with no active group
  behave as today.
- **Ungroup / Group**: a multi-select of 2+ items shows **"Group"**; an active
  group shows **"Ungroup"** (in the existing align/distribute multi-select
  panel).

### 2.5 Set-recipe → group expander (the IKEA path)

A new `src/furniture/ikeaSets.ts`:

- Loads set recipes (bundled/imported alongside IKEA member defs; recipes are
  part of the IKEA import payload, mirroring how member GLBs/metadata are
  ingested by the existing IKEA import path).
- `buildSetGroup(recipe, dropCentre) → FurnitureItem[]`:
  1. Expand members × qty into placeholder items (each member's `group_key`
     maps to its imported catalog def).
  2. **Arrange** by role using member **GLB footprints** + the existing
     interior-design rules: place the table at centre; distribute `chair`
     members evenly around the table's long edges at `CLEARANCE`-spaced
     offsets, facing the table; benches/stools by analogous rules; `other`
     members tucked alongside. This reuses `baseFootprint` and the spacing
     constants from `src/layout/` (`designRules.ts`/`autoArrange.ts`); a focused
     `arrangeSet(members, footprints)` helper lives next to them rather than
     overloading `arrangeRoom` (which is room-relative, not group-relative).
  3. Stamp all expanded items with one fresh `groupId`.
- The Sets menu (`SetsMenu` in `Toolbar.tsx`) lists imported IKEA set recipes
  alongside the built-in `FURNITURE_SETS`; dropping one calls `buildSetGroup`,
  appends the items, group-selects them, and pushes history — extending the
  existing drop path (which already drops + multi-selects) with the `groupId`
  stamp.
- The built-in `FURNITURE_SETS` optionally gain the same `groupId` stamp on
  drop so they too become real groups (low-risk reuse; keeps one code path).

### 2.6 Persistence + migration

- `schema.ts`: add `groupId: z.string().optional()` to `FurnitureItemZ`. Bump
  save `version` 1 → 2.
- `storage/migrations.ts`: a v1→v2 migration that is a **no-op on items**
  (absent `groupId` is already valid) — the bump exists so older readers don't
  silently accept v2 and so the migration registry has the entry; documents the
  field's introduction.
- Autosave/load round-trip groups via the same `items` array (groups are
  emergent from `groupId`, so nothing else to serialize).

### 2.7 App testing + REQUIRED visual verification

- **Unit/logic tests**: group helpers (group/ungroup/auto-dissolve at <2),
  group centroid/rotate math, `buildSetGroup` arrangement (chairs around table,
  no overlap, clearance respected) using fixture footprints, and a
  schema v1→v2 round-trip test.
- **Per CLAUDE.md, visual verification is mandatory** for these app changes.
  Using `window.__store` + `scripts/shot.mjs`:
  1. Drop an IKEA dining-set recipe → screenshot: table with chairs arranged
     around it, no overlaps.
  2. Click once → whole group highlighted; drag → moves as a unit (screenshot
     before/after); rotate → arrangement stays rigid.
  3. Drill-in (second/Alt click) → single chair selected; move it; delete it →
     group still coherent; screenshot.
  4. Add a chair to the group via the Inspector affordance → screenshot.
  5. Save → reload → group still moves as a unit (screenshot).
  Each screenshot is **visually reviewed** and findings reported, not just
  captured.

---

## Out of scope (YAGNI)

- Keeping/serving the fused set GLB (decided against; members only).
- Nested groups (a group inside a group).
- Automatic re-arrangement when a member is resized/swapped (user re-spaces).
- Splitting an *arbitrary* fused GLB into pieces (the rejected "Option B" from
  brainstorming) — we rely on IKEA's standalone member products instead.

## Build order

1. **Part 1 (scraper)** — detection, hybrid discovery, member scrape, recipe
   output, pytest. Independently shippable; yields real recipes.
2. **Part 2a (groups core)** — `groupId`, helpers, selection drill-in,
   unit drag/rotate, add/remove, schema v2 + migration, logic tests.
3. **Part 2b (IKEA expander)** — `ikeaSets.ts`, `arrangeSet`, Sets-menu wiring,
   then the mandatory visual verification pass.
