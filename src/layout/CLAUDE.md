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
`furnishPlanItems` calls it after the drop passes: it slides a sealing piece along X or Z in
0.15 m steps up to **2.4 m**, nearest first, and takes the first position that opens the route
without severing anything new. **43 unreachable rooms -> 3, 10 affected templates -> 3, by
moving 12 items and deleting none** (plus one template door re-authored, below).

**The reach was measured, not chosen** (v0.31.8.56): 1.2 m leaves 18 rooms, 1.8 m leaves 11,
2.4 m leaves 10, 3.0 m gains nothing. A bigger ceiling does not mean bigger moves, because
candidates are tried nearest-first — measured at 2.4 the moves are **median 0.45 m, max 1.95 m,
11 of 12 within 1.2 m**, and the one long move is jumbo's COFFEE TABLE, opening 8 rooms. Three things make it safe, and each corresponds to a way an
earlier attempt on this thread failed:

- **It only writes `position`.** Never deletes, never resizes, never rotates. A route bought by
  removing the sofa is not a fix; deletion belongs to the drop passes.
- **It rejects any move that severs a room which was fine.** That is the guard v0.31.8.7's
  clearance objective lacked when it traded one pinch for another.
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
(ratchet of what is LEFT: **3 slivers of 0.6-1.5 m², none of them a whole room**, one with no
single culprit).

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
