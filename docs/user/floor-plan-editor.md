# Floor‑plan editor

The 2D top‑down editor lets you reshape the flat itself — walls, rooms, doors,
and windows. Open it from **Edit → Floor plan editor**, or press <kbd>P</kbd> to flip
between the 2D plan and the 3D scene at any time.

![The 2D floor-plan editor showing furniture footprints](/screenshots/floor-plan-editor.png)

## Moving around — and View vs Edit

- **Zoom** with the mouse wheel or a trackpad pinch — it zooms toward the cursor
  (the ± buttons in the header zoom around the centre). **Pan** by dragging with
  the middle or right mouse button, or with one finger on a touch screen.
- The header has a **View / Edit** toggle:
  - **View** — pan, zoom, and tap to inspect only; a drag never moves anything.
    This is the default on phones/tablets, so a one‑finger pan can't nudge a wall
    or a sofa by accident.
  - **Edit** — reveals the drawing tools and lets you move things. On a touch
    screen you **tap an item to select it first, then drag** it; a drag on
    anything unselected just pans. (With a mouse, drag‑to‑move works directly.)
  - Picking any tool switches you to Edit automatically.

## Drawing

On desktop the toolbar is a single compact row: a **Select** pointer icon, then
**Wall** and **Split** buttons, then three grouped dropdowns — **Room ▾**
(Rectangle / Polygon / Auto room), **Opening ▾** (Door / Window) and **Markup ▾**
(Text / Dimension / Polyline). Picking any tool switches you to Edit.

- **Walls** — choose interior or exterior thickness, then draw. On a computer,
  drag from start to end. On a **phone or tablet**, *tap* to drop the start then
  *tap* to drop the end — each point snaps to the grid and to existing walls, so
  you place exact points instead of guessing a drag under your fingertip. Walls
  **chain**: each new wall continues from the last one's end, so a run goes
  tap‑tap‑tap; tap the last point again (or pick another tool) to stop. A small
  dot marks the start and a ring marks the end so you can see exactly where each
  point lands. Endpoints snap to the grid, to nearby wall corners, and onto the
  side of an existing wall (a clean T‑junction); dragging clearly past a wall
  stays free, so you can still extend beyond it.

  **Precise length and angle** *(Pro, desktop)*: while you are dragging a wall a
  small **numeric entry panel** floats near the cursor. It shows the current
  length and angle live. Type an exact length (metric: `3.5` or `3.5m` or `350cm`;
  imperial: `3' 6"` or `3ft 6in`) and/or an angle in degrees (0 = right, 90 =
  down), then press **Enter** to commit the wall at precisely those values.
  **Tab** moves from Length to Angle; **Escape** cancels the draft. The panel
  disappears once the wall is committed and the next segment starts automatically.
- **Rooms** — drag a rectangle; its area is computed and added to the total. Each
  room shows its name, floor **area**, and wall **perimeter** (prefixed `P`)
  centred inside it — all live, and in metric or imperial to match your unit
  toggle. The figures thin out automatically when a room is too small on screen.
- **Doors / windows** — click on a wall to drop one. Select a door to set which
  way it opens: **Hinge** (which jamb it pivots on) and **Swing** (which side of
  the wall the leaf opens toward). The plan redraws the door's swing arc to match,
  and the **Checks** tool keeps that swing arc clear of furniture.
- **Split** — click a wall to cut it into two segments at that point. Any door or
  window on it moves to the matching half.
- **Select (the pointer icon)** — click to select, drag to move a room or a piece
  of furniture (on touch, tap to select first — see *View vs Edit* above).
- **Grid, corner & wall snapping** keep everything aligned — new walls snap to the
  grid, to existing corners, and onto existing walls (cycle the grid size from the
  toolbar).
- **Labels** (header toggle, **on by default**) shows each room's name, floor
  **area** and wall **perimeter** centred inside it. Turn it off for a clean
  outline‑only plan.
- **Dims** (header toggle, **off by default**) draws a dimension line — with
  arrowheads spanning the length — on every wall and every door/window width.
  Labels scale with zoom and thin out automatically when zoomed out so the plan
  never turns into a wall of overlapping text.
- **Skeleton** (header toggle) draws every wall at one uniform thin stroke,
  ignoring its thickness, so you can clearly see whether wall ends actually
  **meet to close a room** — handy when thick exterior and thin interior walls
  meet at a corner and hide a small gap. Doors and windows stay drawn.
