# Delivery-access thresholds — where each number comes from

**The gap this closes.** A fresh pass over the app after 29 commits of drawing
work found one fit question it had never asked. `analysis/accessibility.ts`
checks a door is wide enough for a PERSON (0.85 m wheelchair clearance).
`catalog/roomFit.ts` checks a piece fits the ROOM once it is in there. Nothing
checked the route in between — lift door, lift cabin, corridor turn, entrance
door. A sofa that fits the living room perfectly and cannot clear the lift door
is a real, expensive and very common failure, and the Singapore furniture guides
lead with it.

## The thresholds

| Constraint | Default | Source wording |
|---|---|---|
| Lift door opening | 0.80 × 2.09 m | "Many HDB lift door openings are around 0.8 m (80 cm) wide, though more specific measurements show lift door openings of approximately 90 cm wide and 209 cm tall." |
| Lift cabin | 1.00 × 2.34 m | "The standard HDB lift is roughly 100 cm wide and 130–150 cm deep… interior dimensions of about 124 cm width, 146 cm depth, and 234 cm height." |
| Main entrance door | 0.80 × 2.10 m | "Doorway widths in HDB flats are typically 80 to 90 centimetres for bedroom doors and 80 to 85 centimetres for the main entrance door." |
| Corridor turn (context) | — | "Measure the corridor turn from the lift lobby to your front door before you order anything longer than 1.5 m." Not implemented as a default: a turn is not a rectangular aperture, and modelling it needs the lobby geometry the app does not have. |
| Diagonal tilt (context) | — | "The diagonal delivery method — tilting a sofa on its side and rotating it through a doorway — works for most sofas up to around 90 centimetres in seat depth." Deliberately NOT modelled; see below. |

**Where the sources give a range, the default takes the tighter figure** — a
warning should assume the tighter common case rather than the flattering one. A
test pins the lift door at 0.80 m for exactly this reason.

## The geometric rule, and its direction of error

A rectangular box passes a rectangular aperture when its two SMALLEST dimensions
both fit the aperture's two dimensions: you can always orient the box to present
its smallest face. So each item's three dimensions are sorted and the two
smallest are compared against each constraint's sorted pair.

This is slightly **conservative** — it does not model diagonal tilting, which
the sources describe as standard practice for sofas up to ~0.9 m seat depth. That
is the right direction of error for a warning: occasionally flagging a piece a
skilled crew could squeeze in is far better than letting someone order a sofa
that has to go back.

## The big caveat: assembled delivery

The bounding box checked is the ASSEMBLED object. Plenty of furniture ships
flat-packed or knock-down — a wardrobe delivered as panels clears any doorway —
and the sources themselves note a sofa too deep for the lift "may need to be
dismantled for delivery".

So a finding is **not** "this cannot be delivered". It is "this cannot be carried
in assembled, so measure your actual lift or confirm it ships knock-down", and
the finding text says precisely that. A test asserts the wording contains
"measure your actual" and "ships knock-down" and does NOT contain "cannot be
delivered" or "will not fit" — because a check that reads as a verdict when it is
really a prompt gets ignored after the second false alarm, and flat-packed
furniture guarantees there will be false alarms.

## Measured on the default flat

Two pieces flag on the shipped 4-room layout, and both are informative rather
than noise:

- `sofa-3seat` at 0.85 × 0.90 × 2.10 m — its 0.85 m depth exceeds the 0.80 m
  default lift door. This is exactly the marginal case the sources say to
  measure: the same sofa clears a 0.90 m lift door, and the guides give both
  figures. A test demonstrates the flip by passing a measured 0.95 m route.
- `shower` at 0.90 × 0.90 × 2.00 m — a shower enclosure, which in practice ships
  as flat panels. A textbook illustration of the assembled-delivery caveat, and
  why the wording is a prompt.

## Sources

- [Will It Fit the Lift? Furniture Delivery Checklist Singapore — Megafurniture](https://megafurniture.sg/blogs/articles/will-it-fit-the-lift-studio-apartment-furniture-delivery-checklist-singapore)
- [HDB Lift Dimensions: Can a King Size Mattress Fit? — Megafurniture](https://megafurniture.sg/blogs/articles/can-hdb-lift-accommodate-king-size-mattresses-heres-what-you-need-to-know)
- [Complete Guide to HDB Lift Dimensions for Bulky Furniture](https://vargesingapore.com/hdb-lift-dimensions/)
- [Singapore HDB Dimensions: Before Buying Furniture — Maxi Home](https://www.maxihome.com.sg/blogs/news/singapore-hdb-dimensions-furniture-buying-guide)
- [How to Choose the Right Sofa for Your HDB Living Room — Castlery](https://www.castlery.com/sg/blog/how-to-choose-sofa-size-for-hdb)
