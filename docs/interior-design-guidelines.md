# Interior-design guidelines (placement rules)

Space-planning rules this project follows when authoring default layouts,
presets, and the auto-arranger (`src/layout/autoArrange.ts`). Clearances are
codified as metric constants in **`src/layout/designRules.ts`** (`CLEARANCE`,
`tvViewingDistance`) — reference those rather than hard-coding gaps so all
placement stays consistent. Keep this doc and that module in sync.

## Core principles

- **Anchor big pieces to walls.** Storage (wardrobes, bookshelves, dressers,
  shoe/cube cabinets, consoles), appliances (fridge, washer), kitchen
  counters, beds and desks sit **flush against a wall** (≈5 cm skirting gap),
  facing into the room. Never float them mid-room.
- **TVs go on a solid, windowless wall** — never in front of a window (glare +
  you can't wall-mount on glazing). Check `WINDOWS`/`DOORS` in
  `apartment/constants.ts` before choosing the wall.
- **Seating faces the focal point.** The sofa faces the TV; a sofa + TV are on
  opposite walls. A coffee table sits centred between them.
- **Keep circulation clear.** Maintain walkways and never block a door's or
  window's swing/operation.
- **Never block a window.** No piece **taller than the sill**
  (`CLEARANCE.windowSillTall = 0.95` when the opening has no explicit sill)
  may stand in the 0.65 m zone in front of a window
  (`clearance.ts:windowFrontRects`); a **near-zero sill** (full-height window
  or balcony sliding door) is a hard keep-out for *every* floor-standing
  piece. Short pieces (a low console, a bench) may sit under a normal sill.
- **Minimise clutter / maximise space.** Push pieces to the perimeter, leave
  the centre open, group by function (lounge zone vs. dining zone).

## Clearances (metres) — `CLEARANCE`

| Rule | Ideal | Min | Notes |
|------|-------|-----|-------|
| Main walkway between big pieces | 0.90 (`walkwayIdeal`) | 0.60 (`walkwayMin`) | 30–36″ / 18–24″ |
| Through-passage / doorway route | 0.75 (`passage`) | — | single-file |
| Sofa front ↔ coffee table | 0.40 (`sofaToCoffee`) | — | 14–18″, within reach |
| Door / drawer / cabinet swing | 0.85 (`doorSwing`) | — | ≈ the leaf width |
| Walk-around at a bed | 0.60 (`bedSurround`) | — | ≥1 long side + foot |
| Flush-to-wall gap | 0.05 (`wallGap`) | — | skirting / AC trunking |
| Clear floor in front of storage | 0.75 (`storageFront`) | — | open + pass |

## TV viewing distance — `tvViewingDistance(diagonalInches)`

4K rule of thumb: **1.2–1.6 × the screen diagonal**. e.g. 55″ ≈ 1.7–2.1 m,
65″ ≈ 2.0–2.5 m. Place the sofa within this band of the TV wall.

## Per-room patterns (used by the auto-arranger)

- **Living / dining:** TV + console flush on the windowless wall; sofa on the
  opposite wall facing it; coffee table + rug centred (a rectangular coffee
  table's **long side runs parallel to the sofa**); dining set in the
  secondary zone with chairs tucked in; storage flush to side walls; plants /
  floor lamps in corners.
- **Bedroom:** bed **headboard centred & flush to a wall**, with nightstands
  flanking it; wardrobe/storage on a *different* wall (keeping door-swing
  clearance); optional bench at the foot if it fits; lamps/plants in corners.
  Headboard-wall choice follows SG norms (scored in `arrangeBedroom`):
  **never under a window** (hard-reject a windowed span), **avoid
  foot-to-door** (the door's centreline crossing the bed foot — the classic
  feng-shui "coffin position"), prefer a wall that leaves `bedSurround`
  walk-around on both long sides.
- **Living seating groups.** Armchairs join the sofa's conversation group —
  placed at 90° beside the sofa facing the coffee-table centre (wall
  placement is the fallback), not scattered to random walls.
- **Dining near the kitchen.** The dining set is biased toward the room edge
  adjoining the kitchen (service path — food travels one short hop), falling
  back to the classic secondary-zone fraction when no shared edge exists.
- **Kitchen / bath / utility:** counters, appliances and fixtures run flush
  along the walls; nothing floats; circulation kept clear.

## Space-saving practices (small HDB rooms)

- **Sliding / pocket doors** on wardrobes where a hinged leaf would eat scarce
  floor — no swing clearance needed. Default bedroom wardrobes use
  `doorStyle: 'sliding'`.
- **Push to the perimeter, keep the centre open**; prefer corner placement for
  the bed (two sides to walls) so circulation collapses to one path.
- **Wall-mounted / floating** pieces (TV, floating console, wall shelves) free
  the floor and read lighter.
- **Multi-functional / nesting** pieces (storage bench/ottoman, console with
  drawers) earn their footprint twice.
- **Right-size to the room**: a queen + wardrobe already fills a 2.85 m-wide
  HDB bedroom — don't crowd it with extra pieces.

## Sources

- [Cheat Sheet: Key Measurements for Space Planning — Mix & Match Design](https://mixandmatchdesign.com/design-school-101/cheat-sheet-key-measurements-for-space-planning)
- [The Essential Furniture Spacing Guide — Craft'n Build](https://craftnbuild.com/en-us/blogs/interior-styles/furniture-spacing)
- [Common Clearances — Space Stylists & Co](https://www.spacestylistsco.com/blog/commonclearances)
- [The Perfect Sofa Distance From Your TV — Castlery](https://www.castlery.com/us/blog/distance-from-tv-to-sofa)
- [How Much Space Does a Swing Door Need? — Doors & Beyond](https://doorsandbeyond.com/blogs/blog/how-much-space-does-a-swing-door-need-door-clearance-explained)
