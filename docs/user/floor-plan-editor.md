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

- **Walls** — choose interior or exterior thickness, then drag to draw. Endpoints
  snap to the grid, to nearby wall corners, and onto the side of an existing wall
  (a clean T‑junction) — so new walls join up without fiddling. Dragging an
  endpoint clearly past a wall stays free, so you can still extend beyond it.
- **Rooms** — drag a rectangle; its area is computed and added to the total.
- **Doors / windows** — click on a wall to drop one. Select a door to set which
  way it opens: **Hinge** (which jamb it pivots on) and **Swing** (which side of
  the wall the leaf opens toward). The plan redraws the door's swing arc to match,
  and the **Checks** tool keeps that swing arc clear of furniture.
- **Split** — click a wall to cut it into two segments at that point. Any door or
  window on it moves to the matching half.
- **Select tool** — click to select, drag to move a room or a piece of furniture
  (on touch, tap to select first — see *View vs Edit* above).
- **Grid, corner & wall snapping** keep everything aligned — new walls snap to the
  grid, to existing corners, and onto existing walls (cycle the grid size from the
  toolbar).
- **Dims** (header toggle, **off by default**) draws a dimension line — with
  arrowheads spanning the length — on every wall and every door/window width.
  Labels scale with zoom and thin out automatically when zoomed out so the plan
  never turns into a wall of overlapping text.

## Non‑rectangular rooms (L‑shapes & angles)

Rooms don't have to be plain rectangles:

- **Reshape a wall** — select a wall with the **Select** tool and drag the round
  handles at its ends. Walls that share that corner move with it, so the outline
  stays joined. Drag a corner off the grid line and the wall takes an angle —
  use this with **Split** to bend a straight run into an **L**. For exact sizes,
  the inspector has **Length (m)** and **Angle (°)** fields: set a wall to
  precisely 3.2 m, or rotate it to 45°, without nudging the X/Z by hand.
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
  loop (any shape, including L‑shapes), with the matching area.

## Annotations & markup

Beyond walls and rooms you can mark up the plan:

- **Text** — pick the **Text** tool and click to drop a note; type the label.
  Switch back to **Select** to drag it, or edit/delete it in the inspector.
- **Dimension** — pick the **Dimension** tool and drag a line between two points;
  it shows the measured length. Select it to delete.
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

## Levels (storeys)

Designing a maisonette, loft or landed home? The tab strip in the header —
**Ground floor** plus a tab for each storey — picks which level you're editing:

- **＋ Level** adds an empty storey above the highest one and switches to it.
- Every tool (walls, rooms, doors/windows, Split, Auto room) and every inspector
  edit applies to the **active tab's** level only; the area total and room count
  in the header follow it too.
- The **✕** on an upper tab removes that storey (you'll be asked to confirm —
  its rooms, walls and furniture go with it, and undo brings it all back).
- The 3D view stacks your storeys; use **View → Levels** to show all of them or
  isolate one. In [walk mode](/walkthrough-and-sun-study) picking a storey also
  **teleports you onto it**, walking against that storey's own walls and
  furniture.

## Your furniture, top‑down

The editor draws your **placed furniture as footprints**, coloured by category.
Click a footprint to select it (the selection is shared with the 3D view), and
drag it to move — it stays grid‑snapped and collision‑checked just like in 3D.
Leaving the editor frames the selected piece back in 3D.

## Tracing from a photo

Have a real floor‑plan image or a room scan? Trace over it:

1. Click **Reference photo…** (or drag an image onto the canvas).
2. Click **Set scale**, drag a line over a dimension you know, and type its real
   length — the image rescales to match.
3. Adjust **opacity**, then draw walls over the image.
4. *(Experimental, optional)* **AI walls** sends the photo to a vision model
   (your own API key) and drafts the walls for you to correct.

Your reference photo and its calibration are **saved on your device** — close
the editor or reload the app and it's still there when you come back. Remove it
any time with the **✕** next to the photo controls.

## Room finishes

Select a room and the inspector shows **Floor finish** and **Wall finish**
dropdowns — the pick renders immediately in 3D and stays in sync with the
finish picker inside the per‑room editor. **Wall finish** offers **Plaster
(default)** to return a room's walls to the plain shell.

You can also **drag a room's name** on the plan to nudge it clear of furniture or
a tight room — it prints in the new spot on the Report and Drawing set too. The
inspector's **Reset label position** button recentres it.

## Ceiling height & wall colour

With nothing selected, the inspector shows a **Ceiling height** field — raise or
lower it (2.2–4 m) and the whole home's walls and ceiling adjust in 3D.
Bathrooms keep their lower dropped ceiling. The height is saved with your design.

Below it, a **Wall colour** picker repaints every wall of a custom plan (Reset
returns the default warm off‑white). It's saved with the plan too.

## Panning & zoom

The canvas is an open grid that extends in every direction — **scroll** (or
drag the scrollbars) to pan around, and **zoom** with the **− / + buttons** (or
**Ctrl/⌘ + scroll** to zoom around the cursor). The whole plan is **fit to the
screen and centred** when you open the editor. Click the percentage to reset to
100%.

## On a phone: the Tools menu

On a small screen the toolbar fits one row: a **☰ Tools** button, a **tool
dropdown** for picking the drawing tool, and **Done**. Tap **☰ Tools** to open
the **Plan tools** sheet with everything else — the plan name and levels, New /
Reset / templates / Reference photo, the label/dimension/export/zoom controls,
the **Ceiling height** and **Wall colour** defaults, and a **Help → user guide**
link.

## Properties panel

The **Properties** panel starts **minimized** (just its header) so it never
covers the plan — tap the **＋** in its header to expand it, and the **−** to
collapse it again. Selecting a wall, room, door or window keeps it minimized
until you expand it.

## Export the plan as an image

**Export PNG** (in the editor header) downloads the floor plan as a PNG image —
walls, rooms, areas and dimension labels — to share with a client, drop into a
document, or print. (The reference trace photo isn't included; it's just the
clean plan.)

## Templates & saving

Start from a **template** apartment, **Reset to HDB** for the default flat, or
**New** for an empty shell. The **template picker** is a three‑step cascade —
pick a **housing type** (HDB or Condominium), then a **project**, then the
**apartment type** — and choosing a type loads that starter plan. The default
flat is **HDB › Serangoon North Vista › 4‑Room**. It covers the common Singapore
home types — HDB 2‑Room Flexi, 3/4/5‑Room, Executive Apartment, 3Gen and Jumbo,
plus condominium layouts (Studio, 1‑Bedroom, 1+Study, 2‑, 3‑ and 4‑Bedroom,
Penthouse, Loft and a landed Terrace), each grouped under a development name.
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