- **Stray flags** *(Pro)* — the editor highlights anything that breaks a whole
  apartment in **red**: a wall joined to no other wall, a room that touches no
  other room, and a door or window that isn't on a wall. The header shows a
  `⚠ N stray` count; connect or delete the flagged items to clear it. *(Hidden
  in Simple mode.)*
- **Un‑roomed areas** — a space that's fully **walled in but has no room assigned**
  is highlighted in **red**, so you can spot an enclosure you forgot to turn into a
  room (drop a room over it, or use **Auto room**, to clear the flag). This is
  distinct from the stray‑element flags above, which mark *disconnected* pieces.

## Inspecting an element

Select a wall, door or window and the **Properties** panel works just like the
furniture inspector — a **Name** field on top, then a grid of quick actions:

- **Name** — give it your own label (e.g. “Front door”). Left blank, it shows a
  generated default like *Wall 123456*. When you create a room around walls
  (Room, Polygon or **Auto room**), their boundary walls **and** the doors /
  windows on them are auto-named *‹room› wall 01*, *‹room› door 01*,
  *‹room› window 01*, … **Renaming the room re-flows those names** to match —
  except any wall/door/window you gave your own name, which **always sticks** and
  is never overwritten.
- **Walls** — *Reverse*, *Split* (cut in two at the midpoint), *Join* (merge a
  collinear neighbour), *Duplicate*, *Lock* and *Delete*, with the exact
  thickness / start / end / length / angle fields underneath. A **Baseboard /
  skirting** section sets this wall's skirting **height** and **colour** (or hides
  it), and a **Wall colour** picker recolours just this one wall (with a *reset*).
- **Doors / windows** — *Flip hinge* and *Flip swing* (doors), *Duplicate*,
  *Lock* and *Delete*, plus the offset / width / sill / head fields. A **Style**
  picker sets a **door** style (**Panelled**, **Flush** or **Glazed**) or a
  **window** style (**Plain glass**, **Safety grille** or **Louvre**), and a colour
  picker sets the door's **Leaf colour** or the window's **Glass tint**.
- **Lock** — a locked wall or opening can still be selected but won't move,
  reshape or delete by accident (its drag handles disappear) — unlock it to edit
  again.
