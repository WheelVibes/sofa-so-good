# Exporting your design

Beyond sharing a link or a PDF report, you can take your design out of the app as a
**3D model**, a **CAD plan**, an **augmented‑reality** preview, or a **moodboard**.
These all live in the **File** menu (and most have a command‑palette entry under
<kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd>).

> For a shareable link, a PNG snapshot, the printable **Report**, the **Drawing
> set**, budgets and CSV schedules, see [Budget, checks &
> report](/design-tools).

## Export a 3D model

From **File → CAD, 3D & data**, export the **whole furnished scene** to open it in
Blender, an AR viewer, Coohom or another 3D tool:

- **Export 3D model (.glb)** — the complete furnished scene (also from the command
  palette as *Export 3D model (GLB)*).
- **Export 3D model (.obj)** — geometry‑only Wavefront OBJ.
- **Export 3D model (.stl)** — geometry‑only STL for 3D printing or CAD.
- **Export for AR (.usdz)** — a USDZ package for iOS AR Quick Look.

*(These sit in the default experience — available in Simple and Pro.)*

## View in your room (AR)

**File → CAD, 3D & data → View in your room (AR)** places the design in your real
room: on a supported iPhone or iPad it opens **iOS AR Quick Look**, and elsewhere it
hands you an **AR‑ready GLB** to open in your device's AR viewer. *(Pro mode —
switch to Pro from the mode toggle; it's hidden in Simple.)*

## Export the 2D plan (DXF / SVG)

From **File → CAD, 3D & data** (or the command palette), send your floor plan to a
drafting tool:

- **Export DXF (CAD)** — a 2D DXF for AutoCAD or a contractor/fabricator hand‑off. Beyond the
  walls, rooms, doors/windows and room labels, it also carries your **placed furniture**
  (footprint + name label, on its own layer), the **auto-dimension lines** for every wall and
  room, a **D1/W1…-style mark** beside each door/window that lines up with the door/window
  schedule, and any **electrical/plumbing points you've placed** on the plan (a circle + symbol
  per point, with its mount height when set), and — if you've edited walls since the plan was
  loaded — a **DEMOLITION layer** marking every removed wall "(DEMOLISH)" (escalated to a
  load-bearing warning where relevant) so a hacking contractor never loses kept-vs-removed —
  a genuinely editable, fully-annotated CAD file, not just an outline.
- **Export SVG (plan)** — a vector 2D plan for any editor or for print (command
  palette: *Export 2D plan to SVG*).

*(Pro mode — hidden in Simple.)*

## Moodboard

**File → Share & document → Moodboard** builds a shareable **style board** — your
apartment **palette**, the **finishes** you've used, and the **pieces** in the
design, laid out as a single page you can save or send. *(Pro mode — hidden in
Simple.)*
