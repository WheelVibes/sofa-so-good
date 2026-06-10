# Budget, checks & report

The **Arrange** and **Tools** menus hold the planning aids that turn a layout into
a plan you can act on.

![The shopping list with per-item SGD costs](/screenshots/budget.png)

## Smart Start

**Arrange → Smart Start** (also on the ⌘K command palette and the first‑run
onboarding): pick a style and the whole flat is furnished and the walls and floors
finished in one click, with a matching UI theme. A fast way to a complete starting
point you then tweak. It works on **any floor plan** too — load one of the HDB,
condominium or landed templates (or draw your own) and Smart Start picks a
suitable furniture set for each room and arranges it to that plan's walls.

## Sets, presets & styles

- **Sets** — drop a pre‑arranged vignette (e.g. a lounge grouping) onto the floor,
  including any imported IKEA set recipes.
- **Presets** — apply a full‑flat furnished layout (Scandi Calm, Japandi,
  Coastal, …) with coordinated finishes.
- **Style** — restyle the existing pieces' colours and materials.

## Budget & shopping list

The **Budget / shopping list** (Tools menu) groups every placed piece by category
and totals an approximate cost in **SGD**, with a **Saved collections** tab for
everything you've hearted. **Export CSV** downloads the list (category, item,
quantity, unit price, line total) for a spreadsheet or to send to a supplier.

Spend is shown wherever it helps: each catalog card and the inspector show a
per‑item price (with a **selection total** when you multi‑select), the panel
breaks spend down **by category and by room**, and the per‑room editor caption
shows that room's running cost. Set a **budget target** and an always‑on pill
(bottom‑centre, orbit views) tracks how far under/over you are — green under, red
over — and opens the full list when tapped. The target + over/under also print in
the design report.

## Clearance & fit checks

**Checks** validates door‑swing clearance and flags any piece blocking a door,
any two pieces that **overlap** (occupy the same floor space), and any piece
left **inside a wall** (e.g. after the floor plan was edited around it). The
panel shows a Blocking / Overlapping / In‑wall / Clear summary and a card per
issue with fix hints; clicking a card selects and frames the offending piece
(both pieces, for an overlap). Stacked items (a mattress on its frame, decor on
a surface), rugs, and wall‑mounted items are never flagged.

## Design score

**Design score** (Tools → *Design score*, or ⌘K) rates the whole design out of
100 with a letter grade and a breakdown across five areas: **clearance & fit**
(overlaps, blocked doors, pieces in walls), **furnishing balance** (whether each
room is comfortably filled — neither sparse nor crowded), **circulation**
(walkway pinch‑points), **daylight & airflow** (window glazing per room), and
**lighting coverage** (rooms with a light fixture). Each area shows a bar plus
plain‑language suggestions for what to improve, so the score doubles as a
to‑do list for a better layout.

## Accessibility

**Accessibility** (Tools → *Accessibility*, or ⌘K) is a universal‑design check
on the floor plan, in the spirit of the BCA Code on Accessibility: every doorway
is checked for an accessible **clear width** (≥ 85 cm), and every habitable room
for whether it fits a **1.5 m wheelchair turning circle**. You get a Doorways /
Turning‑space pass count and a row per door and room, with what to widen — handy
for aging‑in‑place and barrier‑free designs. It works on a bare shell (no
furniture needed).

## Drawings — elevations & lighting plan

**Drawings** (Tools menu) opens a panel with two professional 2D views, toggled
at the top:

- **Elevations** draw each wall "side‑on" — the vertical counterpart to the floor
  plan. Pick a wall to see a scaled, dimensioned drawing: the wall rectangle, its
  windows (pane + mullions) and doors, and the furniture standing against that
  wall as labelled silhouettes at their real positions and heights. It's the view
  kitchen/bath designers and installers use for cabinet, fixture and backsplash
  heights.
- **Lighting** plots every light fixture over the walls with its coverage circle —
  a reflected‑ceiling‑style plan showing where the light falls.

Both also appear in the printable **Report**. Works on desktop and as a mobile sheet.

## Measure

**Measure** (Tools menu) turns on a tape measure: click two points on the floor
and the distance between them appears on an amber ruler line. Click again to
start a fresh measurement; turn the tool off from the same menu. Works on touch
(tap the two points) too.

## History

**History** (Tools menu, or ⌘K → "Edit history") shows a timeline of every edit
you've made — adding a sofa, moving a chair, changing a finish, toggling a door,
editing the floor plan — newest at the top, with the current state marked
**Now**. Click any step to jump straight back (or forward) to that point in one
move, instead of pressing **Undo** repeatedly. The panel also has **Undo** /
**Redo** buttons and **Clear history**. (You can always undo/redo with
**Ctrl/⌘ + Z** and **Ctrl/⌘ + Shift + Z** without opening the panel.)

## Versions, share & report

- **Versions** — save, restore, and delete named snapshots of your layout, each
  with a thumbnail.
- **Share & export** — copy a shareable link or export a real **PNG snapshot** of
  the current view. *(Experimental: a "Make photoreal" option can restyle the
  snapshot via your own AI key.)*
- **Report** — a printable (save-as-PDF) summary: a hero render, a colour-keyed
  **furnished floor plan** drawn like a real architectural plan — door **swing
  arcs** and window breaks, a category legend — plus **furniture by room**
  (itemized with quantities, prices, and each room's area), finishes per room, a
  material palette, a **clearance & fit** check (furniture blocking a doorway,
  overlapping pieces, or anything embedded in a wall), the **design score** (the
  same 0–100 grade + per-category breakdown as the panel), an **accessibility**
  check (doorway clear widths + a 1.5 m wheelchair turning circle per room),
  **wall elevations** (a
  side-on drawing per wall with dimensions, for cabinet/fixture heights), a
  **lighting plan** (every fixture plotted over the walls with its coverage, plus
  a schedule of type/quantity/height/intensity), an **FF&E schedule** (the
  item-level procurement table — room, item, source, SKU, size W×D×H, quantity,
  unit + line price), a **renovation estimate** (indicative flooring + painting
  supply‑and‑install cost per finish, with a combined furniture + finishes
  total), areas, and your design notes — a handoff-ready document.
- **Drawing set** — a formal, paginated **plan set** (A4 landscape, one drawing per
  sheet with title blocks): cover + sheet index, floor plan, each wall elevation,
  the lighting plan, and the FF&E schedule. Print or save as PDF for builders and
  permits — the multi-sheet counterpart to the one-page Report.

## 360° panorama (Pro)

**File → 360° panorama** captures a full look-around panorama from where you're
standing (in walk mode, your exact position; in orbit, the point you're looking
at, at standing height). Drag inside the preview to look around, scroll to
zoom, and **Download PNG** saves the equirectangular image — ready for any
360° viewer or a VR headset app.
