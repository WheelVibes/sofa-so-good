# Floor‑plan editor

The 2D top‑down editor lets you reshape the flat itself — walls, rooms, doors,
and windows. Open it from **Arrange → Floor plan**, or press <kbd>P</kbd> to flip
between the 2D plan and the 3D scene at any time.

![The 2D floor-plan editor showing furniture footprints](/screenshots/floor-plan-editor.png)

## Drawing

- **Walls** — choose interior or exterior thickness, then drag to draw. Endpoints
  snap to the grid and to nearby wall corners.
- **Rooms** — drag a rectangle; its area is computed and added to the total.
- **Doors / windows** — click on a wall to drop one.
- **Select tool** — click to select, drag to move a room or a piece of furniture.
- **Grid & corner snapping** keep everything aligned (cycle the grid size from the
  toolbar).

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

## Templates & saving

Start from a **template** apartment, **Reset to HDB** for the default flat, or
**New** for an empty shell. Saved plans persist in your browser. A non‑default
plan re‑renders the 3D flat, and furniture placement and walk collisions follow
the new walls.
