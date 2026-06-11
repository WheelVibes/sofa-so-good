# HDB Flat Floor Plans — Representative Specs for FloorPlan Templates

Reference data for encoding Singapore HDB flat types as rectangular-room floor plans in the
sandbox. Each section gives a **typical / representative** flat (not a copy of any single
proprietary plan) synthesised from public sources: typical internal floor area, an overall
bounding rectangle in metres, a per-room table (W × D in metres + area), a layout-adjacency
description, and the ceiling height.

> **These are synthesised, representative dimensions.** Real BTO/resale units vary by project,
> generation (3A/3NG, 4A/4S/4I, 5A/5I/5S, …), stack position and block type (point vs slab).
> Values are rounded to 0.1 m and tuned so room areas sum to roughly the stated internal area
> within the bounding rectangle. They are good enough to lay rectangles on a grid; they are not
> a substitute for an official HDB sales brochure for a specific unit.

## Conventions used across all types

- **Footprint = bounding rectangle** the rooms tile within. It is the *internal* envelope
  (inside the external walls); add ~0.2 m external wall thickness per side if modelling walls.
- **Orientation convention** (so adjacency notes are unambiguous): the **entrance/foyer is on
  the SOUTH (front) wall**, the **living/dining runs front-to-back along one side**, and the
  **kitchen + service yard + household shelter sit at the NORTH (rear / "service" side)**.
  Bedrooms line the side wall(s) opposite the living wall, windows facing out to the long sides.
- **Ceiling height: 2.6 m** floor-to-ceiling for all modern HDB flats (bathrooms ~2.4 m under a
  false ceiling). This is the standard across old flats, new flats, BTOs and resale.
- **Household shelter (bomb shelter):** regulated, max 4.8 m², min clear width 1.2 m, max length
  4 m, min clear height 2.4 m; door 0.85 × 2.0 m. Doubles as the storeroom. Always an internal
  (no external window) box, usually near the kitchen/entrance.
- **Standard openings:** main entrance door 1.0 m, internal doors 0.8 m, door height 2.1 m.

---

## 2-Room Flexi (~38 m²)

Smallest modern type: 1 bedroom, 1 bath, kitchen, living/dining, and a storeroom-cum-household
shelter. Two size bands exist — Type 1 ≈ 36–41 m² and Type 2 ≈ 47–49 m². This spec models a
**Type 1, ~38 m²** unit (the most iconic compact Flexi).

- **Typical internal area:** ~38 m²
- **Bounding rectangle:** **6.0 m (W) × 6.4 m (D)** = 38.4 m²
- **Ceiling height:** 2.6 m

| Room | W × D (m) | Area (m²) |
|---|---|---|
| Living/Dining | 3.5 × 3.6 | 12.6 |
| Kitchen | 2.4 × 2.2 | 5.3 |
| Master Bedroom | 3.1 × 3.0 | 9.3 |
| Bathroom | 1.7 × 2.2 | 3.7 |
| Household Shelter (storeroom) | 1.5 × 2.0 | 3.0 |
| Service Yard | 1.4 × 1.6 | 2.2 |
| Entrance/foyer (within Living) | — | — |
| **Total** | | **36.1** + circulation ≈ 38 |

**Layout adjacency:** Enter at the south-east corner into the living/dining, which occupies the
front-left. The single bedroom sits along the east (long) wall with its window facing out. The
kitchen is at the rear-left (north), opening to a small service yard at the rear-right corner.
The bathroom and the windowless household shelter cluster near the entrance on the west side
(shelter against an internal/party wall). One window for the living, one for the bedroom, both
on the front/side external walls.

