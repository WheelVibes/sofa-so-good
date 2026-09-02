# Floor build-up, the HDB thickness limits, and where each number comes from

**The gap this closes.** `PlanRoom.floorLevelMm` drives the FFL tags, doorway
step markers and kerb advisory (`floorplan/floorLevels.ts`), the real 3D risers
(`floorLevels3d.ts`) and the tiler pack — and it was **entirely hand-entered**.
`MaterialDef` carried no thickness, so specifying bedded porcelain in the
bathroom and vinyl plank in the bedroom told the app nothing at all: it could not
report the step at the doorway between them. The user had to already know the
answer they came to the plan for.

A designer works the other way round. You specify finishes, and the levels fall
out of the build-ups.

## The two regulatory limits — and they are written against different sums

| Limit | Figure | Source wording |
|---|---|---|
| Finish + screed | **50 mm** | "When installing new floor finishes, the combined thickness of the floor finish and screed must not exceed 50mm." A limit on the TOTAL — "(Existing Finishes) + (New Flooring) ≤ 50mm … the total thickness that matters, not just the new layer being added." |
| Tile overlay | **13 mm** | "If you lay new tiles over existing floor finishes using adhesive, only one layer of existing finish may be present, and the total thickness of the new tiles plus adhesive must not exceed 13 mm." |

Both figures were returned independently by two searches before being used.

**Which limit applies is decided by `FloorPlan.intakeState`**, because that is
the field that says whether an existing finish is still there:

| Intake | Existing layer | Limit |
|---|---|---|
| `bto-bare` | none — bare cement screed | 50 mm |
| `resale-stripout` | none in dry rooms — hacked back | 50 mm |
| `bto-ocs` | OCS vinyl / porcelain, pre-installed | 13 mm overlay |
| `resale-asis` | the previous owner's finish | 13 mm overlay |

This mapping is the reason the feature is worth building rather than just
tabulating thicknesses: **the same finish passes or fails on intake alone.** 10 mm
bedded porcelain on a 5 mm adhesive bed is 15 mm — comfortable under 50 mm on
bare screed, and over the 13 mm limit the moment it goes over an existing floor.
A test pins exactly that flip.

Where the intake state is unset the check assumes **bare screed (50 mm)**. The
forgiving default is deliberate: assuming an overlay would flag ordinary bedded
tile on every untagged plan, and a check that fires on the common case gets
switched off.

## Material build-ups: specified, never inferred

`MaterialDef.buildUp` follows the same discipline as `moduleMm` and `paint` —
its **presence** is what marks a finish as having a build-up, and absence means
"unknown", never a default. `analysis/floorBuildUp.ts` names the rooms it could
not assess instead of implying the schedule is complete.

Applied inside the `floor()` helper by pattern family, the same way
`EMULSION_COVERAGE` is applied inside `wall()`, so all 37 floor finishes carry it
by construction. A per-item list drifts; a family map cannot.

| Family | finish + bedding | Source wording |
|---|---|---|
| tile, porcelain, marble, stone, hex, subway, checker, peranakan | 10 + 5 = **15 mm** | "Tiles with a thickness of 10mm are a common choice for floor applications"; "Mapei Mapeker has a max bed depth of 5mm for that size tile" (≤ 600×600) |
| wood, parquet, herringbone | 12 + 3 = **15 mm** | "Engineered hardwood typically ranges from 1/4 inch (6mm) to over 1/2 inch (12mm)" — thicker end, plus a 3 mm acoustic underlay |
| vinyl | 6 + 1 = **7 mm** | "for most homes, 4mm to 6mm offers the best balance between durability, comfort and cost" — thicker end, on a 1 mm underlay |
| concrete (bare, screed) | **0 mm** | A real zero, not an unknown: these ARE the substrate the others sit on |

**Direction of error is chosen, not incidental.** These figures feed a
*regulatory limit*, so where a source gives a range the value takes the **thicker**
end. Understating a build-up clears a floor that fails on site, and an
inspection is a worse place to find that out than a warning panel. This is the
opposite of the convention for `moduleMm`, where the specified figure is exact
and a range would be meaningless — worth stating because the two fields
otherwise look like siblings.

