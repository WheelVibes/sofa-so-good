# `src/layout/` — auto-arrangement rules

Placement constants live in `designRules.ts` (`CLEARANCE`); `autoArrange.ts` drives the
per-room routines. Rules in `docs/interior-design-guidelines.md`.

## `tryPlace` reports failure by returning its INPUT (v0.31.5.111)

`tryPlace(item, pos, rot, world, ctx)` returns the **placed candidate** on success (and pushes
it into `world`), and the **original `item`, untouched**, when the spot is blocked by a door
swing, a window keep-out or a collision. `world` is left alone in that case.

**So `tryPlace(...).position` is a phantom whenever placement failed** — it is the item's
pre-placement position, and `arrangeCore`'s safety settle will move the item somewhere else
afterwards. Every caller must test identity first:

```ts
const placed = tryPlace(item, pos, rot, world, ctx)
if (placed !== item) return placed   // succeeded
```

`snapToWall` and the sofa's stepped-inward search both do this correctly. The two dining
routines did NOT: they slotted the chairs around `placed.position` unconditionally, so a
blocked table produced chairs arranged around a spot the table never occupied — measured at
**50 dining chairs over 1.2 m from their table across 15 templates, the worst 4.4 m**, while
`tpl-hdb-jumbo` and `tpl-terrace-ground` tucked theirs at exactly 0.90 m because their tables
happened to place first time.

`placeDiningTable` now settles the table immediately when `tryPlace` fails and reads its final
transform back out of `world`, so chair slots always measure from where the table really is.
It also reads the ROTATION back off the placed table — a settled fallback may have turned it.

## A chair with one slot falls to a room-wide grid search

`arrangeCore`'s safety settle grid-searches the WHOLE room for anything the room routine left
unplaced. That is right for a stray accent and wrong for a dining chair: it parked one 7.6 m
from its table in `tpl-hdb-5room`. `arrangeLivingAnyEdge` therefore offers the two table ENDS
as spare slots and lets a chair claim any slot no other chair has taken.

**Two dining code paths exist and only one is exercised by the templates.** `arrangeLiving`
(block 1) serves the DEFAULT flat's curated `ROOMS` path; every `PLAN_TEMPLATES` entry goes
through `arrangeLivingAnyEdge` (`genericLiving`). An edit to block 1 will not move any
template measurement — that is dead code from the templates' point of view, not a fix that
did nothing. Verify which branch runs before changing the other.

Coverage: `diningChairTuck.test.ts` (asserts tucking AND per-template item counts, because a
fix that quietly deletes furniture is worse than the bug — see `.106`).

## `tryPlace` has no notion of the room rectangle (v0.31.5.112)

`tryPlace` rejects walls, collisions, door keep-outs and window keep-outs. It does **not** know
which room it is placing into. On a room with an OPEN edge — no wall to collide with — a slot can
be perfectly valid physically and still land on the circulation floor beyond the room, on a
different floor finish.

This bit `.111`: `cp-living` in `tpl-condo-penthouse` is **2.6 m wide**, narrower than a 4-seat
table plus chairs on both sides, so tucking the chairs pushed two of them past its west edge — one
by 0.52 m, visibly standing on pale circulation floor next to a wood-floored living room. The
chair-slot loop in `arrangeLivingAnyEdge` therefore skips any slot more than `TOL` outside `rect`.

**`TOL = 0.2` comes from the geometry, not from a test.** Room rects sit ~0.1–0.2 m inside their
wall centrelines, so a few centimetres past an edge is still within the room's walls; half that
margin is where a piece is demonstrably on another floor. Both settings were measured before
choosing — `0.05`: 18 stray chairs / 1 floor orphan; `0.2`: 17 stray / 3 floor orphans, of which
the two chair cases are 0.08 m out (inside the wall inset). 0.2 keeps tucking unharmed AND removes
the only visually wrong chair.

If you add another slot-based placement, apply the same guard. A physically valid position is not
automatically a position in the right room.

## Gaps and ROUTES are different questions (v0.31.8.51 / .52)

`walkway.ts` measures **gaps** — how much clear floor sits between two pieces. It skips any
item-item gap `<= CLEARANCE.sofaToCoffee` (0.40 m) as intentional close spacing.

**Do not "fix" that floor by exempting large pairs.** It was built and measured over the 19
templates in v0.31.8.51 and reverted: `coffee-table` is 0.605 m² against the 0.5 m²
`OBSTACLE_AREA` bar, and so are `tv-console`, `armchair`, `desk` and `dresser`, so the
exemption reclassified the canonical arm's-reach pairs as blocked routes — +105 findings,
circulation median 68 -> 28, two templates back at a floored zero. `walkway.test.ts` pins the
rejection with the catalog areas that kill it.

`reachability.ts` answers the other question: does a pair **seal** a route? It erodes the
storey's free floor by half a body width and flood-fills what is left, so the ruler is the
body, not a threshold — a 0.05 m slot has no cell that survives erosion and a 1.2 m one does.
Two things about it are load-bearing:

- **The interior comes from the ENVELOPE, not from room rectangles.** Corridors in these
  templates are UNDECLARED floor (there is no `corridor` `RoomCategory`), so a mask built from
  room rects gives every room its own component and calls the whole flat severed — the first
  cut reported 74-98 isolated rooms. The fill starts outside the grid with the doors CLOSED;
  whatever it cannot reach is inside.
- **The empty-plan baseline is subtracted.** 21 of the 67 isolated rooms are isolated with no
  furniture at all (`tpl-hdb-4room`'s bedroom half has no interior door — see
  `templateConnectivity.test.ts`). Only the remaining ones are the arranger's doing.
