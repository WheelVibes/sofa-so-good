# Apartment Dimensions — Derivation Notes

**Source:** Serangoon North Vista 4-room HDB (May 2023 BTO).
**Floor plan reference:** [`floor-plan.jpg`](./floor-plan.jpg)
**Authoritative target:** internal floor area 90 m² + AC ledge 3 m² = 93 m² total. Floor-to-ceiling 2.6 m.

## Derivation procedure (per spec §6.2)

1. Web search for the official HDB-published floor-plan dimensions.
   - Found the official sales brochure ([HDB PDF](https://assets.hdb.gov.sg/residential/buying-a-flat/finding-a-flat/sales-brochure/23MAYBTO_pdf_selection/serangoon_north_vista.pdf)) but couldn't extract per-room dimensions: PDF contents are binary and `poppler-utils` not available in the WSL2 environment.
   - Third-party sources (BTOmyhome, Renonation, BTOhq) index the project but don't publish per-room dimensions.
2. Visual proportional analysis of the user's floor-plan image, anchored to the standard HDB internal door width (800 mm) as a scale ruler.
3. Calibrated to the 90 m² internal floor area constraint.
4. Rounded to 50 mm increments per HDB plan convention. Rounding slack absorbed into living/dining (the largest space).

## Approved dimensions

User approved 2026-04-25. **Note:** the original table presented to the user contained an arithmetic transcription error — the non-L/D rooms summed to 46.95 m², which means the L/D total had to be 43.05 m² (not 33.08 as originally stated) for the totals to reach 90.0. The per-room widths, depths, and areas listed below are the user-approved values; the L/D total was corrected after the user said "ok to both" but before they paused. **Re-confirmation of the L/D-total correction is the first step on resume.**

| Room | Width × Depth (m) | Area (m²) | Source |
|---|---|---|---|
| Main Bedroom | 3.60 × 3.40 | 12.24 | proportional + 50 mm round |
| Bedroom 2 | 2.70 × 3.00 | 8.10 | proportional + 50 mm round |
| Bedroom 3 | 2.70 × 3.00 | 8.10 | proportional + 50 mm round |
| Bath/WC 1 (master) | 1.60 × 2.10 | 3.36 | proportional |
| Bath/WC 2 (common) | 1.50 × 1.70 | 2.55 | proportional |
| Household Shelter | 1.50 × 2.00 | 3.00 | HDB-typical bomb shelter |
| Service Yard | 1.50 × 1.40 | 2.10 | proportional |
| Kitchen | 3.00 × 2.50 | 7.50 | proportional |
| **Living/Dining (L-shape, corrected)** | — | **43.05** | balance to hit 90.0 |
| Living/Dining — main rectangle | 3.50 × 7.50 | 26.25 | tall right column + corridor |
| Living/Dining — extension | 4.50 × 3.70 | 16.65 | south wing (dining + foyer) |
| (rounding slack absorbed in L/D) | — | +0.15 | |
| **Internal total** | — | **90.00** | ✓ |
| AC Ledge (external) | 2.00 × 1.50 | 3.00 | external annex south of bath 1 |
| **Grand total** | — | **93.00** | ✓ |

## Standard HDB specs (used unchanged)

| Spec | Value |
|---|---|
| External wall thickness | 200 mm |
| Internal partition wall | 100 mm |
| Floor-to-ceiling | 2.6 m (bathrooms 2.4 m with false ceiling) |
| Door height (standard) | 2.1 m |
| Main entrance door width | 1.0 m |
| Internal door width | 0.8 m |
| Bedroom window sill | 950 mm |
| Window head height | 2.1 m |

## Open items on resume

1. User to confirm corrected L/D total of 43.05 m² (originally 33.08 was a typo).
2. After confirmation, write `src/apartment/constants.ts` with `FLAT`, `ROOMS`, `WALLS`, `DOORS`, `WINDOWS` arrays.
3. The L/D L-shape will use the new `RoomDef.extension` field (added during Task 5 fix, commit `6520df3`).
4. Apartment external bounding box not yet finalized — likely ~12 m × 8.5 m or similar; will fall out of the wall layout once room positions are placed.