**Two families are deliberately absent: `carpet` and `terrazzo`.** No citable
figure was found for either, and SG terrazzo is usually the original poured or
precast floor rather than a 15 mm tile. They exercise the omission path on real
catalogue data rather than being guessed at.

## The finding the derivation exists for

Measured on the **shipped default 4-room flat**, with no authoring at all:

```
rows=11  unassessed=0  overLimit=0  steps=3  declared mismatches=0
  Bath/WC 1        porcelain 300x600   15 mm   FFL +15
  Main Bedroom     timber vinyl         7 mm   FFL  +7
  ...
  STEP Bath/WC 1 / Main Bedroom   8 mm  higher = Bath/WC 1
  STEP Bath/WC 2 / Corridor       8 mm  higher = Bath/WC 2
  STEP Household Shelter / Corridor 8 mm higher = Household Shelter
```

Three real 8 mm doorway steps the app previously could not report. And then the
one that matters:

> **Bath/WC 1 is 8 mm ABOVE Main Bedroom** — the fall is out of the bathroom.

The existing kerb advisory in `floorLevels.ts` **cannot produce this finding**. It
fires when a wet room is at the *same* level as its neighbour, which is already
the benign end of the problem. A wet room sitting 8 mm **high** is the malignant
end, and it is invisible until two finishes' build-ups are compared — 15 mm
bedded porcelain against 7 mm LVT, the single most ordinary finish pairing in an
HDB flat, and exactly what the app's own default flat specifies.

The comparison is **signed**, and that is the whole point. The `steps` list
carries an absolute magnitude because a threshold detail is needed whichever way
the step runs; the wet-room check re-reads the levels rather than re-deriving a
sign from a display field. A test asserts the mirror case — same rooms, finishes
swapped — reports the step and *not* the fall, so a check that read the absolute
value could not pass both arms.

## What this module does not claim

It states limits; it does not grant approval. Every finding is worded as
something to verify with HDB or the contractor, because the app knows the
*specified* build-up and not the site: the existing finish's real thickness,
whether a previous owner already overlaid once, and how level the slab is all
change the answer. The 13 mm rule's "only one layer of existing finish may be
present" condition in particular is a site fact the model cannot see.

## Sources

- [HDB Flooring Overlay Regulations: Your Complete Guide (2026) — Home Expo Asia](https://homeexpo.asia/vinyl-flooring/hdb-flooring-overlay-regulations-your-complete-guide-2026/)
- [HDB Floor Tiling Rules Every Homeowner Should Know — Leong Yik](https://www.leongyik.com.sg/hdb-floor-tiling-rules-every-homeowner-should-know/)
- [An Easy-To-Understand Guide To HDB Flooring Guidelines — Floorrich](https://www.floorrich.com/an-easy-to-understand-guide-to-hdb-flooring-guidelines/)
- [Cement Screed in Singapore: The Homeowner's 2026 Guide — Home Expo Asia](https://homeexpo.asia/uncategorized/cement-screed-in-singapore-the-homeowners-2026-guide-to-flawless-floors/)
- [HDB Wet Area Floor Tiling Guidelines (2026) — Leong Yik](https://www.leongyik.com.sg/hdb-wet-area-floor-tiling-guidelines/)
- [600x600 tiles: 14+ things you must know before buying — Ramirro](https://www.ramirro.com/600x600-tiles/)
- [Adhesive thickness for 600x300x9mm tiles — BuildHub](https://forum.buildhub.org.uk/topic/10214-adhesive-thickness-for-600x300x9mm-tiles-please/)
- [Flooring Thickness Guide: what is the best vinyl flooring thickness? — LX Hausys](https://www.lxhausys.com/us/inspiration/design-ideas-detail/vinyl-flooring-thickness/511484)
- [Luxury Vinyl Flooring, LVT and LVP Thickness Guide — Wood and Beyond](https://www.woodandbeyond.com/blog/luxury-vinyl-flooring-lvt-and-lvp-thickness-guide/)
- [How Thick is Hardwood Flooring — Really Cheap Floors](https://www.reallycheapfloors.com/blog/how-thick-is-hardwood-flooring-a-hardwood-thickness-guide/)
