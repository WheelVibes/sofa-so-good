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
| Main walkway (context) | 0.91 m generic / **0.70–0.80 m SG** | Generic: "maintain a minimum of 36 inches (91 cm) for walkways". **But SG sources differ**: "the non-negotiable is keeping your main walkway at least 70-80 cm clear". Not implemented as a check — and good thing, since the two standards disagree by ~20 cm and the SG figure is the applicable one for this app. Recorded so a future check uses the right number. |
| Sofa-to-coffee-table, SG | 0.30–0.45 m | SG sources give "30-45 cm between the sofa and the coffee table" vs the generic 0.36–0.46 m. Close enough that the current band passes either way, but noted. |
| Sofa width | 1.75–2.20 m | "Three-seaters are typically 175cm to 220cm wide"; for a 4-room HDB, "a 3-seater straight sofa between 190 and 210 cm wide fits comfortably". |

## The sofa check was derived, then replaced with a cited figure (v0.31.5.269)

The first version used a **derived** bar — sofa width ≤ 60% of the room's shorter
span — because the generic sources give room dimensions but no ratio. It warned
on essentially every SG scheme (a 2.60 m sofa across a 3.40 m span is 76%), so it
described the housing stock rather than the design, and I flagged it as the
weakest number in the set.

Searching SG-specific sources resolved it properly: **they express sofa fit as an
absolute width band, not a ratio** — "three-seaters are typically 175cm to 220cm
wide", and "between 190 and 210 cm" for a 4-room HDB living room. Replaced the
ratio with the 1.75–2.20 m band.

That also produced a sharper result: the app's default 2.60 m sofa is genuinely
ABOVE the typical SG 3-seater, so the warning now identifies a real over-scaled
piece rather than restating that HDB rooms are small. The check is also now
room-independent, which a test pins — the same sofa in a 3 m room and a 6 m room
must read the same, because the standard is a width, not a proportion.

**Wider lesson for this file.** The generic and SG standards genuinely DISAGREE:
walkway minimum is 91 cm generically but 70–80 cm in SG guidance. Any future
check should prefer the SG figure for this app and record both, as the table now
does. Reaching for a derived ratio when a cited absolute exists was the actual
mistake.

## Other caveats, stated rather than buried

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

### Singapore-specific (preferred for this app where the two disagree)
- [Choosing the Right Sofa Dimensions for a Singapore Home — Megafurniture](https://megafurniture.sg/blogs/articles/choosing-the-right-sofa-dimensions-for-a-singapore-home)
- [Sofa Sizes Explained: Dimensions for HDB and Condo Living Rooms — Maxi Home](https://www.maxihome.com.sg/blogs/news/sofa-sizes-explained-dimensions-hdb-condo-living-rooms)
- [Sofa Size Guide: Will It Fit Your HDB Living Room? — LOFT HOME](https://lofthome.com/blogs/articles/sofa-size-guide-will-it-fit-your-hdb-living-room-expert-advice)
- [How to Furnish a 3-Room HDB Living Room — Megafurniture](https://megafurniture.sg/blogs/articles/how-to-furnish-a-3-room-hdb-living-room-a-complete-plan-with-sizes)