- **Duplicate** — drops an editable copy beside the original (the name and lock
  aren't carried over).

**Right‑click for a quick menu** — right‑clicking a selected wall, opening, room or
furniture footprint opens a context menu of the operations that apply to it (the
browser's own menu is suppressed inside the editor). Right‑clicking with nothing
selected does nothing.

**Select several walls at once** — Shift‑click (or ⌘/Ctrl‑click) walls to add or
remove them from the selection; on a touch screen, turn on the toolbar **Select+**
toggle and tap walls instead. The Properties panel then shows how many are
selected with **Lock all**, **Delete all** (locked walls are kept) and **Clear
selection** — handy for clearing out a whole run of walls in one go.

**Edit a piece of furniture from the plan** — select a furniture footprint and the
Properties panel becomes a furniture editor: rename it, set its exact **X** / **Z**
position and **Angle**, and (for custom‑size pieces) its **Width** and **Depth**.
It also shows the piece's **size (W × D × H)** and offers **Lock**, **Delete** and
**Edit in 3D** (jump straight into the 3D per‑room editor for that piece). No need
to leave the plan to nudge a sofa a few centimetres or square it up to a wall.

**Tidy several pieces at once** — when **two or more** furniture footprints are
selected (marquee‑drag a box over them on empty canvas), a single **bounding box**
wraps the whole group with a **rotation ring** and **corner resize handles** — drag
inside to move them together, grab the ring to rotate the group about its centre,
or pull a corner to scale the whole group uniformly (the same unified handles as the
3D scene). The Properties panel also turns into an action panel: **Align X** /
**Align Z** (line their centres up), **Align edges** (**Left** / **Right** /
**Top** / **Bottom**), **Distribute evenly** (**Across X** / **Across Z** — equal
gaps between a row of pieces) and **Mirror** (flip the whole group left↔right across
its centre). Each action is a single undo step and respects walls and other
furniture; **locked** pieces stay put.

## Non‑rectangular rooms (L‑shapes & angles)

Rooms don't have to be plain rectangles:

- **Reshape a wall** — select a wall with the **Select** tool and drag the round
  handles at its ends. Walls that share that corner move with it, so the outline
  stays joined. As you drag an endpoint it **snaps to clean angles** (15°
  increments — horizontal / vertical / 45°…) off the wall's other end, just like
  drawing a new wall, so a run squares up cleanly; hold **Shift** to drag to a
  free angle. Drag a corner off the grid line and the wall takes an angle —
  use this with **Split** to bend a straight run into an **L**. To **rotate** the
  whole wall, grab the **ring** drawn around it (anywhere on the ring, or its
  knob) and swing it — just like the furniture rotation gizmo. For exact sizes,
  the inspector has **Length (m)** and **Angle (°)** fields: set a wall to
  precisely 3.2 m, or rotate it to 45°, without nudging the X/Z by hand.
- **Curved walls** — drag a straight wall's **midpoint handle** to bow it into a
  **curve** (drag it back to the line to straighten it again). Curved walls can't
  carry doors or windows.
- **Sloping walls** — give a wall a **sloped (shed / mono‑pitch) top** from its
  inspector: set a different **top height at each end** for a raked ceiling, then
  **Reset to flat top** to undo it. A sloped wall carries no openings.
- **L‑shaped rooms** — with a room selected, click **Make L‑shaped** to add a
  second rectangle (the “extension”), then set its offset and size. The room's
  **area updates to include the extension**, and the 3D flat renders both parts.
  **Remove extension** turns it back into a plain rectangle.
- **Free‑form rooms** — pick the **Polygon** tool and click to drop each corner;
  click the first corner again (or press <kbd>Enter</kbd>) to close the shape
  (<kbd>Esc</kbd> cancels). The room can be any polygon — its **area is computed
  from the true outline** (not a bounding box) and the 3D floor is shaped to
  match.
- **Auto room from walls** — already drew the walls? Pick **Auto room** and click
  inside any wall‑enclosed area; the room is created automatically from that
  loop (any shape, including L‑shapes), with the matching area. Doors and windows
  are part of their wall, so a wall with openings still encloses the room. If you
  click inside an area that's **already a room**, Auto room leaves it alone (it
  won't stack a duplicate) and tells you so.
- **Inset / grow the outline** — with a room selected, use **Inset −0.1 m** to
  pull the whole outline inward (e.g. a dropped soffit or set‑down) or **Grow
  +0.1 m** to push it outward (e.g. a setback). Every edge moves by the same
  distance and the corners are re‑mitred, so a rectangle, L‑shape or free‑form
  room all offset cleanly. Tap again to step further. If an inset would collapse
  the room (bigger than its narrowest width), it's refused with a message rather
  than producing a broken shape. The same actions are in the command palette
  (<kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd>) as **Inset room** / **Grow room**.
  *(Pro mode.)*

## Annotations & markup

Beyond walls and rooms you can mark up the plan:

- **Text** — pick the **Text** tool and click to drop a note; type the label.
  Switch back to **Select** to drag it, or edit/delete it in the inspector.
- **Dimension** — pick the **Dimension** tool and drag a line between two points;
  it shows the measured length. Select it to **edit or delete** it: drag either
  endpoint handle to re‑span it, or use the inspector's **Length** field (moves
  endpoint B along the line) and the exact **A** / **B** endpoint coordinates, then
  **Delete** to remove it.
- **Polyline** *(Pro)* — pick the **Polyline** tool and click to drop each point.
  Press <kbd>Enter</kbd> to finish an **open** path, or click the first point
  again (after three points) to **close** it into a loop; <kbd>Esc</kbd> cancels.
  With it selected, the inspector shows its length (or perimeter) and toggles for
  a **closed loop**, a **dashed** stroke, and an **end arrow** (open paths) — handy
  for sketching zones, routes or callouts. *(Pro tools are hidden in Simple mode —
  switch to Pro from the mode toggle to use them.)*

All three are saved with your design and are tagged to the storey you drew them on.
Your **text notes** also print onto the floor-plan sheet of the **Report** and the
**Drawing set**, so on-plan callouts reach the documents you hand to a builder.

## Electrical & plumbing points *(Pro)*

For a contractor-ready plan, place the exact **electrical and plumbing points**
you want wired/plumbed, instead of relying on the furniture-based estimate on
the exported sheets:

- Open the **MEP** tool group in the toolbar (desktop: a dropdown next to
  Markup; on a phone: the **MEP** section of the Plan-tools menu). Pick a kind
  under **Electrical** (Socket, Double socket, Switch, Data point, TV point,
  Aircon point, Water heater) or **Plumbing** (Water point, Drainage, Floor
  trap, Soil pipe, Water heater) — this arms the tool with that kind.
- Click on the plan to place a point. A click near a wall **snaps onto that
  wall's face** (so a socket/switch reads as mounted ON the wall it serves);
  elsewhere it drops at the click. The tool stays armed, so you can place
  several of the same kind in a row.
- Switch to **Select** to click a point (selecting it) and drag to reposition
  it. The inspector shows its **Kind** (swap it within its own family — an
  electrical point can't become a plumbing one), its **Mount height (mm
  AFFL)** — above finished floor level, with standard-height quick-pick chips
  for electrical points (300 / 1050 / 1200 / 2400 mm) — an optional **Label**
  (e.g. "fridge", "WC"), and **Delete**.
- The **MEP** toggle in the **View ▾** menu shows/hides the points layer
  (shown by default); <kbd>Delete</kbd>/<kbd>Backspace</kbd> removes the
  selected point.
- Don't want to place every point by hand? **Plan ▾ → Suggest MEP points**
  (also in the phone Plan-tools sheet) looks at your placed furniture and
  doors and adds a starting layout — a socket by every appliance, a switch
  just inside each door, a soil pipe + water point at the WC, and so on —
  then tells you how many electrical + plumbing points it added. Run it again
  any time you add more furniture; it skips anything it's already suggested.
  Drag any point afterwards to fine-tune its exact position.

*(Pro tools are hidden in Simple mode — switch to Pro from the mode toggle to
use them. The exported Electrical/Plumbing plan sheets now use the points you
place here once you've authored any — printing your chosen mount height
beside each symbol as an "@1200"-style suffix, with a plan that has none yet
falling back to the furniture-based estimate, marked "indicative".)*

## Levels (storeys)

Designing a maisonette, loft or landed home? The **floor dropdown** at the
**bottom‑left of the canvas** (it shows the current floor's name, e.g.
*Ground floor ▾*) picks which level you're editing. It opens **upward** and lists
every storey **topmost floor first**, like a shopping‑mall directory or a lift
panel:

- **Add floor (above top)** adds an empty storey above the highest one and
  switches to it; **Duplicate current floor** copies the active one.
- Click a floor's name to switch to it. Every tool (walls, rooms, doors/windows,
  Split, Auto room) and every inspector edit applies to the **active** level only;
  the area total and room count in the header follow it too.