- **Only circulation OBSTACLES can seal a room** (`OBSTACLE_AREA_M2`, 0.5 m², v0.31.8.53).
  Counting every floor-standing piece named `potted-plant`, `nightstand` and `floor-lamp` as
  things that walled a room off; you step past a floor lamp. `layoutCritique`'s `bed-access`
  draws the same line with the same constant for the same reason. This is the OPPOSITE direction
  to the .51 rejection above, and both are right: the bar answers "does this define a walkway",
  which is this question and was not that one.

**"Reachable" means reachable FROM THE FRONT DOOR** (v0.31.8.54) — the main region is the
component holding a cell just inside an external-wall door, not the largest component. Largest
was a heuristic with a real failure mode the culprit search exposed: removing a piece can flip
which region is largest, so a room reads as reconnected when the rest of the home got cut off
instead. It also reports the wrong SIDE of a seal — on `tpl-hdb-jumbo` the old reading said
"Bedroom 5 is cut off" where the truth is that only a 5.7 m² pocket by the front door is
reachable and the other ~55 m² is not. A storey with no external door falls back to largest.

`SeveredRoom.sealedBy` names the pieces whose removal ALONE reconnects the room, which is what
turns a finding into an instruction. It reuses the raster: the grid is furniture-independent
apart from an `itemAt` lookup, so each candidate is one `solveGrid` with that footprint freed
(~1 ms against ~60 ms for a full pass), and one solve answers it for every severed room on the
storey at once.

**`unsealRoutes` FIXES most of them, and it runs in the default furnish path** (v0.31.8.55).
`furnishPlanItems` calls it after the drop passes: it slides a sealing piece across a **disc** of
0.15 m steps out to **2.4 m**, nearest first, and takes the first position that opens the route
without severing anything new. **43 unreachable rooms -> 3, 10 affected templates -> 3, by
moving 12 items and deleting none** (plus one template door re-authored, below).

**The search is a DISC, not a cross** (v0.31.8.86). It was ±X and ±Z only — 16 distances x 4
directions = 64 candidates — which cannot move a piece out of a CORNER. `tpl-hdb-5room` was
exactly that: a `bed-single` and a `wardrobe-3door` pinching the corridor into the bedroom half
and stranding four rooms, each piece individually sufficient to reconnect all four, yet no
translation was found. Instrumenting the gates showed why — of the 64 offsets, **53 failed
`trialFits`** (the bedroom is packed, so a pure slide has nowhere to land) and the other **11 fit
but stayed inside the pinch**; not one was rejected by the don't-sever-anything-new guard. The
search had simply never looked diagonally, where the free floor was. The disc is **faster
despite ~17x the candidates** (maisonette 1115 -> 856 ms, jumbo 616 -> 473 ms), because the cost
is `solveGrid`, not the candidate list: `trialFits` rejects most offsets without solving, and
nearest-first ordering commits a fixable room early instead of exhausting 64 misses and re-running
the culprit sweep. One cost trap worth knowing: with a disc, the clash pass's candidate list gets
rebuilt hundreds of times per piece — caching it per OBSTACLE was worth ~350 ms on maisonette.

**The reach was measured, not chosen** (v0.31.8.56): 1.2 m leaves 18 rooms, 1.8 m leaves 11,
2.4 m leaves 10, 3.0 m gains nothing. A bigger ceiling does not mean bigger moves, because
candidates are tried nearest-first — measured at 2.4 the moves are **median 0.45 m, max 1.95 m,
11 of 12 within 1.2 m**, and the one long move is jumbo's COFFEE TABLE, opening 8 rooms. Three things make it safe, and each corresponds to a way an
earlier attempt on this thread failed:

- **It only writes `position`.** Never deletes, never resizes, never rotates. A route bought by
  removing the sofa is not a fix; deletion belongs to the drop passes.
- **It rejects any move that severs a room which was fine.** That is the guard v0.31.8.7's
  clearance objective lacked when it traded one pinch for another.
- **A trial must also pass the NARROWPHASE, not just the raster** (v0.31.8.86). `trialFits`
  reads `LevelGrid`, which holds only the pieces `participates()` admits — floor-standing,
  clipping, at least `OBSTACLE_AREA_M2`. Everything smaller is INVISIBLE to it, so a slide could
  park a sofa through a side table with every grid gate satisfied, and the pass was doing exactly
  that: the 19-template corpus carried **5 overlapping pairs, all five created here**. Trials now
  also ask `itemHeightAwareClash` — the same predicate `findItemOverlaps` uses — which took the
  corpus to **0 overlapping pairs**. It also made `tpl-hdb-2room` report 1 -> 4 severed rooms,
  which is a CORRECTION: those three were only ever "reachable" through an overlapping piece, and
  a route you can only walk by standing inside the furniture is not a route. `routeAccess.test.ts`
  asserts the zero-overlap invariant alongside the counts so re-allowing that trade cannot read
  as progress.
- **A moved piece takes its SATELLITES** (v0.31.8.86). A dining chair is ~0.2 m², under
  `OBSTACLE_AREA_M2`, so it is invisible to the raster — and the disc slid
  `tpl-hdb-maisonette`'s dining table ~1.5 m and left three chairs 2.38 m behind it, the exact
  defect `diningChairTuck.test.ts` was built for. Small pieces are now assigned to their NEAREST
  obstacle within `SATELLITE_REACH_M` (1.2 m, matching that test's `TUCKED`, so a lamp beside a
  sofa follows the sofa rather than a table across the room) and translate with it. Riders are
  clash-checked against the other pieces AND against the walls — `trialFits` only ever rasterised
  the obstacle itself, so without the wall check a carried chair goes through one
  (`tpl-condo-1study`). This costs `tpl-1bed`'s Dining, which no offset can clear while carrying
  the coffee table's satellites; that trade is deliberate, because chairs stranded around nothing
  are a defect a user SEES and a 0.6 m² sliver is one a check reports.
