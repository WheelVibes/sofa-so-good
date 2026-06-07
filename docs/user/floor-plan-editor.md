# Floor‑plan editor

The 2D top‑down editor lets you reshape the flat itself — walls, rooms, doors,
and windows. Open it from **Arrange → Floor plan**, or press <kbd>P</kbd> to flip
between the 2D plan and the 3D scene at any time.

![The 2D floor-plan editor showing furniture footprints](/screenshots/floor-plan-editor.png)

## Drawing

- **Walls** — choose interior or exterior thickness, then drag to draw. Endpoints
  snap to the grid and to nearby wall corners.
- **Rooms** — drag a rectangle; its area is computed and added to the total.
- **Doors / windows** — click on a wall to drop one. Select a door to set which
  way it opens: **Hinge** (which jamb it pivots on) and **Swing** (which side of
  the wall the leaf opens toward). The plan redraws the door's swing arc to match,
  and the **Checks** tool keeps that swing arc clear of furniture.
- **Split** — click a wall to cut it into two segments at that point. Any door or
  window on it moves to the matching half.
- **Select tool** — click to select, drag to move a room or a piece of furniture.
- **Grid & corner snapping** keep everything aligned (cycle the grid size from the
  toolbar).
- **Dims** (header toggle) labels every wall's length and every door/window's
  width, so the plan reads with full dimensions.

## Non‑rectangular rooms (L‑shapes & angles)

Rooms don't have to be plain rectangles:

- **Reshape a wall** — select a wall with the **Select** tool and drag the round
  handles at its ends. Walls that share that corner move with it, so the outline
  stays joined. Drag a corner off the grid line and the wall takes an angle —
  use this with **Split** to bend a straight run into an **L**.
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

## Ceiling height & wall colour

With nothing selected, the inspector shows a **Ceiling height** field — raise or
lower it (2.2–4 m) and the whole home's walls and ceiling adjust in 3D.
Bathrooms keep their lower dropped ceiling. The height is saved with your design.

Below it, a **Wall colour** picker repaints every wall of a custom plan (Reset
returns the default warm off‑white). It's saved with the plan too.

## Panning & zoom

The canvas is an open grid that extends in every direction — **scroll** (or
drag the scrollbars) to pan around, and **zoom** with the **− / + buttons** (or
**Ctrl/⌘ + scroll** to zoom around the cursor). The plan is centred when you
open the editor. Click the percentage to reset to 100%.

## Export the plan as an image

**Export PNG** (in the editor header) downloads the floor plan as a PNG image —
walls, rooms, areas and dimension labels — to share with a client, drop into a
document, or print. (The reference trace photo isn't included; it's just the
clean plan.)

## Templates & saving

Start from a **template** apartment, **Reset to HDB** for the default flat, or
**New** for an empty shell. Saved plans persist in your browser. A non‑default
plan re‑renders the 3D flat, and furniture placement and walk collisions follow
the new walls.
