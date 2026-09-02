# Features that are complete except for the data they need

**Why this exists.** v0.31.5.288 found that the tile setting-out table had been rendering *empty
since it shipped*: `planTileCoursing` reads FLOOR finishes, and not one floor material in the
catalog carried a `moduleMm`. The code was finished, tested and wired into a sheet. The authored
data was missing, so the feature produced nothing — and nothing failed, because "no rows" is a
legitimate state.

That is a failure mode worth hunting deliberately rather than tripping over: **an optional data
field that a pro feature depends on, left unauthored across the shipped content.** Tests pass, the
UI renders, and the feature is silently inert. This is the measured audit.

## Measured coverage (v0.31.5.289)

Counted by importing the real catalogs and templates, not by grep.

| Data | Coverage | Consequence |
|---|---|---|
| `MaterialDef.moduleMm`, **floor** | 8/37 (22%) | Fine — the tiles that matter carry it after .288; non-modular finishes correctly have none |
| `MaterialDef.moduleMm`, **wall** | **2/57 (4%)** | No wall-tile setting-out exists to consume it (see below) |
| `PlanWall.structure` on **templates** | **0/225 (0%)** | Three pro features inert on 19 of 20 shipped plans |
| `PlanRoom.category` on templates | 154/166 (93%) | Good |
| `PlanRoom.floor` on templates | 166/166 (100%) | Good |
| `FurnitureDef.verticalSpan` | 54/159 (34%) | Expected — only wall-mounted/hung pieces need it |

`FurnitureDef.price` reads 0/159 and is NOT a gap: prices live in
`furniture/furniturePrices.ts` (`itemPrice(def, category, …)`), not on the def. Recorded so the
next person running this audit does not chase it. Same for `license`/`attribution`, which are
carried per-asset for the bundled GLBs, not on every primitive def.

## Finding A — no wall-tile setting-out at all

`tileCoursing.ts` sets out FLOORS only. Two wall tiles declare a 300×600 module and nothing
consumes it.

This is a real gap, not a data one: **wall tiling is where a bad cut is most visible**, because it
lands at eye level rather than underfoot, and a wall run has constraints a floor does not — you set
out from a datum course (usually full tiles at the top, cut at the floor, or aligned to a sanitary
fitting), the run is interrupted by openings, and the four walls of a bathroom have to course
CONSISTENTLY around corners. So it is not "run `planTileCoursing` on walls": it needs its own
model. Not attempted here; logged in `TODO.md` with that reasoning so it is not mistaken for a
half-hour job.

## Finding B — `PlanWall.structure` is unauthored on every template, and this one is NOT ours to fix

**Not one wall in any of the 19 shipped templates declares a `structure`.** Only the curated
default flat does. So on every template, `structure` resolves to `'unknown'` and:

- the plan editor's hackability overlay tints every wall the same "confirm with HDB/PE" class;
- the demolition sheet's structural classification never fires — no wall is ever flagged
  "NOT PERMITTED", and every demolished wall gets the generic ⚠;
- the 3D wall-types overlay shows one colour.

Three `pro` features, effectively inert on 19 of 20 plans.

**And the fix is deliberately NOT to seed the data.** `src/floorplan/CLAUDE.md` is emphatic that
`structure` is **user-declared, never verified** — the app cannot tell a load-bearing beam-and-column
wall from a non-structural precast partition from plan geometry, and getting it wrong is a
documented HDB hacking-plan failure mode. The curated flat is seeded only because its wall types
were *traced from the official plan image's legend*
(`assets/floor_plan/default.png`, `walls.jpg`). No such source exists for the 19 templates: they
are plausible reference layouts, not surveyed drawings.

Seeding them would put unverified structural assertions on shipped plans and hand the user a
confident "NOT PERMITTED" or, far worse, a confident *permitted*. That is the one direction of
error this feature must never make.

**The one partially defensible option, and why it still needs a call.** An HDB flat's EXTERNAL
walls and household-shelter ring are RC by construction, and `perimeter()` already emits the four
external walls with `thickness: 'external'` — so seeding just those as `'load-bearing'` on the HDB
templates would be defensible and would make the overlay useful without asserting anything about
the internal partitions that actually get hacked. But: it would also mean a *partially* classified
plan, where "unknown" on an internal wall now reads as "we checked and it's not structural" rather
than "nobody has looked" — a worse ambiguity than the current uniform unknown. And it does not
transfer to the condo/landed templates.

**So this is a product/content decision, recorded rather than taken.** Options, for the record:

1. **Leave as-is.** Uniform `'unknown'` is honest; the features light up as soon as a user declares
   their own walls, which is the intended workflow.
2. **Seed external + shelter walls on HDB templates only**, and change the overlay's legend so an
   unclassified internal wall reads explicitly as "not yet declared" rather than as a class.
3. **Seed fully from traced sources**, i.e. treat each template like the curated flat. Correct but
   needs 19 official plan images and the tracing work; several templates are composites with no
   single official source.

Option 2 without the legend change would be the worst outcome, which is exactly why it is written
down rather than done.

## The general check, for next time

When adding a `pro` feature that reads an OPTIONAL field:

1. Count how many shipped entries carry it, by importing the catalog — not by grepping.
2. If the answer is 0, the feature has not shipped, whatever the tests say. Either author the data
   in the same change or say plainly that it is inert.
3. Prefer a visible "N omitted, no data" report over a silent empty result. `planTileCoursing`
   returns `omittedRooms` for exactly this reason and it is why .288's gap was recoverable rather
   than invisible.