- **It never slides a piece OUT OF ITS ROOM** (ROOM-CONTAINMENT, v0.31.9.16). The disc searches
  2.4 m in every direction and nothing kept that inside the piece's own room. Measured on
  `tpl-hdb-5room`: a `bed-single` moved (5.08, 5.00) -> (7.33, 5.30) — 2.25 m, across a wall, out of
  `h5-bed3` and into `h5-living`. **The item count never changed, so no ratchet saw it**; it
  surfaced only as "a bedroom with no bed" once `roomCompleteness.test.ts` existed (v0.31.9.15).
  A route bought by putting the bed in the living room is not a fix, for exactly the reason
  v0.31.8.55 refused to buy one by deleting the sofa. A piece that started in no declared room
  (undeclared circulation) stays unconstrained.
  **This gave back v0.31.8.86's headline.** Those four `tpl-hdb-5room` rooms, and
  `tpl-condo-4bed/c4-bed4`, were opened BY the eviction — so `routeAccess` goes 6 -> 11 and that is
  a correction, not a regression. Item count +2 (`throw-cushion`, the styling pass dressing the bed
  that now stays put), overlaps still 0.
- **Placement uses a STRICTER mask than routing** (`LevelGrid.standable`, doors CLOSED, inflated
  one cell, minus `clearance.ts:doorProbePoints`). `openFloor` gaps a wall at every open door
  because a doorway is a route — it is not a parking space, and the first cut used it and slid
  the penthouse's TV console into a doorway. The door constraint is deliberately the SAME
  predicate `dropDoorBlockers` deletes on, so "legal to stand here" and "survives the drop pass"
  are one rule; using the full `doorKeepOutRects` (swing arc + 0.45 m approach) instead was
  measured and rejected — far stricter than the deletion rule, and it cost 19 of the fixes.

Cost is bounded by sweeping culprits ONCE per state: one `solveGrid` with an obstacle excluded
answers "does this seal it?" for every room at once, so the sweep is O(obstacles), not
O(rooms x obstacles). Looping per room cost `tpl-hdb-jumbo` — 8 unfixable rooms, so every trial
runs and fails — 883 ms on top of a 434 ms furnish; sweeping once brings the whole pass to
+40..160 ms depending on template.

Coverage: `reachability.test.ts` (unit + culprit + unseal invariants), `routeAccess.test.ts`
(ratchet of what is LEFT after v0.31.8.86: **6 rooms across 3 templates** — `tpl-hdb-2room`'s
four, in a flat too small to hold the move-in layout and walk between it; `tpl-1bed`'s Dining,
traded for keeping its satellites tucked; and `tpl-condo-2bed`'s Common Bath, which has NO single
culprit and so cannot be opened by a one-piece-at-a-time pass — plus the zero-overlap invariant).

**Not every seal is the arranger's fault.** `tpl-condo-2bed` held 8 of them behind one
`kitchen-counter-l` that had nowhere legal to go — and the reason was upstream: its front door
sat inside the 2.4 x 2.8 m Open Kitchen, whose only other exit is a 1.1 m pass-through that the
counter and fridge fill once furnished. The unseal pass could not fix it, because the counter's
only clear space is the strip the front door's own keep-out occupies. Moving the door into the
living room (v0.31.8.57) took that template 8 -> 1. When a single piece seals many rooms and has
nowhere to go, check where the front door is before making the mover cleverer. The pass is IDEMPOTENT, which matters because the report runs the route check
over its output. It costs two rasters per storey, so `buildLayoutCritique` runs it only when
asked (`{ routeAccess: true }`, which only `ui/report.ts` passes) — enabling it inside
`schemeOptions`, which critiques a dozen candidates, pushed the Scheme Compare modal past a
15 s harness timeout the same scenario clears without it.

## Appliances are not free-standing furniture (v0.31.8.58)

A stove needs a wall for its hood and flue, a fridge for its coils and door swing, a washing
machine for plumbing. `applianceWall.test.ts` ratchets three classes the corpus shows:
**15 appliances more than 0.28 m off every wall**, **4 templates with a range hood and no stove
at all**, and **1 hood 1.13 m from its stove**.

**The 0.28 m threshold is derived, not chosen.** `snapToWall` places at `gap = 0.06` from the
room rect, and `planRoomRect` insets 0.12 from the room origin — which in these templates is the
wall FACE. So a correctly snapped piece sits at exactly **0.18 m**, and the readings cluster
there. 0.28 is a full 10 cm beyond that, which no inset artefact explains. A first cut used
0.15 m, reported "38 of 53", and was measuring the threshold rather than the layouts — if you
change this constant, re-derive it from `snapToWall` rather than picking a rounder number.

## "Flush to the wall" means the same distance on every edge (v0.31.8.71)

`planRoomRect` insets `ROOM_INSET` (0.12) from the room boundary and `snapToWall` leaves a
further 0.06, so a wall-snapped piece sits 0.18 m from the boundary. But room rectangles are
authored against the wall CENTRELINE with a constant offset, and half-thickness varies (internal
0.05, external 0.10) — so of the 570 shipped rect edges with a wall within 0.3 m, only 226 are
flush: **186 are short by 0.05 and 86 by 0.15** (`floorplan/roomRectWalls.test.ts`).