- Each row has inline controls: **rename** (✎), **reorder** up/down (▲▼ — upper
  storeys only; Ground stays the base) and **remove** (🗑, upper storeys only —
  you'll be asked to confirm; its rooms, walls and furniture go with it, and undo
  brings it all back).
- The 3D view stacks your storeys; use **View → Levels** to show all of them or
  isolate one. In [walk mode](/walkthrough-and-sun-study) picking a storey also
  **teleports you onto it**, walking against that storey's own walls and
  furniture.

## Your furniture, top‑down

The editor draws your **placed furniture as footprints**, coloured by category.
Click a footprint to select it (the selection is shared with the 3D view), and
drag it to move — it stays grid‑snapped and collision‑checked just like in 3D.
A selected piece also gets a **rotate handle**: a ring around the footprint with a
knob pointing the way it faces. Drag the ring (or knob) to spin it — it snaps to
15° steps, and you can hold **Shift** for a free angle, exactly like the wall and
3D furniture rotation. Leaving the editor frames the selected piece back in 3D.

## Adding furniture from the plan *(Pro)*

You don't have to leave the plan to add a new piece. In **Pro** mode, the
**Furnish** button in the header (next to the drawing tools) opens the same
catalog you use in 3D — docked to the left of the plan on desktop, or as a
bottom sheet on your phone:

1. Click **Furnish** to open the catalog, then click a card to arm it — a
   footprint‑shaped **ghost** appears and follows your cursor, tinted **green**
   where it fits and **red** where it would overlap a wall or another piece.
2. Press <kbd>R</kbd> to rotate the ghost before you drop it (hold **Shift** for
   a fine 15° step, otherwise it turns in quarter‑turns).
3. Click anywhere the ghost is green to drop it — furniture footprints switch on
   automatically so you can see (and keep working with) what you just placed,
   and the new piece is selected in the Properties panel just like a 3D drop.
   A red spot swallows the click (nothing is placed) so you can keep aiming.
4. **Escape** or right‑click cancels the armed piece without placing it.

**On your phone** the same flow is one-handed: tap **Furnish**, tap a card —
the catalog sheet closes itself so the plan is visible — then tap the plan
where you want the piece. A **Place item?** ✓/✗ bar confirms the drop (exactly
like placing in 3D on mobile); cancelling brings the catalog back. You can also
**press-and-hold** a card and drag your finger straight onto the plan, ghost in
tow, and lift to place.

