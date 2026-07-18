# Designer→contractor handover: practices, formats, and SG requirements (2026-07-18)

> Research for the contractor-handover goal (user, 2026-07-18): make the app's output
> dimensioned, to-scale, accurate, and detailed enough for a homeowner to hand directly to a
> renovation contractor — following the same practices/formats professional interior designers
> use. Companion codebase gap analysis: see the roadmap section in `TODO.md`.

## The core distinction that drives everything

The furniture-layout plan / render / walkthrough — everything the app produces by default —
is a **design-intent / presentation** document. Contractors do NOT build from it. They build
from: the **setting-out plan** (partition positions chain-dimensioned from a datum),
**elevations** (vertical heights off FFL), **carpentry sections** (exact cut dimensions),
and **points plans** (electrical/plumbing positions + heights). A "handover package" feature
must produce those, not a prettier furniture plan.

## Canonical drawing set (ranked by contractor essentiality)

1. **Demolition/hacking plan** — existing walls, removals hatched, wall classification
   (load-bearing vs partition) explicit. The document HDB reviews.
2. **Partition/setting-out plan** — new walls chain-dimensioned from a fixed datum
   (structural column/wall face — NOT cumulative from each other), wall thicknesses, openings.
3. **Furniture layout plan (FF&E/GA)** — what the app already has; *indicative only*.
4. **Reflected ceiling plan (RCP)** — bulkheads/false-ceiling zones with drop heights per zone
   ("FFL to false ceiling: 2400mm"), light fixtures dimensioned off walls, aircon diffusers.
5. **Lighting & switching plan** — fixture types, switch positions (~1200mm AFFL SG
   convention), switching logic, positions vs door swings.
6. **Power/electrical points plan** — socket positions + heights AFFL (e.g. "150mm above
   counter"); in SG feeds an LEW-certified Single Line Diagram before SP energises circuits.
7. **Plumbing points plan** — supply/drain points; SG legally requires a PUB Licensed Plumber
   for public-network work.
8. **Aircon plan** — FCU/condenser positions, trunking routes (usually overlaid on RCP).
9. **Floor finishes plan + tile setting-out** — material per zone + tile starting point/joint
   width/pattern dimensioned from a fixed reference (avoids sliver cuts at entrances).
10. **Wall finishes / internal elevations** — one per wall with cabinetry/tiling/features;
    heights off FFL (counters, splashbacks, mirrors). "Impossible to convey in floor plans."
11. **Carpentry/joinery details + sections** — 1:20/1:10 (1:5 for joints); every internal
    dimension; what carpenters actually cut to. The single most-cited gap in DIY handovers.
12. **Door/window schedule** — tag numbers keyed to plan; type/size/swing/hardware/finish.
13. **Finishes & materials schedule / spec book** — every material: manufacturer, model,
    colour, where used; linked to plan tags.
- **BOQ / scope of work** — line-item scope + quantities + material grades + exclusions; the
  commercial companion. SG disputes usually trace to drawing↔quotation gaps.

## Conventions

- **Scales**: 1:50 general plans; 1:25/1:20 kitchens/bathrooms; 1:10–1:5 joinery details.
  Scale always stated in the title block. Printed sets measurable with a scale rule.
- **Units**: mm throughout (SG/metric practice).
- **Dimension chains**: from a fixed datum, not cumulative; largest overall dimension
  outermost, details nested inward; extension lines with a gap; lighter line-weight than walls.
- **Heights**: relative to FFL (Finished Floor Level), noted per zone.
- **Title block** (bottom-right): project name/address, drawing title, scale, date, author,
  sheet number, revision table. **Revision clouds** + tags mark changes between issues.
- **North point** on floor plans.
- **Formats**: PDF drawing sets (A3 working / A1 site), true-to-scale; DWG/DXF for anyone who
  edits (carpentry fabricators). Coohom exports "Construction Drawings" (CAD/PDF/JPG, auto
  dimensions/legends, user-editable) — the consumer-tool benchmark; Cedreo exports to-scale
  PDF + DXF/DWG with auto section/elevation dimensions; Foyr is visualization-only (weak).

## Singapore-specific

- **Any HDB wall demolition needs a written HDB permit** (even non-load-bearing).
  Absolutely off-limits: load-bearing walls, columns, beams, slabs, staircases,
  refuge-shelter walls.
- **Wall classification is a named failure mode**: older HDB = beam-and-column + brick infill;
  newer = precast RC panels / Ferrolite partitions — visually identical on a plan,
  structurally different. A hacking plan must classify wall types per block era.
- **PE endorsement** de facto standard when any RC element is touched (HDB form SED-054N path
  formally doesn't require it for non-load-bearing RC partitions, but HDB can mandate it).
  PE needs: BCA as-built structural drawings, classified wall plan, dimensioned hacking
  boundaries, embedded stiffeners/lintels identified.
- **Electrical**: EMA-Licensed Electrical Worker (LEW) certifies via stamped Single Line
  Diagram; SP Group only energises on LEW-signed application.
- **Plumbing**: PUB Licensed Plumber (public register) for anything touching the water network.
- Working-hours permit conditions (weekday 9–5; ~3-day demolition windows cited).
- Unconfirmed: whether CORENET-X/IFC-SG BIM applies to HDB hacking submissions (it applies to
  broader BCA submissions) — verify before relying on it.

## What DIY plans usually miss (per SG advisory sources)

- Exact dimensions: internal wardrobe shelf heights, door swing directions, precise
  height/location of EVERY power socket.
- Carpentry sections — "carpentry is outsourced, measurements shift on site".
- Itemised scope/BOQ — vague one-line quotes cause variation-order disputes.
- Wall-type classification for hacking.

## Minimum viable handover package (DIY homeowner floor)

1. Dimensioned setting-out plan (datum chains, wall classification if hacking)
2. Demolition/hacking plan
3. Electrical points plan (positions + heights AFFL)
4. Plumbing points plan
5. RCP with ceiling heights (if false ceiling/bulkheads in scope)
6. Carpentry elevations + ≥1 section per custom joinery piece
7. Finishes schedule / BOQ keyed to plan tags

Full citations preserved in the research agent report (2026-07-18); key sources:
sg23design.com/blog/drawings-for-a-renovation · drawings.archicgi.com (8 types) ·
architecturelab.net/reflected-ceiling-plan · sourcecad.com dimensioning best practices ·
lifeofanarchitect.com title blocks · support.coohom.com construction drawings ·
help.cedreo.com DXF export · renovationcontractorsingapore.com HDB hacking permit + BOQ
guides · aectechnicalsg.com PE endorsement guide · pub.gov.sg licensed plumbers ·
ema.gov.sg electrician licence · hdb.gov.sg electrical works · qanvast.com dispute guide.

## Follow-ups flagged

- Verbatim SG contractor complaints (Reddit/forums) not indexed this pass.
- RoomSketcher construction-doc exports unchecked.
- CORENET-X/IFC-SG applicability to HDB unverified.