`edgeShortfall` measures that per edge and both `snapToWall` and `placeFlush` push the piece out
by it. **Patch both or neither** — the kitchen work-triangle goes through `placeFlush`
(`arrangeKitchen`'s `toEnd`), and patching only `snapToWall` fixed exactly one appliance out of
nine. And only walls roughly PARALLEL to the edge count: the nearest wall to a short edge is
often a perpendicular one near its end, and using it pushes the piece through the real wall.

**Do NOT fix this in `planRoomRect` instead.** That was tried in v0.31.8.61: resolving the rect
also moves its CENTRE, the arranger centres dining groups on the rect, and `tpl-hdb-3room`'s
table slid onto the rect edge with its two west chairs flung to the room's ends. Correct the
DISTANCE, not the rectangle.

It also needed `placeSeededMounts` to stop giving a mount its wall unconditionally — see
MOUNT-HEIGHT-CLASH there. A wardrobe now against the wall reaches a mount's height, and
`dropOverlaps` was deleting the mount.

## `snapToWall` offered ONE along-wall position per edge (v0.31.9.22)

The along-wall coordinate was `clamp(item.position[…], lo, hi)` — the seed point, which is the
ROOM CENTRE. So a piece got exactly four candidate spots in a room, one per edge, and anything
sitting at the middle of a wall refused that whole wall.

**A door swinging into a galley kitchen was enough to lose the entire kitchen.**
`tpl-studio/st-kit` and `tpl-1bed/ob-kit` shipped with no hob, no fridge and no counter; the
cause was a 0.9 x 0.9 door keep-out at x 1.10-2.00, dead centre of the only wall long enough
to take a counter, while **1.88 m of that same wall stood clear**. Neither room was too small
— the four releases before this one each published a different wrong cause for it (a walkway
minimum that does not exist, the room's longest wall, `ROOM_INSET`, the door's depth), so
instrument `tryPlace`'s gates before theorising about this room.

`snapToWall` now sweeps the along-wall coordinate in `max(0.1, w/2)` steps out to 16 either
way, the same shape `placeSeededMounts`' rescue has used since v0.31.5.107. Three things about
it are load-bearing:

- **STRICTNESS SITS OUTSIDE THE WALL LOOP** — the clamped position is tried on all four edges
  FIRST, and only then does the sweep run. Nesting it the other way (sweep inside the edge
  loop) lets a swept spot on the first wall beat the CLAMPED spot on a later one, which
  reshuffles pieces that were placing fine: measured over the 19 templates it cost
  `tpl-condo-1bed` its counter AND stove — a kitchen that had only wanted a fridge —
  `tpl-hdb-2room` its fridge, and `tpl-condo-2bed` its desk. As an outer pass, anything that
  placed before places IDENTICALLY and the sweep is purely additive. This is the same lesson
  v0.31.8.75 had to learn for the window relaxation.
- **Swept candidates are CONTAINED, clamped ones are not.** `perp` adds `edgeShortfall`, which
  deliberately pushes a piece OUT past the rect edge to meet the real wall face (v0.31.8.71) —
  so an edge can be legal and still leave the footprint in the room next door. With one
  position per edge that was unreachable, because the overshooting edge was blocked; the sweep
  is what finds a free spot on it. Leaving the clamped pass unguarded is what preserves
  "places identically".
- **Sizing and sweeping are ONE fix, and either alone is inert.** `fittedCounter` sizes the
  counter to the longest CLEAR run (per-wall intervals minus door keep-outs) rather than the
  longest wall, because a 2.4 m run cannot fit a 1.88 m gap however it is moved. v0.31.9.21
  shipped the sizing on its own and measured ZERO deltas across the whole suite: `snapToWall`
  CLAMPED the piece to the centre, so a shorter counter still straddled the keep-out.

Result: `roomCompleteness` 5 -> 3 incomplete rooms, `applianceWall`'s orphan hoods 4 -> 2,
`windowSightline`'s blocked list 5 -> 4 (the penthouse wardrobe v0.31.8.71 traded away comes
back, at no cost to the nine appliance fixes it was traded for). Cost: `tpl-condo-2bed/c2-bed2`
loses its desk and book-set, and `tpl-1bed/ob-kit` its ceiling light — both recorded per-def in
`diningChairTuck.test.ts` and named in `TODO.md`.

## Mounts are PHANTOM obstacles at the room centre until `placeSeededMounts` runs (v0.31.9.30)

`arrangeCore` seeds `world` with the room's fixed pieces "so floor furniture isn't parked under
them". On the furnish path those mounts are still on their SEED — the room CENTRE — because
`placeSeededMounts` moves them to their walls AFTER the arranger. So every room's floor is
arranged around an obstacle that is not where it will end up.

Measured on `tpl-hdb-maisonette/emu-cbath` (rect 1.16 x 1.96), instrumenting `snapToWall` gate by
gate for its toilet:

```
W t=1.45 box 6.93-7.59 x 1.25-1.65  contained=true inKeepOut=false wallsOk=true
                                     winHit=0 itemsOk=false
                                     blockers=[towel-rail@7.50,1.30(mounted=true)]
```

A **towel rail in the middle of the bathroom** refuses the toilet every position on every wall.
The toilet and basin both stay on the seed, and `dropOverlaps` then keeps the toilet and deletes
the basin AND the shower the arranger had placed — that is the basin `bathroomFixtures.test.ts`
records. The rail ends up at 8.13, 1.30.