Sources: [PropertyGuru — 2-room Flexi](https://www.propertyguru.com.sg/property-guides/2-room-bto-flat-hdb-resale-62480),
[Qanvast — 2-room BTO floor plans](https://qanvast.com/sg/articles/2-room-bto-floor-plan-ideas-for-a-small-but-functional-space-3500),
[SHE Interior — 2-room HDB size](https://www.sheinterior.com.sg/2-room-hdb-size-for-maximizing-space/).

---

## 3-Room (~65 m²)

2 bedrooms, 2 bathrooms (newer BTO 3-room have 2; older 3A have 1), living/dining, kitchen,
service yard, household shelter. Older 3-room ≈ 60 m²; newer BTO 3-room ≈ 65 m². This models a
**newer ~65 m²** unit.

- **Typical internal area:** ~65 m²
- **Bounding rectangle:** **7.6 m (W) × 8.6 m (D)** = 65.4 m²
- **Ceiling height:** 2.6 m

| Room | W × D (m) | Area (m²) |
|---|---|---|
| Living/Dining | 3.6 × 5.6 | 20.2 |
| Kitchen | 2.6 × 3.0 | 7.8 |
| Master Bedroom | 3.2 × 3.5 | 11.2 |
| Bedroom 2 | 2.7 × 3.0 | 8.1 |
| Master Bath | 1.6 × 1.9 | 3.0 |
| Common Bath | 1.5 × 1.7 | 2.6 |
| Household Shelter | 1.5 × 2.0 | 3.0 |
| Service Yard | 1.5 × 1.6 | 2.4 |
| **Total** | | **58.3** + circulation ≈ 65 |

**Layout adjacency:** Entrance on the south wall opens into the living/dining, which runs along
the east side from front to back. The two bedrooms are stacked along the west (long) external
wall — master at the rear with attached master bath, bedroom 2 toward the front; both windows
face west. The common bath sits between the bedrooms off a short corridor. The kitchen is at the
rear (north), with the service yard at the rear corner and the household shelter as a windowless
box near the kitchen/entrance.

Sources: [Weiken — HDB 3/4/5-room sizes](https://www.weiken.com/hdb-flat-size-3-room-4-room-5-room/),
[Qanvast — HDB flat type guide](https://qanvast.com/sg/articles/a-guide-to-every-modern-day-hdb-bto-flat-type-you-can-apply-for-2806),
[DollarsAndSense — 3-room variants](https://dollarsandsense.sg/3std-3i-3s-3ng-3a-guide-3-room-hdb-flats/).

---

## 4-Room (~90 m²) — most common

The most common HDB flat. 3 bedrooms, 2 baths, living/dining, kitchen, service yard, household
shelter. Newer BTO 4-room ≈ 90 m² internal (+ ~3 m² AC ledge). This is a **generic / typical
4-room**, deliberately different from the app's built-in *Serangoon North Vista* default (which
is L-shaped); this one is a clean rectangular-tiled layout.

- **Typical internal area:** ~90 m²
- **Bounding rectangle:** **9.2 m (W) × 9.8 m (D)** = 90.2 m²
- **Ceiling height:** 2.6 m

| Room | W × D (m) | Area (m²) |
|---|---|---|
| Living/Dining | 3.8 × 6.4 | 24.3 |
| Kitchen | 3.0 × 2.6 | 7.8 |
| Master Bedroom | 3.5 × 3.4 | 11.9 |
| Bedroom 2 | 2.8 × 3.0 | 8.4 |
| Bedroom 3 | 2.7 × 3.0 | 8.1 |
| Master Bath | 1.6 × 2.1 | 3.4 |
| Common Bath | 1.5 × 1.8 | 2.7 |
| Household Shelter | 1.5 × 2.0 | 3.0 |
| Service Yard | 1.5 × 1.6 | 2.4 |
| **Total** | | **72.0** + circulation/corridor ≈ 90 |

**Layout adjacency:** Entrance on the south (front) wall, opening into the living/dining that
runs the full depth along the east side. The three bedrooms line the west (long) external wall:
master bedroom at the rear corner (largest, with attached master bath), bedrooms 2 and 3 toward
the front, all windows facing west. The common bath is off the bedroom corridor between the
bedrooms. Kitchen at the rear-east/centre (north service side), opening to the service yard at
the rear corner; the windowless household shelter sits beside the kitchen/entrance as the
storeroom. (An external AC ledge ~2.0 × 1.5 m hangs off the service side — not part of the
internal area.)

Sources: [9Creation — standard 4-room size](https://9creation.com.sg/what-is-standard-hdb-4-room-size/),
[ELPIS — 4-room BTO size](https://elpisinterior.com.sg/4-room-bto-size-crash-course/),
[D'Phenomenal — 4-room floor plan guide](https://dphenomenal.sg/4-room-bto-floor-plan-complete-2026-guide-layouts-measurements-open-vs-closed-kitchen/),
[99.co — how much space](https://www.99.co/singapore/insider/hdb-space-really-need/).

---

## 5-Room (~115 m²)

3 bedrooms, 2 baths — same bedroom count as 4-room, but a markedly **larger living/dining** and
kitchen (the main advantage of a 5-room). Plus service yard, household shelter, and often a small
balcony. Typical internal ≈ 110–120 m²; this models **~115 m²**.

- **Typical internal area:** ~115 m²
- **Bounding rectangle:** **10.4 m (W) × 11.0 m (D)** = 114.4 m²
- **Ceiling height:** 2.6 m

| Room | W × D (m) | Area (m²) |
|---|---|---|
| Living/Dining | 4.4 × 7.2 | 31.7 |
| Kitchen | 3.2 × 3.0 | 9.6 |
| Master Bedroom | 3.8 × 3.6 | 13.7 |
| Bedroom 2 | 3.0 × 3.3 | 9.9 |
| Bedroom 3 | 2.8 × 3.2 | 9.0 |
| Master Bath | 1.7 × 2.2 | 3.7 |
| Common Bath | 1.6 × 1.9 | 3.0 |
| Household Shelter | 1.5 × 2.0 | 3.0 |
| Service Yard | 1.6 × 1.8 | 2.9 |
| Balcony | 2.4 × 1.5 | 3.6 |
| **Total** | | **90.1** + circulation/corridor ≈ 115 |

**Layout adjacency:** Entrance on the south wall into a large living/dining running the full
depth along the east side; a balcony projects off the front of the living onto the south
external wall. The three bedrooms line the west (long) wall: master at the rear corner with
attached master bath, bedrooms 2 and 3 toward the front, windows facing west. Common bath off
the bedroom corridor. Kitchen at the rear (north service side), generously sized, opening to the
service yard at the rear corner; household shelter as a windowless storeroom beside the kitchen.

Sources: [YangSID — 5-room floor plan](https://www.yangsid.com/blog/hdb-5-room-floor-plan/),
[DollarsAndSense — 5S/5I/5A types](https://dollarsandsense.sg/5s-5i-5a-different-types-hdb-5-room-flats-singapore/),
[ERA — HDB flat layout guide](https://www.era.com.sg/blogs/the-hdb-flat-layout-guide),
[Weiken — HDB 3/4/5-room sizes](https://www.weiken.com/hdb-flat-size-3-room-4-room-5-room/).

---

## Executive Maisonette (~145–150 m², two storeys)

The only two-storey HDB flat type (phased out 1995, resale only) — a flat that lives like a
landed house. An internal staircase connects the floors; the split is consistently **public
below, private above**:

- **Lower storey:** living + dining (the full-depth public zone), kitchen, service yard,
  household shelter/store, and a WC/powder room; the stair hall sits off the entry corridor.
- **Upper storey:** **3 bedrooms** (master with ensuite bath) **+ 2 bathrooms**, off a landing
  at the top of the stair; many units add a family area/landing lounge.
- **Bounding rectangle (per storey):** ~**8.4 m (W) × 9.4 m (D)** ≈ 75 m² each → ~150 m² total.
- **Ceiling height:** 2.6 m per storey; the upper floor slab adds ~0.3 m, so the upper finished
  floor sits ≈ 2.9 m above the lower one.
- **Stair:** a straight or dog-leg flight (~0.9–1.0 m wide, ~3.4–3.6 m run for 2.9 m of rise),
  in a dedicated stair hall whose footprint repeats on both floors (landing/void above).

Sources: [PropertyGuru — big flats compared](https://www.propertyguru.com.sg/property-guides/maisonette-jumbo-flat-executive-flat-3gen-flat-5-room-flat-which-to-pick-45471),
[Teoalida — HDB flat types](https://www.teoalida.com/singapore/hdbflattypes/).

---

## Executive / 3Gen (brief)

Largest current/legacy types — provided briefly as data is sparser and less standardised.

- **Executive Apartment (EA):** ~130–150 m² internal; 3 bedrooms + an open study area, often a
  balcony. Phased out 1995 (resale only). Essentially a 5-room layout (above) stretched ~15–25 %
  larger with an added ~6–8 m² study off the living. A representative bounding rectangle is about
  **11.5 m × 12.0 m** (~138 m²), ceiling 2.6 m.
- **3Gen Flat:** ~115 m² internal; **4 bedrooms, 3 baths** (two of them en-suite) for
  multi-generational living. Same envelope class as a 5-room (≈ **10.4 m × 11.0 m**) but with one
  extra (4th) ensuite bedroom carved from the living/secondary side, bedrooms placed on opposite
  sides of the shared living for privacy. Ceiling 2.6 m.

Sources: [PropertyGuru — big flats compared](https://www.propertyguru.com.sg/property-guides/maisonette-jumbo-flat-executive-flat-3gen-flat-5-room-flat-which-to-pick-45471),
[PropertyGuru — 3Gen guide](https://www.propertyguru.com.sg/property-guides/hdb-3gen-flat-17786),
[Teoalida — HDB flat types](https://www.teoalida.com/singapore/hdbflattypes/).

---

## Reference notes (cross-type)

- **Ceiling height 2.6 m** confirmed across sources for old, new, BTO and resale HDB flats.
  ([Repair.sg — HDB ceiling height](https://repair.sg/what-is/hdb-ceiling-height/))
- **Household shelter regulation:** max 4.8 m², min width 1.2 m, max length 4 m, min clear
  height 2.4 m, door 0.85 × 2.0 m. ([BCA household-shelter checklist](https://www1.bca.gov.sg/docs/default-source/docs-corp-news-and-publications/checklist-for-bp-cd-architectural-requirements8d2ce7ac9eed40c3a88712a531d89153.pdf),
  [HDB — household shelter](https://www.hdb.gov.sg/residential/living-in-an-hdb-flat/home-maintenance/home-care-guide/household-shelter))
- **Block types:** point block (~4 larger units/floor, no corridor) vs slab block (long
  corridor, many units) shift exact room proportions; the rectangles above approximate a slab/
  point-block unit. ([Uchify — point block](https://uchify.com/point-block-hdb/))
- **Official source for any specific unit:** HDB sales brochures, e.g. the
  [HDB BTO sales-brochure library](https://www.hdb.gov.sg/residential/buying-a-flat/finding-a-flat)
  and the third-party [housingmap.sg](https://www.housingmap.sg/) / [teoalida.com](https://www.teoalida.com/singapore/hdbflattypes/) indexes.
