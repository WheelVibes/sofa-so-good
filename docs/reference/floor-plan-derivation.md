# Default flat — floor-plan derivation notes

**Source of truth:** [`assets/floor_plan/default.png`](../../assets/floor_plan/default.png) —
a detailed, to-scale HDB "4 Room / Type - 1" plan (2026-07-23). Floor area 93 m²
(internal 90 m² + AC ledge), dimensions in mm to wall centre-lines, ceiling 2.6 m.
This replaced the earlier proportionally-estimated Serangoon North Vista plan
(`floor-plan.svg`/`.jpg`, deleted 2026-07-23).

## Coordinate mapping

The plan's dimension chains are millimetres between wall centre-lines. App-space
coordinates (`src/apartment/constants.ts`) are

```
app x = mm_x / 1000 + 0.10      app z = mm_z / 1000 + 0.10
```

so the NW external wall centre-line sits at (0.10, 0.10) — external walls are
0.2 m thick and inset half their thickness from the (0, 0) footprint corner.
External footprint: 12.725 × 9.325 m (plan 12525 × 9125 + one wall thickness).

## Gridlines read off the plan (mm)

- **x:** 0 · 3230 (MB/B2) · 6090 (B2/B3) · 9075 (B3/LD) · 12525 (east) —
  top chain 3230 + 2860 + 2985 + 3450.
  Bottom chain 1365 + 3190 + 1520 + 4025 + 2425 → 1365 (bath1/ledge west),
  4555 (service-yard west), 6075 (SY/kitchen), 10100 (SE jog).
  Bath band widths 2350 / 1950 / 2450 → 3715 (bath1/2), 5665 (bath2/HS),
  8115 (HS east). Ledge 2610 wide → east edge 3975.
- **z:** 0 · 3675 (bedroom south) · 4775 (corridor south; left chain 4775) ·
  6725 (bath band south; 1950 tall) · 9125 (south; bottom band 2400).
  Right chain 1100 + 7035 + 990 → 1100 (L/D north — the NE notch) and
  8135 (SE entrance step; 990 recess). Ledge 1000 deep → south edge 7725.
  Kitchen interior depth 2200 (annotated).

## Topology notes

- Bedroom band (3 bedrooms) along the north; corridor (1100 deep) below it.
- The corridor's west stretch is the **MB foyer** (no wall between the main
  bedroom and it); the MB door sits in the small partition at x=3375, and
  **bath 1 is entered from the foyer**, bath 2 + household shelter from the
  corridor.
- Living/Dining occupies the east column with its north wall inset 1100
  (NE notch, 2450 window) and a solid east wall; the main
  entrance is on the SE step wall (z=8135) into the L/D's entrance foyer.
- Kitchen is open to the L/D on its east side; the service yard (half-height
  west parapet, open above) sits between the kitchen and the AC ledge, with a
  void strip (x=[3975, 4555]) between ledge and yard that is outside the flat.
- The `livingDining` room rect deliberately overlaps thin B3/corridor slivers
  west of x=9175 (open circulation strip east of the shelter); the floor
  renderer carves overlaps toward the smaller room, as in the previous plan.

Openings (doors/windows), per-room rectangles, and derivation strings live in
`src/apartment/constants.ts` (`WALLS`/`ROOMS`/`DOORS`/`WINDOWS`); the editable
seed plan is generated from them by `src/floorplan/defaultPlan.ts`.