**Do not try to fix this by ignoring the phantom.** Excluding a fixed piece still within
`placeSeededMounts`' own seed epsilon was measured at **`missing-fixture` 6 -> 11 and the ranked
score 60,813,173,903 -> 110,913,174,303**: without the mounts holding the centre, floor pieces
take it and the mounts then have no wall left to be rescued to. The phantom is load-bearing.

**Nor by height.** `tryPlace` now skips a MOUNTED obstacle whose vertical span misses the
candidate's, which aligns it with `dropOverlaps` and with `placeSeededMounts`' own doctrine that a
mount "must neither reserve floor nor be blocked by it" — but it is INERT on today's corpus,
because a towel rail spans 0.70-1.20 m and a toilet reaches 0.78. The clash is real.

**ORDERING WAS TRIED AND FAILS IDENTICALLY (v0.31.9.31).** A `MountPhase` on
`placeSeededMounts` — mounts to their walls before arranging, the rescue still after — scores
**110,913,174,603**, within 300 of the seed-exclusion result. That closeness is the tell: both
changes free the room CENTRE, and the centre is what the arranger was leaning on.

`marooned-wall-hugger` goes **39 -> 46**, and measured continuously as each wall-hugging piece's
distance from its room's nearest edge over the half-short-side (0 = on the wall, 1 = dead centre),
**0.311 -> 0.327**. So the seed-parked mount was not merely in the way — it was enforcing
"storage, appliances and beds flush to walls" (`docs/interior-design-guidelines.md`) as a side
effect of pass ordering. Remove it and floor furniture drifts inward, costing five more severity-1
fixtures than the basin is worth.

**The explicit wall preference exists now (WALL-FIRST, v0.31.9.32) and it is NOT enough.**
`settlePass` orders its grid nearest-the-wall for `WALL_BOUND_CATEGORIES` — worth score
60,813,173,903 -> 60,813,163,803 on its own — and with it in place the seed exclusion still costs
`missing-fixture` 6 -> 11. The five losses name the mechanism: `h2-bath`, `h4-cbath`, `st-bath`
(WC *and* basin) and `ctu-cbath`, **all bathrooms of 1.06-1.36 m rect**, with `emu-cbath`'s basin
still not recovered. In a room that tight the phantom is a SPACER that happens to produce a
workable interlock, and these fixtures reach their walls through `arrangeFixtures`/`snapToWall`
rather than the settle, so no ordering preference can touch them.

**RESOLVED in v0.31.9.33, and not in the arranger.** Below 1.6 m of room width a 0.9 x 0.9 m
shower CUBICLE leaves under `CLEARANCE.walkwayMin` to reach the WC and basin, so
`KITS.bathWetArea` gives those rooms the 0.9 x 0.06 m `shower-screen` instead — which is how an
HDB bathroom of 2-3 m² is actually built. Score **60,813,163,803 -> 40,813,163,803**,
`missing-fixture` 6 -> 4, nothing else moved, and both basin-less bathrooms are recovered
including `ctu-mbath`, broken since v0.31.8.9.8.

**The lesson is the ordering of the two questions.** Five arranger routes were built and measured
before anyone asked whether the FITTING was right for the room: when a room cannot hold its kit,
check the kit against the room before making the placer cleverer.

**The rejected routes, kept because they are still true** — five measured and rejected (height-aware obstacles: inert; seed
exclusion: 110.9 G; 800 mm shower tray: 70.8 G; mounts-first ordering: 110.9 G; wall preference +
seed exclusion: 110.9 G). **This is a PACKING problem in a 1.16 x 1.96 m room, not an ordering or
preference problem.** The next move is CONTENT and is a product call: a kit that fits (a combined
basin-and-WC unit, or no shower in a 2.3 m² room) or 0.1 m wider templates.

Related: the `shower` def's `size` param drove every rendered dimension and NOT the collision
footprint (no `footprintParams`), so a 1.2 m shower collided as 0.9 and a 0.8 m one reserved floor
it did not occupy. Fixed in the same release; inert, because every shipped shower takes the
default.

## COUNTER-INSET and WALL-ENDS, and the price they were bought at (v0.31.9.29)

Two changes, landed together because either alone is a regression, and judged by the ranked score
rather than by ratchet counts: **61,012,173,703 -> 60,813,173,903.**

- **`fittedCounter` sizes to the INSET RECT, and rounds DOWN.** It used
  `max(room.width, room.depth)`, but the counter must fit the rect the arranger places into, and
  `planRoomRect` insets `ROOM_INSET` (0.12) from EACH side — so every sized run was **0.24 m too
  long**. `su-kit` was never placed at all (it sat at the room centre), `c1-kit` left its fridge
  no wall, and `h2-kit` overflowed its room by 0.34 m. `Math.round(1.76 * 10) / 10` is 1.8, which
  still overflows: every rounding here goes DOWN.
- **`snapToWall` offers the two ENDS of the wall, and steps 0.15 m instead of `w/2`.** A fixed
  step samples a lattice, and the position that works can be narrower than the step:
  `tpl-studio/st-kit`'s only along-positions clear of the door keep-out span **0.08 m**
  (x 2.90-2.98), and neither `w/2` nor a 0.15 m lattice ever samples it. `hi` IS 2.98. Ordering
  the ends before or after the lattice makes no difference to what breaks — their EXISTENCE
  rebalances placement, not their priority.

