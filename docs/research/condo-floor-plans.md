# Singapore condominium floor plans — research notes

Reference dimensions backing the condo `FloorPlan` templates in
`src/floorplan/templates.ts`. Condos (private non-landed homes) differ from HDB
flats: smaller efficient layouts at the bottom end, open-plan kitchens, a
balcony on nearly every unit, master ensuites, and a yard / utility on larger
units. Strata areas below are *typical marketed* sizes for recent (post-2015)
mass-market developments; the modelled interior is slightly smaller than the
strata area (which includes balcony + wall footprint + a share of voids), so the
templates target the *liveable* rectangle.

Coordinates: metres, NW corner = (0,0), +X east, +Z south (same frame as the
app). All templates are simplified to clean orthogonal rectangles that tile the
footprint without overlap — a faithful *typology*, not a specific unit.

## Sources / basis
- URA / developer marketing floor plans for mass-market condos (e.g. The Florence
  Residences, Treasure at Tampines, Parc Clematis, Normanton Park, The Tre Ver):
  surveyed the published unit mixes and their stated strata areas.
- PropertyGuru / 99.co / EdgeProp "new launch" floor-plan galleries — used to
  read off room proportions and the standard balcony / yard / bath placements.
- Common SG private-condo conventions: ceilings 2.8–3.0 m (penthouses higher),
  balconies 1.4–1.8 m deep with a ~1.0 m parapet, open kitchens on 1–2 bedders,
  enclosed kitchen + yard + WC on 3-bedders and up.

## Typology dimensions (modelled interior, metres)

| Type            | Strata (typical) | Modelled footprint W×D | Beds | Baths | Notes |
|-----------------|------------------|------------------------|------|-------|-------|
| Studio (shoebox)| ~35–40 m²        | 6.0 × 6.2              | 0    | 1     | one open living/sleeping space, kitchenette niche, small balcony |
| 1-Bedroom       | ~47–52 m²        | 7.6 × 6.6              | 1    | 1     | open kitchen, balcony off living |
| 1+Study         | ~57–62 m²        | 8.4 × 7.2              | 1+study | 1   | enclosed study nook, balcony |
| 2-Bedroom       | ~70–78 m²        | 9.2 × 8.4              | 2    | 2     | master ensuite, common bath, balcony |
| 3-Bedroom       | ~95–105 m²       | 11.0 × 9.6             | 3    | 2     | master ensuite, balcony, kitchen + yard/WC |
| 4-Bedroom       | ~130–145 m²      | 12.0 × 11.4            | 4    | 3     | master ensuite + common/shared baths, open living/dining, kitchen + yard, wide balcony |
| Penthouse (3BR) | ~150–170 m²      | 13.0 × 11.6            | 3    | 2     | dual-aspect living, large balcony, yard, master ensuite |
| Terrace (ground)| ~90 m² / floor   | 6.4 × 14.0             | —    | 1 WC  | landed inter-terrace: car porch, living/dining, kitchen + yard, powder room, stair hall; bedrooms are upstairs |

### Balconies
Modelled as a room with `floor-terrazzo` and a parapet via `topHeight` (~1.0 m)
on the exterior balcony wall(s). Depth 1.4–1.7 m, width spanning the living
frontage. Open to the living room (no door, just an opening / no interior wall).

### Kitchens
- 1BR / 1+Study: open galley along one wall of the living/dining (no partition).
- 2BR: open or semi-open kitchen counter run.
- 3BR / Penthouse: enclosed kitchen with a service yard + WC behind it (the SG
  "wet/dry" kitchen convention is simplified to one enclosed kitchen + yard).

### Baths
- Common bath ~1.6–1.8 m × 2.0–2.4 m; master ensuite similar or slightly larger.
- Floor finish `floor-tile-white` or `floor-tile-marble`.

### Ceiling heights
2.85 m typical; 3.0 m for the penthouse / landed (terrace) living volume.

### Landed (terrace house, ground floor)
A common SG **inter-terrace** ground floor is a long, narrow plot (~6 m wide,
~14 m deep). The ground storey is the public/service level — car porch at the
front, an open living→dining spine, an enclosed kitchen + service yard at the
rear, a powder room (WC), and a stair hall to the bedrooms above. Modelled as a
single-floor representation (bedrooms live on the upper storey, not in this
template). Sources: URA landed-housing guidelines + developer terrace floor
plans (e.g. typical 2-/3-storey inter-terrace layouts on PropertyGuru / EdgeProp).