**Curtains and roller blinds** snap onto windows here too: arm one and the
ghost jumps to the window nearest your cursor, sized to fit it; click (or tap)
to hang it there, facing the side of the wall you clicked from. If the storey
you're editing has no windows you'll get a message instead — window grilles
remain a window *style* (set on the window itself), not a placeable piece.

## Tracing from a photo *(Pro)*

Have a real floor‑plan image or a room scan? Trace over it:

1. Click **Reference photo…** in the **Plan** menu (or drag an image onto the
   canvas). Images up to **25 MB** (PNG/JPG/WebP) are accepted. The image loads
   **centered on your plan and sized to fit** as a translucent ghost stencil —
   it floats above the room fills but under your walls, doors and dimensions,
   so everything you draw stays crisp on top.
2. Click **Set scale**, drag a line over a dimension you know, and type its real
   length — the image rescales to match, anchored on the line you drew so the
   wall you measured stays put.
3. Adjust **Trace opacity** (5–100%), then draw walls over the image. **Center**
   re‑centres the image on your plan at any time.
4. *(Experimental, optional)* **AI walls** sends the photo to a vision model
   (your own API key) and drafts the walls for you to correct. The same pass also
   proposes **doors and windows** on the recognized walls, and — if the model can
   read a dimension off the drawing — **calibrates the trace scale** for you
   (your own **Set scale** calibration is never overwritten).

Your reference photo and its calibration are **saved on your device** — close
the editor or reload the app and it's still there when you come back. Remove it
any time with the **✕** next to the photo controls. The trace image is never
included in exported plan PNGs, and the whole feature is Pro‑mode only (flip
the Simple/Pro toggle in Appearance).

## Scale the whole plan *(Pro)*

Traced or imported a plan at the wrong scale, or want to resize it to a known
dimension? Open **Scale plan…** (in the **Plan** menu on desktop, or the **Tools**
sheet on a phone) to rescale everything in one undoable step:

- **By factor** — type a multiplier (2 = double, 0.5 = half). Every wall, room,
  door and window grows or shrinks together.
- **To a length** — pick a reference wall and type its real length; the whole plan
  scales so that wall measures exactly what you typed.

Furniture is **repositioned** to match the new layout but **keeps its real size**
by default, so standard pieces stay standard. Tick **Also resize furniture** to
scale the furniture too — useful when the entire design was drawn at the wrong
scale. The dialog previews the new total floor area before you commit, and one
**Undo** reverts the whole rescale.

## Snap the plan to a grid *(Pro)*

Traced walls rarely land on tidy round numbers. In **Pro** mode the **Plan ▾**
menu has a **Snap to grid** action that rounds every wall, room, opening and
annotation to the current grid in one undoable step, so a hand‑traced plan
cleans up to neat measurements without re‑drawing it. Doors and windows are
nudged to stay on their walls; change the grid size first if you want a coarser
or finer round‑off.

## Room name & label position

Floor and wall **finishes** are set in the **per‑room (3D) editor**, not here — the
floor‑plan editor is for the shell (walls, rooms, openings) and layout, so the room
inspector keeps you focused on shape and naming.

You can **drag a room's name** on the plan to nudge it clear of furniture or a tight
room — it prints in the new spot on the Report and Drawing set too. The inspector's
**Reset label position** button recentres it.

**Duplicate room** — at the bottom of a selected room's inspector, **Duplicate
room** drops a complete copy beside the original: its shape (rectangle, L‑shape
or free‑form polygon), its floor and wall finishes, and its own boundary walls
all come along, offset slightly so the copy is easy to grab. The copy stays on
the same level, gets a *‹room› copy* name, and one **Undo** removes it cleanly.

## Ceiling height & wall colour

With nothing selected, the inspector shows a **Ceiling height** field — raise or
lower it (2.2–4 m) and the whole home's walls and ceiling adjust in 3D.
Bathrooms keep their lower dropped ceiling. The height is saved with your design.

Below it, a **Wall colour** picker repaints every wall of a custom plan (Reset
returns the default warm off‑white). It's saved with the plan too.

## Panning & zoom

The canvas is an open grid that extends in every direction — **scroll** (or
drag the scrollbars) to pan around, and **zoom** with the **− / + buttons** (or
**Ctrl/⌘ + scroll** to zoom around the cursor). On a touch screen, **pinch with
two fingers** to zoom in and out around the pinch point. The whole plan is **fit
to the screen and centred** when you open the editor. Click the percentage to
reset to 100%.