**The price is real and is recorded in each ratchet it moved**, which is what distinguishes a
priced trade from "an entry to silence a failure": `emu-cbath` loses its basin, `cs-balcony` its
route, two appliances their walls, and one `tpl-hdb-jumbo` dining chair strands 4.54 m from its
table. Against: `cs-kit`'s hob and counter, two room overhangs, one orphan hood, and
`c2-bed2`'s desk and book-set back.

**Severity 1 is a 1-for-1 swap and severity 4 is unchanged** — `cs-kit`'s fixtures for
`emu-cbath`'s basin, and one chair stranding while another tucks. Neither is visible in a
per-class count or a per-template list, which is why the score reports classes and the ratchets
keep their per-finding lists. The verdict rests on two `outside-room` fixes against one severed
room and two marooned appliances.

Lever B from v0.31.9.24 (containment inside `settleInRect`) is still OUT: it adds two more
stranded chairs and the score does not pay for them.

## Judge a placement change with the RANKED score, not the ratchet count (v0.31.9.28)

`analysis/layoutDefects.ts` surveys the corpus once and returns findings tagged with a severity
from the product goal — a plan a contractor can build from — and `defectScore` weights them
LEXICOGRAPHICALLY (`SCORE_BASE ** (6 - sev)`, base 100) so a severity-1 regression cannot be paid
for with any number of lesser fixes. Corpus baseline **61,012,173,703**.

| sev | class | today |
|---|---|---|
| 1 | `missing-fixture` — no hob/fridge/counter, no bed, no WC or basin | 6 |
| 2 | `outside-room` | 10 |
| 3 | `unreachable-room` | 12 |
| 4 | `stranded-satellite` | 17 |
| 5 | `marooned-wall-hugger` | 37 |
| 6 | `blocked-window` | 3 |

