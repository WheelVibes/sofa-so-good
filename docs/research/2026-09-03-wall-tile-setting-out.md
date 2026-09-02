# Wall tile setting-out — where each rule comes from

**The gap.** `tileCoursing.ts` sets out FLOORS. Two wall tiles in the catalog declared a 300×600
module and nothing consumed it (measured 2/57 in
`2026-09-03-authored-data-coverage.md`). Wall tiling is where a bad cut is most visible — it lands
at eye level rather than underfoot — so this was worth closing, but **not by re-running the floor
model on walls**: the conventions genuinely differ.

## The rules, and their sources

| Rule | Basis |
|---|---|
| Work from the wall's vertical CENTRE outward, so both end cuts are equal | "Find the vertical centre of the wall and mark a plumb vertical line… working from the centre helps achieve balanced cuts on both sides" |
| An end cut must be **at least HALF a tile** | "At any edge where you're cutting, you should have at least a half tile, as smaller cuts appear unsightly"; "mark a central starting point and measure your layout so your edge tiles are always at least half the width of a whole tile" |
| Adjust the centre line when a side would fall short | "Dry-lay a row of tiles along the datum line to check the cut sizes at each end; adjust the centre line if one side would result in a sliver less than half a tile" |
| Set out vertically from the CEILING down; full course at the top | "You always look at the top, rarely the bottom"; "you should set out from the highest point of the ceiling, as if you start at the lowest point and the ceiling is out of level, you'll get small cuts at the ceiling which is not a good look" |
| Datum line one tile height above the lowest point | "A horizontal datum line should be drawn one tile height above the lowest point of the wall" |

## The half-tile bar is the load-bearing difference from floors

`tileCoursing.ts` accepts an end cut down to a QUARTER module. Walls require a HALF. A floor cut
sits under furniture; a wall cut sits in your eyeline.

That difference has an arithmetic consequence worth stating, because it makes the wall rule read as
though it always fires. With a centred field, `cut = leftover / 2` and `leftover < module`, so the
naive cut is **always** under half a tile. Shifting the field by half a module — putting a joint on
centre instead of a tile centre — gives `cut = (leftover + module) / 2`, which always lands in
`(module/2, module)`.

So a correctly set-out wall run always ends on a cut between a half tile and a full one. The
"sliver" concept that is near-unreachable for floors (see `tileCoursing.ts`'s corrected header)
**cannot arise horizontally on a wall at all**. A swept test pins that over runs from 300 mm to 6 m.

## The vertical cut is flagged, not corrected — and the DEFAULT config trips it

Horizontal setting-out has a free adjustment available (shift by half a module). Vertical does not:
the tiled height is set by the ceiling, so there is nothing to borrow. The bottom cut is therefore
REPORTED and flagged when under half a course, never silently adjusted, because the fix is a
decision — drop the tiled height, change module, or accept it.

**This is not a corner case.** The app's default ceiling is **2.6 m**, the common SG figure, and the
catalog's wall tiles are **300 × 600**. 2.6 m gives 4 full courses (2400 mm) and a **200 mm bottom
cut** — under half a course, so unacceptable by the practice above. The default configuration of a
Singapore bathroom in this app trips the rule, which is exactly the decision a designer should make
before the tiler starts rather than discover afterwards. A test pins that specific case as the
motivating one rather than a contrived fixture.

## Deliberately NOT modelled

**Openings are reported, not designed around.** A door or window interrupts a face, but a tiler
still strikes the datum and centre lines across the whole run and cuts around the opening — so the
field is set out over the full face and the opening count travels with the row as a verify-on-site
note. A genuinely opening-aware field (where a balanced centre may sit somewhere else entirely, and
the courses above a door differ from those beside it) is a larger model, and faking it would put a
confident wrong setting-out on a drawing.

**Corner coursing consistency across the four walls of a wet room is not enforced.** Trade practice
wants courses to line up around a corner. Each face here is set out independently, so two adjacent
faces of different lengths will not generally agree at the corner. This is a real limitation, called
out here rather than papered over; enforcing it means solving all four faces together with a shared
origin, and choosing which face's balance to sacrifice — a design decision, not arithmetic.

## Sources

- [How To Tile A Wall: A Complete Guide To Wall Tiling — Tile Mountain](https://www.tilemountain.co.uk/blog/wall-tiling-guide/)
- [Tiling Bathroom Walls: Layout — Fine Homebuilding](https://www.finehomebuilding.com/project-guides/tiling/tiling-bathroom-walls-layout)
- [Datum line for tiling — DIYnot Forums](https://www.diynot.com/diy/threads/datum-line-for-tiling.530263/)
- [Is it best to have cut tile at bottom or top of wall — Screwfix Community](https://community.screwfix.com/threads/is-it-best-to-have-cut-tile-at-bottom-or-top-of-wall.104688/)
- [How to Tile a Bathroom Wall — Wickes](https://www.wickes.co.uk/how-to-guides/tiling/tile-a-wall)