Tapping the **empty canvas** with the **Select** tool clears the current
selection, and opening or closing the editor starts with nothing selected.

A **compass** and a **dynamic scale bar** sit at the **bottom‑right of the canvas**,
on both desktop and mobile. The scale bar's length and label update live as you
zoom, so you always have a real‑world reference for the current view. On a phone the
expanded Properties panel may cover them.

## On a phone: the Plan tools menu

On a small screen the toolbar fits one row: **View / Edit**, a **☰ menu**
button (the same hamburger icon as the main app's mobile menu), a **tool
button** (shows the current tool, e.g. *Wall ▾*) that opens a grid of all the
drawing tools to tap, **undo / redo** (↶ ↷), and **Done**. Tap the **☰ menu**
to open the **Plan tools** sheet — the same icon-rail sheet as the main mobile
menu: tap an icon on the left rail to show that section's controls. The
sections are **Plan** (name, templates, New / Reset / Reference photo),
**View** (labels, dimensions, furniture, all-levels, Export PNG, grid, zoom),
**Edit** (wall thickness and multi-select, when you're using those), and
**Defaults** (Ceiling height, Wall colour, area total, plus a **Help → user
guide** link). Swipe up on the grab pill, tap outside, or press Escape to
close it.

## Properties panel

On **desktop** the **Properties** panel opens **expanded** when you select
something, so a wall, room, door or window's fields are right there. On a **phone**
it starts **minimized** (just its header) so it never covers the plan, and each new
selection re‑minimizes it. Either way you can **tap the title bar** to expand or
collapse it (the **＋ / −** button does the same). While it's minimized, a selected
**wall, door or window** shows quick **lock** and **delete** icons right in the
title bar, so you can lock or remove it without expanding the panel.

## Export the plan as an image

**Export PNG** (under the header's **View ▾** menu on desktop, or the **☰ menu**'s
**View** section on a phone) downloads the floor plan as a PNG image — walls, rooms, areas and
dimension labels — to share with a client, drop into a document, or print. (The
reference trace photo isn't included; it's just the clean plan.)

## Templates & saving

Start from a **template** apartment, or use the header's **Plan ▾** menu to
**Reset to HDB** for the default flat or start **New** with an empty shell. The
**template picker** is a three‑step cascade —
pick a **housing type** (HDB or Condominium), then a **project**, then the
**apartment type** — and choosing a type loads that starter plan. The default
flat is **HDB › Serangoon North Vista › 4‑Room**. It covers the common Singapore
home types — HDB 2‑Room Flexi, 3/4/5‑Room, Executive Apartment, 3Gen and Jumbo,
plus condominium layouts (Studio, 1‑Bedroom, 1+Study, 2‑, 3‑ and 4‑Bedroom,
Penthouse, Loft and a landed Terrace), each grouped under a development name.
The **Plan ▾** menu also has **Mirror plan**, which flips the *whole* plan —
walls, rooms, doors and windows, and all the furniture — left‑to‑right about its
centre, handy for a mirror‑image HDB stack or a paired condo unit. Door swing
directions flip to match, and it's a single undo away. (This is a **Pro** tool,
so switch to **Pro** mode to see it.)

In **Pro** mode the **Plan ▾** menu also offers a few drafting aids:

- **+ V guide / + H guide** drop a **ruler guide** — a dashed reference line at
  the cursor that walls, rooms and furniture snap to as you draw or drag, so you
  can line elements up precisely. Click a guide to remove it, or **Clear guides**
  to remove them all.
- **Chain dims** drops a row of **chained dimension strings** along the plan's
  bottom and left edges — one segment per wall position — for a quick overall
  measured drawing.
- With **two connected walls selected**, **Round corner** / **Bevel corner**
  rounds or chamfers the corner where they meet (a curved or straight connecting
  wall is inserted). One undo away.

When you **Save** a plan to your library you're prompted for its housing type,
project and apartment type, so your own apartments are categorised like the
built‑ins. Three templates are genuinely
**two‑storey** (see [Levels](#levels-storeys)): the **HDB Executive Maisonette**
(living/kitchen down, three bedrooms + two baths up), the **Terrace House**
(landed, bedrooms upstairs) and the **Open Loft** (sleeping mezzanine) — each
keeps a stair hall below and a matching landing above, ready for a staircase
from the catalog. Saved plans persist in your browser. A non‑default plan
re‑renders the 3D flat, and furniture placement and walk collisions follow the
new walls.
