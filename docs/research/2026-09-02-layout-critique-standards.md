# Layout-critique thresholds — where each number comes from

**Why this exists.** `analysis/layoutCritique.ts` scores how GOOD a layout is,
not just whether it is broken. Every threshold it uses is taken from published
interior-design standards rather than invented, and this file records which
number came from where so a future change can be argued rather than guessed.

**The problem it solves, measured.** On the default flat, three genuinely
different authored arrangements (Broken-Plan Living, Open-Concept Lounge,
Entertainer's Lounge — different furniture, different item counts, different
prices) score **identically at 83 on every `designScore` category**. So the G8
scheme comparison fell through to its price tie-break and never considered layout
quality at all. A ruler that cannot separate three layouts makes "argue the
trade-offs" vacuous.

With the critique added, the same three separate: **89 / 85 / 79**, and the
recommendation now reads "recommended on layout quality (89 vs 85 against
published spacing standards)" instead of "the cheaper of the two".

## The thresholds

| Check | Band | Source wording |
|---|---|---|
| TV viewing distance | 2.4–3.7 m | "Position seating around 8 to 12 feet (2.4 to 3.7 meters) from the television for an optimal viewing experience." |
| Conversation, ideal | 1.8–2.4 m | "6–8 feet between facing seats." |
| Conversation, breakdown | > 3.05 m | "Beyond 10 feet (305 cm), conversation becomes difficult — voices must be raised, and the intimacy of connection is lost." |
| Coffee-table reach | 0.36–0.46 m | "Your coffee table should be about 14 to 18 inches away from your sofa… close enough to easily reach for a drink or book, but far enough to allow comfortable legroom." |
| Main walkway (context) | 0.91 m | "Maintain a minimum of 36 inches (91 cm) for walkways within the living room." Not yet a check — `designScore`'s circulation category already covers gaps; noted so the number is on record. |
| Sofa proportion | ≤ 60% of the room's shorter span | Derived, not quoted — see the caveat below. |

## Caveats, stated rather than buried

**The sofa-proportion bar is the weakest number here.** The sources give a
medium living room as 4.3 × 4.8 m to 4.6 × 5.5 m and treat an over-scaled sofa as
the classic small-room error, but none states a ratio. The 60% figure is my
derivation from those dimensions, not a citation. Measured consequence: on the
default HDB flat a 2.60 m sofa across a 3.40 m span is 76%, so this check warns
on essentially every scheme and discriminates poorly. That is arguably *correct*
— SG flats genuinely carry large sofas in small rooms — but it means the number
is describing the housing stock rather than the design. A future pass should
either source an SG-specific ratio or drop the check.

**The measurements are geometric, not aesthetic.** Nothing here says a scheme is
prettier. A layout can score full marks and be dull.

**A missing piece is skipped, never failed.** No TV means no viewing-distance
verdict, and the score averages only the checks that applied — so a sparse room
is not marked down for what it does not contain. A score of 100 therefore means
"no evidence of a problem", not "perfect", and `applied` is returned so a caller
can say which.

## A false positive this caught in its own first draft

The first implementation computed coffee-table clearance as centre distance minus
each item's `hz` (half-depth along its LOCAL z axis). That is wrong for any
rotated piece: a sofa turned 90° presents its width, not its depth, toward the
table. It reported **0.87 m** — nearly double the reachable band — and warned
against the app's own researched layouts on both schemes.

Replaced with the standard OBB support radius along the line joining the centres
(`hx·|d·ax| + hz·|d·az|`). The warning disappeared and layout-quality scores rose
from 78/70 to 89/85: the tables were within reach all along. Worth recording
because the wrong number was *plausible* — it would have read as a real finding
about the layouts rather than a bug in the ruler, and it was only caught by
noticing that both schemes reported the identical suspicious value.

## Sources

- [The ultimate guide to living room clearances, measurements, and spacing — Homes & Gardens](https://www.homesandgardens.com/interior-design/living-rooms/a-guide-to-living-room-clearances-measurements-and-spacing)
- [Living Room Layout Rules: Traffic Flow, Conversation Zones, and TV Placement — Keck Furniture](https://keckfurniture.com/blog/living-room-layout-rules-traffic-flow-conversation-zones-and-tv-placement/)
- [Furniture Clearance and Walkway Standards — RoomSketch3D](https://roomsketch3d.com/help/dimensions/clearance-around-furniture)
- [Furniture Spacing Guidelines: Room-by-Room Clearance Rules — RoomSketch3D](https://www.roomsketch3d.com/learn/traffic-flow-spacing/furniture-spacing-guidelines)
- [Living Room Interior Design: Key Dimensions and Layouts — Blocks NorCam](https://blocksnorcam.com/home/blog/living-rooms)
- [Key Interior Design Measurements & Dimensions — Marsha Sefcik](https://marshasefcik.com/blog/key-interior-design-measurements-amp-dimensions-you-should-know)