**Use it before accepting or rejecting an arranger change.** The seven per-class ratchets read one
line per finding, which cannot distinguish a reshuffle from progress — and that is not a
hypothetical: v0.31.9.27 rejected four levers on the ratchets alone, and the score says they are a
net **improvement** of ~199 M. Severity 1 turned out to be a 1-for-1 swap (`cs-kit`'s hob and
counter for `emu-cbath`'s basin) and `stranded-satellite` unchanged corpus-wide, so the verdict
rests on two `outside-room` fixes against one severed room and two marooned appliances. None of
that was visible one line at a time.

Two things it caught about the existing measures on its first run, both worth knowing:

- **`windowSightline.test.ts` was not level-scoped** and reported an `em-up` wardrobe as blocking
  a GROUND-floor service-yard window (`em-yard-win`). An F13 violation in a test; fixed, and
  `KNOWN_BLOCKED` went 4 -> 3 with no furniture moved.
- **A severity order has to be complete to be safe.** The survey initially omitted bathrooms, so a
  change losing a basin scored as free — exactly the trade being judged. `bath`/`powder` now
  require a WC and a basin.

`ROOM_REQUIREMENTS` lives in that module and `roomCompleteness.test.ts` imports it, so the two
cannot drift on what a fixture is; the ratchet keeps its own SCOPE (bedrooms + kitchens) because
bathrooms are measured by `bathroomFixtures.test.ts`.

Restating a rule risks drifting from it, so `layoutDefects.test.ts` pins every class count against
what the corresponding ratchet records, and asserts no class is empty — three emptiness assertions
on this thread have passed because a loop body never ran.

## Four placement levers, all rejected — and what the corpus is actually short of (v0.31.9.27)

v0.31.9.24 built four levers, v0.31.9.26 unblocked them, and v0.31.9.27 measured every subset and
rejected all four. `autoArrange.test.ts`'s hard validity assertion passes in every configuration,
so the blocker is gone; what remains is content, and no subset is a net win. Even the arithmetic
one alone — sizing the counter to the inset rect — trades `cs-kit`'s fixtures and two overhangs
for the worst overhang in the corpus (0.60 m of `st-kit`'s counter), a severed `cs-balcony` and
two marooned appliances. Per-subset table in `CHANGELOG.md` v0.31.9.27.

**Do not attempt another placement lever until defect classes can be RANKED.** Four attempts in a
row traded one class for another, and every ratchet here reads one line per finding — a stranded
chair, a missing counter and a blocked window are indistinguishable. Without an order, a reshuffle
cannot be told apart from progress. A proposed order is in that changelog entry.

### The over-stuffed-kit theory is refuted — do not re-open it

Intended kit footprint over floor area, per room, before any drop pass: **peaks at 52%** corpus-wide
(`h4-cbath`, 2.1 m²), **zero rooms at 60% or more**, and 14-27% in every room the arranger
struggles with (`c2-bed2` 14%, `su-kit` 27%, `st-kit` 16%, `em-study` 10%). Nothing is
over-stuffed. **The constraint is WALL RUN, not floor area** — a 2.0 m wall cannot take
counter + hob + fridge in a line however much floor is free.

**Density measured by item POSITION is meaningless while open-graphics item (f) is open.** A first
cut of that measurement read `em-study` at 103% and nearly became the headline; it was counting
SURVIVORS by position, so it swept in the furniture of adjacent open-plan rooms whose rects
overlap. 15 terminal rooms share a wall-free volume with another declared room.

### The kitchens need three WALLS, not a new primitive

Per-wall free runs on the inset rect after door keep-outs, against counter 1.2 + hob 0.6 +
fridge 0.7:

| kitchen | rect | free runs | verdict |
|---|---|---|---|
| `su-kit` | 1.76 x 1.36 | S 1.76, W 1.13, E 1.13, N 0.43+0.43 | fits across S+W+E |
| `c1-kit` | 1.76 x 1.36 | S 1.76, E 1.36, N 1.08, W 0.78 | fits across S+E+N |
| `cs-kit` | 1.76 x 1.96 | E 1.96, N 1.08, S 1.08, W 0.68+0.38 | fits across E+N+S |

All three fit with existing geometry. `arrangeKitchen` confines its work triangle to the two LONG
walls — `aspect = horizontal ? ['S','N'] : ['W','E']` — which is two walls where a near-square
kitchen needs three. `kitchen-counter-l` is a straight run despite the `-l` in its id and does not
need to change.

## The arranger can place a piece ONTO an item it has not placed yet (v0.31.9.24/.25)

`world` holds only what is already placed, so a room item still awaiting its turn is invisible to
`canPlace` — and once its own spot is gone, no amount of last-resort searching gets it back.

Measured on the default flat: `default-sy-rack` was VALID at (5.30, 7.20), **never moved**, and
came out of `arrangeAllRoomsForPlan` invalid because `default-sy-washer` was placed on top of it.
The ordering follows without further instrumentation — had the rack been in `world`, `canPlace`
would have refused the washer that spot, so the washer was placed first.

**This corrects the first version of this note, which blamed a "starved" piece and a settle that
surrenders.** The rack was not starved; it was buried. A cleverer settle would not have helped.

**The obvious repair is wrong for the furnish path.** Seeding `world` with the room's unplaced
items and removing each as it is placed is right for TIDY, where items start spread out, and
catastrophic for FURNISH, where every piece in a room starts at the SAME seed point (the room
centre) — everything would block everything and nothing would place. A real fix has to
distinguish "an item sitting where it belongs" from "an item parked on a seed".

**FIXED in v0.31.9.26 by RESERVE-RETRY.** `arrangeCore`'s body is now one `attempt(reserved)`
function; if an attempt leaves anything unplaced it runs ONCE more with those pieces seeded into
`world` at their current transform, so the others route around them. `tryPlace` already replaced
a pre-seeded entry in place and already filtered the candidate against itself, so a reserved piece
can still move — nothing there needed changing. The retry is kept only if it leaves strictly fewer
of the room's pieces invalid.

**The furnish/tidy difference is an explicit `reserveRetry` flag** (default true;
`furnishPlan` passes false), and it has to be, because two attempts to infer it were measured and
failed: `invalidCount` alone moved nine ratchets (on furnish, reserving a seed-parked piece
reduces invalid overlaps by STRANDING others — an item-count change a validity metric cannot see),
and adding an `unplaced` comparison did nothing because a reserved piece sits in `world` from the
start and always reads as placed. Verified unblocked: with v0.31.9.24's wall-ENDS candidate
re-applied, `autoArrange.test.ts`'s "tidies a custom plan validly" passes.

`furnishPlan`'s `dropUnplaceable` (v0.31.9.25) closes the FURNISH half: the arranger still never
deletes (the interactive tidy must not eat a user's furniture —
`autoArrange.test.ts` pins `expect(out.length).toBe(hydrate().length)`), so the drop sits on the
furnish path beside the drops for clashes, door swings and wall clips. It is a measured **no-op**
today, which is the point: it converts a class that used to surface as an INVALID item — a state
no ratchet here measures, because every per-def count sees a piece that is still "there" — into an
item-count delta that `diningChairTuck.test.ts` already reads. `furnishValidity.test.ts` asserts
it at zero.

### The older framing, kept because the levers are still blocked on it

`settleInRect` is the last-resort placement, and when nothing fits it leaves the item at its
ORIGINAL transform — standing in a wall, if that is where it was seeded. Nothing downstream drops
it. `autoArrange.test.ts`'s "tidies a custom plan validly, clearing door swings" asserts every
item is valid, so **any change that rebalances placement can starve some piece and break a hard
assertion that cannot be ratcheted.**

v0.31.9.24 hit this with four levers that were otherwise a clear win — room overhangs **10 -> 4**,
`tpl-condo-2bed`'s `desk` and `book-set` restored, `cs-kit` improved — and all four had to be
reverted because one of them starved the default plan's `drying-rack`. Per-lever attribution is
in `CHANGELOG.md` v0.31.9.24; the short version:

- **size the counter to the INSET RECT, `floor` not `round`** — `fittedCounter` measures
  `max(room.width, room.depth)`, but the counter must fit `planRoomRect`, which insets 0.12 from
  EACH side, so every sized counter is **0.24 m too long**. `Math.round(1.76 * 10) / 10` is 1.8,
  which still overflows.
- **`settleInRect` containment gated at 0.5 m²** (`OBSTACLE_AREA_M2`'s bar) — fixes 5 overhangs;
  the area gate is what keeps dining chairs out of it, and it is still not enough (2 strand).
- **the sweep's viable window can be narrower than its step** — `st-kit`'s clear along-positions
  span 0.08 m (x 2.90-2.98) and neither `w/2` nor a 0.15 m lattice samples it. The wall ENDS do,
  and `hi` IS 2.98. Ordering ends before or after the lattice makes no difference to the
  breakage: their EXISTENCE rebalances placement, not their priority.

**So the prerequisite is a settle that never surrenders** — make invalid-and-unplaceable an
explicit drop, the way `dropOverlaps` already handles a clash, and then these levers can be
judged on their content deltas alone.

Related measurement blind spot: `roomCompleteness.test.ts` asks only whether a fixture EXISTS, so
`tpl-condo-studio/su-kit`'s counter counts as present while floating in the middle of the
kitchen.

## `dropOverlaps` DELETES; a ceiling mount should MOVE (v0.31.9.23)

Every clash in `furnishPlan` was resolved by deleting the later-seeded piece. That is right for
two floor pieces competing for the same floor and wrong for a ceiling light, which has the whole
ceiling to choose from and whose room needs one.

**Three of the corpus's 156 habitable rooms had no light at all**, all kitchens, and only one of
them was recent. `tpl-1bed/ob-kit` is the case that made it visible: v0.31.9.22 finally gave that
kitchen a stove, the `range-hood` moved to hang over it as `applianceWall.test.ts` requires, the
hood's box then covered the room centre where the light sat, and `dropOverlaps` deleted the
light. The other two (`c1-kit`, `su-kit`) had been dark for many releases and nothing measured
it — no ratchet counted lights, and an unlit room looks lit in a screenshot taken at noon.

`relocateCeilingMounts` runs immediately before `dropOverlaps` and nudges a clashing ceiling
light on a nearest-first disc (0.15 m steps to 1.35 m). Two constraints, both inherited from
lessons on this thread rather than invented here:

- **The trial must clear `itemHeightAwareClash`, not a footprint test** — the same predicate
  `findItemOverlaps` uses, because a mount above a counter is not a clash and must not be
  treated as one.
- **The trial's FOOTPRINT must stay in the room**, with the same 0.2 m slack as
  `roomOverhang.test.ts`. This is the release after the one that learned containment cannot be a
  point test, so it is applied at the point it was learned.

The HOOD is never the piece that moves. A hood drawn away from its stove is a hood a contractor
ducts to the wrong place.

A light with nowhere clear still falls through to `dropOverlaps` and is deleted, so no room gains
a light it has no space for. Result: **3 dark rooms -> 0**, +3 `ceiling-light` and **nothing else
in the corpus changed** — no other def, no route, no overlap.

`roomLighting.test.ts` asserts this at ZERO rather than ratcheting a known-offenders list, since
no furnished room has a defensible reason to be dark.

## Room containment is about the FOOTPRINT, not the centre (v0.31.9.22)

Three separate places let a piece stand outside the room it was arranged into, and all three
had been written to test a POINT:

- **`unsealRoutes`' ROOM-CONTAINMENT** (v0.31.9.16) compared `roomAt(trial.cx, trial.cz)` with
  the origin room. That stops the eviction it was written for — a bed slid 2.25 m into the
  living room — and still allows a slide that leaves the piece hanging out through a side.
  Measured: the disc slid `tpl-condo-2bed/c2-bed2`'s `bed-single` by (-0.60, +0.45) to open
  `c2-cbath`, and 0.49 m of a 1.90 m bed ended up over the corridor floor with its centre
  still legally inside the bedroom. It now tests the four corners of the trial OBB inset by
  `CONTAIN_TOL` (0.2, the same slack as the chair-slot guard, because rects sit 0.1-0.2 m
  inside their wall centrelines). Cost: `c2-cbath` stays severed — that route was being bought
  with a bed half in the corridor.
- **`settleInRect` bounds the CENTRE to `rect` inset 0.3** and never asks how big the piece is,
  which is where most of the remaining overhang lives. Guarding it is BUILT (`settleContained`
  + a two-pass `settlePass`) and **deliberately not enabled** — measured at 11 -> 7 overhangs,
  but it strands dining chairs (two of `tpl-hdb-maisonette`'s settle 1.62 m and 4.21 m from
  their table). Nearest-first candidate ordering instead of the NW-first scan does NOT fix
  that; a chair reaching the settle can start OUTSIDE the rect being searched, so "nearest" is
  measured from the wrong place. See the comment on `settleInRect` before re-attempting.
- **`placeFlush`/`snapToWall`'s `edgeShortfall`**, above.

`roomOverhang.test.ts` ratchets what is left: **10 pieces**, worst 0.60 m of
`tpl-condo-penthouse`'s TV console. Its second assertion pins the corpus size, because the
first cut of that measurement read a clean ZERO for the wrong reason — it imported
`GROUND_LEVEL_ID` from `floorplan/types`, where only the TYPE lives, so the value was
`undefined` and the level filter rejected every item on every storey.

## A rect edge is not necessarily a wall (v0.31.8.75)

`snapToWall` used to choose its edge from the piece's SEEDED position, which says nothing about
whether that edge has a wall behind it. `tpl-hdb-3room`'s Service Yard is flush to a wall on its
NORTH edge and has no wall within **0.80 m** on the other three; its washing machine took the
west one. `edgeHasWall` now makes wall-backed edges preferred (a preference, like
`windowed(edge)` — every edge is still tried, so nothing can go unplaced).

Two things had to change with it, and none of the three works alone:

- **`placeSeededMounts` checked door keep-outs but not WINDOW keep-outs.** A piece the arranger
  could not place was rescued straight into a window front, which `placementSoundness` asserts at
  zero tolerance. Pre-existing gap; the edge preference just changed which pieces get stranded.
- **A stranded FLOOR piece used to try only its nearest wall.** So it had to relax the window
  rule whenever that wall carried glass. Every piece now tries all four, and STRICTNESS SITS
  OUTSIDE THE WALL LOOP: all walls window-free first, then all walls allowing a windowed spot.
  Nesting it the other way relaxes on the first wall and never looks at the rest.

The relaxed pass is not optional. A 2 m `shower` in `tpl-hdb-maisonette`'s 1.6 x 1.3 m bathroom
has no window-free wall, and refusing every spot strands it and `dropOverlaps` deletes it. A
blocked door is a safety problem; a blocked window is a quality one that
`windowSightline.test.ts` already ratchets.
