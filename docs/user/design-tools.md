# Budget, checks & report

The **Arrange** and **Tools** menus hold the planning aids that turn a layout into
a plan you can act on; every export and printable document — including the whole
**Budget & costs** group — lives in the **File** menu.

![The shopping list with per-item SGD costs](/screenshots/budget.png)

## Smart Start

**Arrange → Smart Start** (also on the ⌘K command palette and the first‑run
onboarding): pick a style and the whole flat is furnished and the walls and floors
finished in one click, with a matching UI theme. A fast way to a complete starting
point you then tweak. It works on **any floor plan** too — load one of the HDB,
condominium or landed templates (or draw your own) and Smart Start picks a
suitable furniture set for each room and arranges it to that plan's walls.

**Starting state.** At the top of Smart Start, the **Starting state** group starts
you from a real HDB/condo handover instead of a style — pick the one that matches
how you actually receive your home:

- **New BTO — bare.** What HDB hands over **without** the Optional Component Scheme:
  **cement‑screed floors**, **no internal door leaves** (the door openings stay —
  you fit the leaves), **WC/basin pipe provisions only** (no bathroom fittings), and
  **no wardrobes or kitchen cabinets**. The main entrance door and the household
  shelter's blast door are provided. This is what the non‑OCS majority collects.
- **New BTO — with OCS.** HDB's **Optional Component Scheme** handover: vinyl strip
  flooring in the bedrooms, polished porcelain in the living/dining, and the bathroom
  **sanitary fittings** (wall‑mounted basin, shower set and WC). OCS is chosen at flat
  booking and cannot be added later.
- **Resale — as handed over.** The previous owner's finished, furnished home (the
  app's move‑in default). Keeps everything as‑is and records it as the baseline your
  hacking/demolition costs are measured against.
- **Resale — after strip‑out.** The shell after hacking: **bare screed** in the dry
  rooms, **retained wet‑area + kitchen floors** (the waterproofing is kept) and their
  **fittings**, with furniture, wardrobes and internal door leaves stripped out.

You can tweak everything afterwards — these just set an honest starting point.

## Sets, presets & styles

- **Sets** — drop a pre‑arranged vignette (e.g. a lounge grouping) onto the floor,
  including any imported IKEA set recipes.
- **Presets** — apply a full‑flat furnished layout with coordinated finishes.
  The theme gallery covers eight looks popular in Singapore homes: Japandi,
  Scandi Calm, Modern Luxe, Warm Minimalist, Modern Contemporary, Modern
  Industrial, Tropical Biophilic, and Peranakan Accent.
- **Style** — restyle the existing pieces' colours and materials.

## Budget & shopping list

The **Budget / shopping list** (**File → Budget & costs → Budget**, or press
**B**) groups every placed piece by category
and totals an approximate cost in **SGD**, with a **Saved** tab for everything
you've hearted. **Export CSV** downloads the list (category, item,
quantity, unit price, line total) for a spreadsheet or to send to a supplier.

For a buy-list you can share, **File → Shopping list** (also on ⌘K and the
mobile menu's **File** section — available in Simple mode too) opens a polished
one-page document: every placed piece with its room, quantity, unit price and
line total, **grouped by retailer** where known (anything without a retailer is
listed under *Unpriced / generic* with the same indicative estimates as the
Budget panel), with a subtotal per retailer, the grand total, and your budget
target's under/over. Print it, save it as PDF, or send it with your design.

The **File** menu (also ⌘K and the mobile **File** section) has two spreadsheet
exports alongside it: **Furniture list (CSV)** — every placed piece with its room,
dimensions, quantity and prices — and **Room schedule (CSV)** — one row per room
across every storey with its floor area, wall perimeter, floor + wall finish and
ceiling height, plus a grand-total footer. Both open straight in Excel or Google
Sheets.

For a contractor-ready costing, **File → Quote (BOQ)** opens a printable bill of
quantities (FF&E, flooring/painting finishes priced per area, and built-in
carpentry by linear metre, with per-section subtotals + a grand total). **File →
Quote → Excel (.xlsx)** downloads the same bill as a spreadsheet you can edit or
send on.

**Quote template (Pro).** **File → Quote template** customises the quote itself —
your **company branding**, standard **notes**, **GST** and a **markup**, plus which
BOQ sections appear — so the printed bill goes out looking like your own. **Price
rules (Pro)**, in the same dialog, let you **edit the per‑m² finish and carpentry
rates** used to cost the quote and the renovation estimate, so the figures match
your real supply‑and‑install pricing. All of these sit together under the File menu's **Budget & costs**
group, so every cost surface has one entry point.

For a single machine-readable costing file, **File → Cost breakdown (CSV)** (also
on ⌘K and the mobile **File** section) downloads one spreadsheet that combines
your furniture spend (grouped by category, with quantities and subtotals), the
flooring/painting finishes priced per area, and a reconciling **grand total** —
the furniture and renovation subtotals always add up to it.

Spend is shown wherever it helps: each catalog card and the inspector show a
per‑item price (with a **selection total** when you multi‑select), the panel
breaks spend down **by category and by room**, and the per‑room editor caption
shows that room's running cost. Set a **budget target** and an always‑on pill
(bottom‑centre, orbit views) tracks how far under/over you are — green under, red
over — and opens the full list when tapped. The target + over/under also print in
the design report.

## Renovation budget

The **Renovation budget** (**File → Budget & costs → Renovation budget**) answers
a first‑time owner's biggest question — *what will the whole renovation cost, by
trade?* Where the shopping list prices furniture and the finishes estimate covers
flooring + paint, this builds a full Singapore renovation **trade breakdown**
straight from your design's own quantities — nothing to type in:

- **Hacking & demolition** — demolished‑wall length (when you've reshaped a
  starting plan), by linear metre.
- **Masonry & wet works (tiling)** — bathroom + kitchen floor and wall tiling area.
- **Flooring (dry areas)** — the rest of the floors, priced by finish.
- **Carpentry** — linear metres of your placed cabinets, wardrobes and counters.
- **Ceiling & partition works** — floor area of any false‑ceiling treatments.
- **Painting** — dry‑room wall area, net of doors and windows.
- **M&E** — your placed electrical + plumbing points.
- **Air‑conditioning** — one indoor unit per habitable room (from the cooling‑load
  sizing).
- **Glass & aluminium** — shower‑screen / glass‑partition panel area.
- **Plumbing fixtures** — your placed sanitary and kitchen fittings.

Each line shows its **quantity basis** (m² / linear metre / points / units), the
**rate** applied and a **subtotal**, followed by a **contingency** line (~10%) and
the **grand total**. If you've set a budget target it shows how far **under/over**
you are, and an **indicative SG reference band** (4‑room BTO ≈ S$40–60k, resale ≈
S$60–90k) puts the number in context — all clearly labelled an estimate. **Export
CSV** downloads the breakdown as a spreadsheet. Every rate comes from the same
**Price rules** the quote uses, so editing a rate there (**Quote template**, Pro)
re‑prices the renovation budget too.

## Clearance & fit checks

**Checks** validates door‑swing clearance and flags any piece blocking a door,
any two pieces that **overlap** (occupy the same floor space), and any piece
left **inside a wall** (e.g. after the floor plan was edited around it). The
panel shows a Blocking / Overlaps / In‑wall / Walkways / Clear summary and a card per
issue with fix hints; clicking a card selects and frames the offending piece
(both pieces, for an overlap). Stacked items (a mattress on its frame, decor on
a surface), rugs, and wall‑mounted items are never flagged.

**Fix narrow gaps (Pro).** Where the checks flag a **narrow walkway gap** between
two pieces, a **Fix narrow gaps** action nudges the furniture apart to open the
gap back up to a comfortable clearance — the quick fix for the **circulation**
pinch‑points the [Design score](#design-score) marks down.

**Floor loading (Pro).** The Checks panel also carries a **Floor loading**
advisory group. HDB floor slabs are rated for about **150 kg/m²** of imposed
load, so a very heavy item on a small footprint — a filled **bathtub** or
**aquarium**, a **stone/marble‑topped** table, a **piano**, a loaded **bookcase**
— can plausibly exceed that locally. Each flagged piece shows its estimated
weight, footprint and load density with a "**Heavy** — may overload the slab"
badge and a hint to spread the load or check with a PE. A modelled **raised
platform** deeper than **50 mm** is flagged too, with a reminder that a concrete
raise needs a permit and that lightweight **timber‑joist** platforms are the
compliant alternative. The figures are conservative estimates for an advisory
cue, not an engineering calculation.

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

## Cooling load — aircon sizing (Pro)

The **Daylight & ventilation** check panel also carries a **Cooling load**
section: a per‑room aircon **BTU** recommendation, using the Singapore rule of
thumb (~50–60 BTU/ft² of floor area) with the uplifts installers add — **+15%**
for a room whose window faces **west or east** (worst afternoon/morning sun,
read off your plan's North orientation), **+20%** for a **ceiling above 3 m**,
and **+4000 BTU** on a living/dining room that an **open (door‑less) kitchen**
vents its cooking heat into. Each room shows a recommended standard split size
(**9k / 12k / 18k / 24k BTU**) and the raw figure, and the panel totals a
whole‑home installed capacity for a multi‑split system. It's sizing guidance to
take to your aircon installer, not a substitute for a full heat‑load survey.

## Aircon system planner (Pro)

Below the per‑room BTU list, the **Aircon system** section turns the sizing into
the actual purchase decision — which **multi‑split system** to buy and where the
units go. It groups the habitable rooms into outdoor **condensers** the SG way:
the day/common zone (living + dining) on one condenser, the bedrooms + study on
another (so night bedroom cooling runs independently), giving you named
**System‑2 / System‑3 / System‑4** proposals (one condenser + 2/3/4 indoor
fan‑coil units). Each proposed system shows its indoor units, the total
**connected load vs the condenser's nominal capacity** as a percentage + bar
(flagged red if it exceeds the ~130% industry connection‑ratio cap), and a
one‑line **trunking advisory** (pipe route from the AC ledge — confirm with your
installer). A zone with more than four units splits onto a second condenser, and
when two or more condensers land on one ledge the panel checks their combined
weight against the **~110 kg HDB AC‑ledge panel guideline**.

Tap **Plan aircon** to place it: a wall fan‑coil unit high on each served room's
wall (2.25 m) and the outdoor condenser(s) on the **AC ledge** (or service yard /
balcony). Re‑running it updates the placement rather than duplicating, and it's a
single undo step. _(A 3D refrigerant‑trunking route is a documented future
addition — for now the route is an advisory note.)_

## SG renovation rules (Pro)

**Tools → Reno rules** opens a compact **SG renovation rules** reference panel
bundling the smaller HDB/BCA compliance rules homeowners ask about most, each
with a cited source and dated "rules as of 2026":

- **Wet‑area 3‑year tile rule** — don't hack bathroom/wet‑area floor tiles in the
  first 3 years (protect the waterproofing membrane); overlay instead.
- **Windows & grilles** — use a BCA‑approved window contractor, 304‑grade
  stainless rivets, HDB‑approved invisible‑grille designs.
- **Working hours & noise** — general reno Mon–Sat 9–6; noisy/demolition work
  weekdays 9–5 only; not on Sundays/public holidays.
- **Permits & DRC checklist** — engage an HDB‑registered DRC contractor, apply for
  the renovation permit, get a PE endorsement for any structural work.

It's an advisory reference — verify against the current HDB/BCA sources before any
submission.

## Handover & DLP (Pro)

**Tools → Handover & DLP** opens the **move‑in checklist** live in‑app, plus a
**DLP / warranty date tracker**. Enter your **key collection / TOP date** and the
panel computes the concrete deadline dates with a countdown:

- **Defects Liability Period ends** (+1 year) — report all defects before this
  date, and before starting renovation.
- **Ceiling leak / seepage window ends** (+5 years) — HDB's Goodwill Repair
  Assistance for inter‑floor ceiling leaks.
- **Spalling‑concrete window ends** (+10 years) — structural rectification support.

Below the dates is the room‑by‑room move‑in snagging checklist (also included in
the exported **report**). **Tick items off as you check them on collection day** —
the ticks are saved with your design, alongside the key‑collection date.

## Drawings — elevations & lighting plan

**Drawings** (Tools menu) opens a panel with two professional 2D views, toggled
at the top:

- **Elevations** draw each wall "side‑on" — the vertical counterpart to the floor
  plan. Pick a wall to see a scaled, dimensioned drawing: the wall rectangle, its
  windows (pane + mullions) and doors, and the furniture standing against that
  wall as labelled silhouettes at their real positions and heights. It's the view
  kitchen/bath designers and installers use for cabinet, fixture and backsplash
  heights. Every wall‑mounted piece — a wall TV, sconce, wall art, cove light,
  wall cabinet — carries its own mount‑height dimension (e.g. "1100 AFFL", in
  millimetres above the finished floor level), so the contractor knows exactly
  how high to fix it, not just how wide it is; floor‑standing furniture keeps
  only its width dimension. Two mounted pieces close together on the same wall
  automatically fan their height dimensions apart so neither label is obscured.
- **Lighting** plots every light fixture over the walls with its coverage circle —
  a reflected‑ceiling‑style plan showing where the light falls. Below the plan,
  **Estimated light levels** lists each room's estimated average brightness in
  lux next to the recommended range for that room type (e.g. living 100–200 lx,
  kitchen 300–600 lx), with an **OK** / **Low** / **High** chip so you can spot
  under‑ or over‑lit rooms at a glance. Tick **Show light levels on the floor (3D)**
  to paint the estimate straight onto the floor in the 3D view as a colour heatmap
  (blue = dim → green/yellow = comfortable → red = very bright, per the legend).
  It follows the time of day — lamps pool light at night, windows glow by day —
  and updates live as you move lights or change the time. On a multi‑storey plan
  it colours the storeys you're viewing.

Both also appear in the printable **Report**. Works on desktop and as a mobile sheet.

## Measure distance

**Measure distance** (Tools menu) turns on a tape measure: click two points on the floor
and the distance between them appears on an amber ruler line. Click again to
start a fresh measurement; turn the tool off from the same menu. Works on touch
(tap the two points) too.

## Comments (Pro)

**Comments** (Tools menu, or ⌘K → "Comments — pinned notes") opens a panel of
notes pinned to spots in your design — handy for marking decisions ("swap this
rug"), questions for family, or feedback on a design someone shared with you.
Press **+ Add comment**, tap a spot on the floor, and type the note; a numbered
pin appears in the 3D view. Click a pin to read the note and **Resolve** /
**Reopen** or **Delete** it; resolved pins turn green with a ✓ and are struck
through in the list. In the panel, click a comment to jump the camera to its
pin, and use the ✓ / ✎ / bin buttons to resolve, reword or remove it.

On a multi‑storey plan each pin belongs to the storey it was placed on (pins are
placed on whichever level you're viewing) and hides with it when you filter
levels from **View → Levels**; jumping to a comment on another storey switches
the view to that level. Comments **travel with the design**: they're saved in
your layout, included in **Export file** (`.sofa.json`) and carried by **Copy 3D
link**, so whoever opens your design sees your pins. Press **Esc** to put the
placement tool away. *(Live multi‑user presence is not part of this — comments
sync by sharing the design.)*

## History

**History** (Tools menu, or ⌘K → "Edit history") shows a timeline of every edit
you've made — adding a sofa, moving a chair, changing a finish, toggling a door,
editing the floor plan — newest at the top, with the current state marked
**Now**. Click any step to jump straight back (or forward) to that point in one
move, instead of pressing **Undo** repeatedly. The panel also has **Undo** /
**Redo** buttons and **Clear history**. (You can always undo/redo with
**Ctrl/⌘ + Z** and **Ctrl/⌘ + Shift + Z** without opening the panel.)

## Versions, share & report

- **Versions** *(Pro)* — save, restore, and delete named snapshots of your layout,
  each with a thumbnail (deleting asks you to confirm). **Compare in 3D** puts a
  saved version side-by-side with your current design in the live view behind a
  draggable reveal slider, so you can see exactly what changed before you restore.
- **Share & export** — copy a shareable link or export a real **PNG snapshot** of
  the current view. The hero-card section builds a polished, share-ready card in
  one tap — your current 3D view framed with the design's name, an item/area/room
  stat line, and its colour palette — with a **Post · Square · Story** format
  picker so the card fits whichever feed you're sharing to. On a phone/browser
  that supports the OS share sheet (Web Share API), a **Share…** button sits next
  to **Save** — tap it to hand the card straight to WhatsApp/Telegram/Instagram/etc.
  via the native share picker. Where the share sheet isn't supported, only a single
  **Save hero image** button shows, which downloads the PNG instead. **Copy 3D link** makes a compact link (up to ~16 KB) that
  opens an editable copy of your design on any device; **Copy plan link** is the
  uncapped variant. Neither can carry your uploaded 3D models — use **Export
  file** (`.sofa.json`) to share those. *(Experimental: a "Make photoreal"
  option can restyle the snapshot via your own AI key — and once a result
  exists, **Redesign this render** chips (Scandinavian, Japandi, Industrial,
  Luxury, Tropical) regenerate the same view in another style, building a small
  gallery of variants you can click through and download.)*
- **Report** — a printable (save-as-PDF) summary: a hero render, a colour-keyed
  **furnished floor plan** drawn like a real architectural plan — door **swing
  arcs** and window breaks, a category legend — plus **furniture by room**
  (itemized with quantities, prices, and each room's area), a **finish schedule**
  (below), a material palette, a **clearance & fit** check (furniture blocking a doorway,
  overlapping pieces, or anything embedded in a wall), the **design score** (the
  same 0–100 grade + per-category breakdown as the panel), an **accessibility**
  check (doorway clear widths + a 1.5 m wheelchair turning circle per room),
  **wall elevations** (a
  side-on drawing per wall with dimensions, for cabinet/fixture heights), a
  **lighting plan** (every fixture plotted over the walls with its coverage, plus
  a schedule of type/quantity/height/intensity and a per-room **estimated light
  level** table — lux vs the recommended range, statused OK/Low/High), an **FF&E schedule** (the
  item-level procurement table — room, item, source, SKU, size W×D×H, quantity,
  unit + line price, plus Brand/Model/Supplier/URL/Remarks and any custom fields
  you've added to a piece, each shown only once at least one item carries it),
  a **renovation estimate** (indicative flooring + painting
  supply‑and‑install cost per finish, with a combined furniture + finishes
  total), **HDB compliance hints** (non‑binding renovation advisories — likely
  structural walls, wet‑area waterproofing, facade windows; on a multi‑storey
  plan this also flags any **upper storey no staircase reaches**, until you
  place a Staircase whose run lands on that storey's landing — the adjustable
  **Staircase** lives in the catalog's **Others** category in **Pro mode**
  (choose Straight / L‑shaped / U‑shaped / Spiral and set the width, step count,
  riser, tread and handrail)), areas, and your
  design notes — a handoff-ready document. The Report also shows a **renovation
  timeline** — an indicative phase schedule (protection & hacking → … → cleaning
  & handover) estimated from your floor area and room count.
- **Finish schedule** — a contractor-grade material callout table, in both the Report
  and the Drawing set (same table, so the two never disagree): every room's floor,
  wall, and ceiling finish, each with a stable **material code** (`FL-01`, `WL-01`,
  `CL-01` — a new finish always gets the next number, existing codes never renumber)
  and its **area** (floor = room area, wall = perimeter × ceiling height **net of
  that room's doors/windows**, ceiling = the flat footprint — a tray/coffered/
  dropped/sloped ceiling is flagged "verify on site" rather than guessed at). Any
  **accent wall** (a single wall painted a different colour) gets its own callout row
  — which wall, its colour, which room(s) it faces, and its area (`AW-01`…). A
  **totals row per material code** sums every room/wall using it — the quantity a
  contractor prices from. Every number carries the same caveat: **approximate —
  verify on site** before ordering material.
- **Reno timeline (.ics)** — exports that renovation timeline as a calendar file
  you can import into Google / Apple / Outlook Calendar, with one all-day event per
  phase starting today. Find it in **File** (desktop and the mobile sheet) or via
  ⌘K — it shares the Report toggle, so it's available whenever the Report is.
- **Drawing set** — a formal, paginated **plan set** (A4 landscape by default, one
  drawing per sheet with title blocks): cover + sheet index, floor plan, each wall
  elevation, the lighting plan, the finish schedule (above), the FF&E schedule (the
same Brand/Model/Supplier/URL/Remarks + custom-field columns as the Report, with the
URL shown as a shortened link for print), and the door & window schedule (below).
Print or save as PDF for
  builders and permits — the multi-sheet counterpart to the one-page Report. Use the
  **Include sheets** checklist under it to pick exactly which sheets go in — e.g. a
  clean client copy with no electrical/plumbing/demolition, or a full builder copy
  (the floor plan is always included).
  - **Elevation sheets are grouped.** A wall with nothing against it (no furniture,
    no door/window) is dropped entirely rather than printing a bare-wall sheet — the
    sheet index notes how many were omitted. A short wall (under **1.2 m**) with at
    most **one item** and no opening is grouped several-per-sheet in a **2×2 grid**
    ("Minor wall elevations") instead of getting its own page; any wall with
    cabinetry (more than one item) or an opening always keeps its own full sheet.
    The thresholds are noted on the cover's general notes.
  - **Paper size + orientation are yours to choose.** Under **File → Drawing set →
    Title block details**, pick a paper size (A4/A3/A2/A1) and orientation
    (Landscape/Portrait) — e.g. A1 landscape for a site set, A3 portrait for a
    compact carpentry detail. Every sheet's `@page` size and dimensions follow your
    choice, and the locked scale re-picks itself against the new printable area
    (bigger paper → the same plan can print at a finer, more detailed ratio).
  - **Locked, print-true scale.** Every plan/elevation/section sheet auto-picks the
    largest standard architectural ratio (1:20 → 1:200) that fits your chosen paper
    and states it in the title block, e.g. **"Scale 1:50 @ A4 LANDSCAPE"**. Schedules
    and the cover carry **"Scale NTS"** (not to scale). The drawing is sized in real
    millimetres to that ratio — **print at 100% (no "fit to page")** and measure
    directly with a scale rule; the graphic scale bar on plan sheets is a second,
    PDF-viewer-proof check (it still reads correctly even if a viewer rescales the
    page for on-screen display).
  - **Title block.** Each sheet's title block carries the project name + address,
    client, drawn-by, a blank checked-by line, the date, sheet number ("A-3 of 9"),
    revision letter, and the locked scale; plan-view sheets also show a small north
    arrow (matching your set North orientation). Edit the project/client/drawn-by/
    checked-by/revision/paper/orientation fields under **File → Drawing set →
    Title block details**.
  - **General notes.** The cover sheet lists the standard SG handover disclaimers:
    dimensions in mm/m, don't scale from screen, furniture is indicative (build
    from the setting-out plan + elevations), EMA-licensed electrician (LEW) for
    electrical work, PUB-licensed plumber for plumbing, and verify all dimensions
    on site. The renovation-approval line follows your plan's **housing type**
    (set on the template picker / Save-to-library): an **HDB** plan reads written
    HDB permit + PE endorsement for RC elements; a **Condominium** plan reads MCST
    / building-management approval (+ BCA/PE for structural work); a **Landed**
    plan reads BCA-direct approval (with a PE) for structural work — no HDB/MCST
    involved. The demolition/hacking sheet's permit-note block follows the same
    branching.
  - **Demolition/hacking plan — wall classification (Pro).** When walls changed vs. the
  as-loaded baseline, the set includes a **"Demolition & new walls"** sheet: kept walls
  solid, new walls bold, and removed walls dashed **with a diagonal hatch** (the
  drafting "to be removed" convention) instead of just a colour. Give any wall a
  **Structure** tag in its Properties panel — **Unknown / not verified**,
  **Load-bearing**, **RC partition**, **Brick partition** or **Dry partition
  (Ferrolite / steel-stud)** — with an
  inline reminder that this is **user-declared, not verified**: an older HDB block can
  hide a load-bearing beam-and-column wall behind what looks like a partition on plan,
  so confirm against HDB/BCA as-built records (or a PE) before hacking. Select several
  walls at once to set the same tag on all of them from the multi-wall action panel.
  On the sheet: a **load-bearing** wall always draws heavy/solid (with a "Load-bearing
  (heavy line)" legend row); if it's ALSO marked for demolition it escalates to a hard
  **danger** treatment with an inline **"NOT PERMITTED"** label and a matching legend
  row — SG rules make load-bearing demolition absolutely off-limits, not just
  "needs a permit". An **unverified** wall being demolished gets an inline **⚠** marker
  and a "Structure unverified — confirm with HDB/PE before hacking" legend note. The
  sheet also prints a concise SG permit-note block (HDB permit required for any
  demolition, PE endorsement when RC is touched, load-bearing elements off-limits,
  classification is user-declared, weekday-only permitted working hours).
- **Setting-out & datum dimensioning (Pro).** Furniture-plan dimensions are wall-to-
  wall and fine for design intent, but a contractor sets out partitions from ONE
  fixed reference point (a structural corner), not cumulative wall-to-wall chains
  (small errors compound down a chain; a fixed datum doesn't). The **Dimensioned
  plan** sheet adds a **setting-out row**: a red crosshair-and-triangle
  **"SETTING-OUT DATUM"** marker at the plan's structural corner (its min-x/min-z
  external wall corner — the SG-practical default; there's no way to relocate it
  yet), plus two dashed running-dimension rows (above and to the left of the
  auto-dims) giving every wall FACE's distance straight from that datum — not the
  centreline, and not chained wall-to-wall. On the **Floor plan** sheet (when the
  Finishes schedule is also included), a small violet **+** marks each room's tile
  setting-out start point (its centre), with a one-line note explaining the
  convention: **"start laying here, verify joints on site"**.
- **Waterproofing zones (Pro).** The **Dimensioned plan** also hatches every wet /
  hard-service room (bathroom, powder room, kitchen, service yard, balcony) with a
  diagonal **waterproofing** pattern, and the **Tiler** handover pack lists a
  per-room zone table — floor area, wall upturn heights (**300 mm** general, **1800
  mm** at shower walls, taken over the full bathroom perimeter when no shower is
  placed), and the total membrane area a waterproofer prices from. Wet floor rows
  of the finish schedule note **"waterproofing membrane below"**, and the
  Renovation budget gains a **Waterproofing membrane** line (its own editable rate
  in the Quote template).
- **Floor levels & transitions (Pro).** If you set a room's **Floor level (mm)** in
  the plan editor (a bathroom **−50**, a balcony **−50**…), the Dimensioned plan and
  Tiler pack tag it with an **"FFL −50"** marker and draw a **step + transition
  strip** marker at each doorway between rooms at different levels, with a legend. A
  wet room left *level* with an adjacent dry room raises a **kerb/step advisory**
  ("no step/kerb between bath and bedroom — verify hob/kerb with contractor"). This
  is documentation for your tiler — it doesn't move the 3D floor.
- **Door & window schedule.** A typed-marks table (**D1, D2…** for doors, **W1,
  W2…** for windows — every opening of the same kind/width/height **and style/
  material** sharing one mark, so a sliding door and a swing door of the same
  size, or a grille and a plain window, are listed as separate marks) with a
  **Style / material** column (e.g. *Sliding · Wood* for doors, *Grille* for
  windows), quantity, size **W×H in millimetres** (doors/windows are always
  specced in mm, matching the carpentry sheets' own convention regardless of
  your metric/imperial display preference), sill height, door hinge/swing
  side, and which room(s) each mark borders. A door onto the outside reads as
  an entrance — *Kitchen (entry)* when it borders one room, or *External
  (entry)* for a front door opening straight into an un-roomed foyer/circulation
  gap — rather than a bare *Unassigned*. On a **multi-storey** plan a mark
  repeated across floors groups its rooms by storey (*Ground floor: Powder ·
  Upper storey: Bedroom 1, Bedroom 2*) so a high-count mark stays scannable.
  Reuses the same grouping as the Report's *Openings schedule* section, so the
  two never disagree. One whole-set sheet even on a multi-storey plan (it
  already resolves each opening's room across every storey). No openings on the plan → no sheet, and
  the cover's sheet index simply omits it. Toggle it off in the **Include
  sheets** checklist if you don't need it in a given export. Every door/window
  ALSO gets its small rose **mark label** (**D1**/**W1**…) printed right next to
  it on the **Floor plan** sheet, keyed to the exact same grouping as this
  schedule — so you can always trace a mark on plan back to its row here.
- **Reflected ceiling plan (Pro).** A dedicated **"Reflected ceiling plan"**
  sheet (drawing #4 in a professional set) — one per storey — showing, per
  room, its ceiling height off finished floor level (e.g. **"FFL to clg:
  2600mm"**), and, where you've set a **tray/coffered/dropped** treatment in
  the Ceiling panel, the drop height instead (**"FFL to false ceiling:
  2450mm (Tray)"**) plus a dashed inset rectangle (tray/dropped's raised or
  recessed panel) or beam grid (coffered) — the exact same geometry the 3D
  ceiling render builds, so the sheet can never show a treatment your design
  doesn't actually have. A non-rectangular room, or one too shallow for the
  drop, notes "treatment not applied — verify room shape/height on site"
  rather than drawing a treatment that isn't really there. Every ceiling light,
  ceiling fan, and cove light is marked with a symbol + its distance (in mm)
  off the two nearest walls — the standard "how far off that wall" a
  contractor checks a fixture against on install. Aircon points are marked too
  (for cross-reference; their full schedule lives on the Electrical plan).
  Where a dropped/false ceiling zone leaves less than the **2.4 m** finished
  headroom SG homes keep under a false ceiling (2.6 m is the standard slab),
  the zone note escalates to a **"⚠ …mm under 2400mm min headroom"** warning
  (and flags anything under the ~2.1 m cornice minimum); a passing zone just
  prints its remaining clearance. Toggle it off in the **Include sheets**
  checklist if you don't need it.
- **Electrical/plumbing sheet provenance.** Once you've placed points with the
    floor-plan editor's **MEP** tool (see *Electrical & plumbing points* in the
    Floor plan editor guide), the electrical/plumbing sheets note **"Points as
    designed — heights in mm AFFL"** and print your chosen mount height beside
    each symbol (e.g. **"@1200"**), plus a "Heights in mm AFFL" legend line. A plan
    with no authored points yet falls back to the furniture-based estimate, noted
    **"Indicative — derived from the furniture layout; verify on site"**.
- **Socket-count advisory.** The Electrical plan sheet also prints a short
    **socket advisory**: any room under the recommended outlet count for its type
    (Living 8, Kitchen 10, Master bedroom 6, Bedroom 4, Study 6, Dining 4, Bath 2,
    …) is listed as **"Living: 3/8 sockets — under target"**, followed by a
    standing **DB load** note (40 A single-phase is common in older HDB blocks;
    upgrading to 63 A needs SP Group approval). The same **"3/8 sockets"** shortfall
    tag shows live on each under-provisioned room in the floor-plan editor's **MEP**
    layer, so you see the gap while you place points.
- **Carpentry sheets (Pro).** The most-cited gap in a DIY handover is missing
  carpentry detail — exact internal shelf heights, carcass depths, what the
  carpenter actually cuts to. Every **custom-size piece you generate + place**
  (Bookshelf/Wardrobe/Sideboard/Desk/Kitchen run — see *Custom-size furniture*
  above) gets its own **"Carpentry — (item name)"** sheet: a dimensioned
  **front elevation** alongside **one section** cut through a representative
  part of the piece (a shelf bay for a wardrobe, a base cabinet for a kitchen
  run, the pedestal or a leg for a desk), at a finer locked scale than the plan
  sheets since there's more detail to show. Every dimension is in **millimetres**
  (carpentry/joinery is always mm) and is real — overall width/height/depth,
  bay widths, panel thickness, plinth/toe-kick height, worktop thickness, and
  every shelf/rail/drawer height above floor — nothing is invented; a hidden
  shelf/rail behind a closed door draws as a dashed line. The front elevation
  also marks the section cut with a dash-dot **"A" cut-line**, and the section
  itself is titled **"SECTION A-A"** (standard drafting convention). Below the
  two views, a **Materials & finish** note states the piece's finish + tint
  (honestly hedged — "confirm exact board/laminate code with fabricator", never
  an invented brand/laminate code), board and back-panel thickness read straight
  off the piece, and an edge-banding line; a **Hardware** note lists what the
  fabricator needs to order — sliding track + rollers for a sliding wardrobe
  front, hinge counts (2 per door up to 1.2 m tall, 3 above) + handles for
  hinged doors, runner pairs + handles for every drawer bank — every count read
  straight off the piece's own parts, never estimated. An open-shelving piece
  (a bookshelf, or any open bay) instead notes shelf supports "as required by
  fabricator" rather than guessing a fixed-vs-adjustable pin count the app
  doesn't track. Placing the SAME piece more than once doesn't repeat the
  sheet — it gets one sheet noted **"(×3)"** for three placements. No
  custom-size pieces placed → no carpentry sheets, and the cover's sheet index
  simply omits them. Same **"Verify all dimensions on site before fabrication"**
  caveat as the rest of the set. Toggle it off in the **Include sheets**
  checklist if you don't need it in a given export.
- **Sheet callouts** (Pro) — **Tools → Sheet callouts** opens the callout panel.
  Add free-text annotations that appear on a specific sheet when the drawing set
  is exported: type your note (e.g. "GL = 0.00", "Contractor to verify on site"),
  pick the target sheet, enter the position as X%, Y% from the top-left of the
  drawing area, and optionally specify a leader-line tip to point the note at a
  specific detail. Callouts render as a crisp text box with an optional dashed
  leader line; they travel with `.sofa.json` exports and design links, and are
  fully undoable.
- **Trade packs (Pro).** The drawing set above is organised by drawing TYPE (plan,
  elevations, schedules…). When you're ready to hand work to individual trades, a
  **trade pack** re-bundles those same sheets by *recipient*. Under **File → Drawing
  set → Trade packs (per recipient)** (mobile: the **Trade packs** rows in the File
  sheet), each pack opens in its own print window: **Tiler & wet works** (floor plan +
  setting-out + a floors-and-walls finish schedule + wet-area notes + any demolition),
  **Electrician** (electrical plan + reflected ceiling plan + socket advisory + a
  mount-height conventions table + the DB note), **Plumber** (plumbing plan),
  **Carpenter** (the carpentry sheets + wall elevations + a built-in joinery summary),
  **Aircon installer** (the System-2/3/4 proposal with condenser weights + ledge and
  trunking notes, on the floor + electrical plans), **Curtains & blinds vendor** (the
  door & window schedule + a list of your placed curtains/blinds with sizes), and
  **Painter** (a walls-only finish schedule + a paint-area basis). Each pack starts with
  a **cover** naming the recipient, the scope, a contact/issued-to line, and your
  title-block details. **Sheet numbers stay the master set's** (so a pack sheet reads
  e.g. *A-29*, not *A-1*) — deliberately, so a contractor can cross-reference any pack
  sheet against the full set you hold. When something's missing, the pack **says so**
  rather than omitting it silently: e.g. "No switching schematic — link switches to the
  lights they control first (16 lights unlinked)", or, before you've run the aircon
  system planner, "FCU / condenser positions are NOT on the plan yet". Print or save
  each as its own PDF to send to that trade.

## 360° panorama (Pro)

**File → 360° panorama** captures a full look-around panorama from where you're
standing (in walk mode, your exact position; in orbit, the point you're looking
at, at standing height). Drag inside the preview to look around, scroll to
zoom, and **Download PNG** saves the equirectangular image — ready for any
360° viewer or a VR headset app.

The same viewer powers **360° slides** in the saved-views presentation — mark a
saved view *360°* and presenting it captures a panorama live from that spot
(see [Saved views & presentation](/navigating#saved-views-presentation-pro)).

## 360° tour (Pro)

**File → 360° tour** links several panoramas into a walkable tour — capture a
stop in each room and the viewer overlays **clickable hotspots** pointing at
every nearby stop on the same storey; click (or tap) one to jump room to room,
arriving facing the direction you travelled. A stop strip below the viewer
jumps anywhere directly and removes stops.

Add stops three ways: **Add stop here** inside the tour, **Add to tour** in the
360° panorama window, or the ⌘K command *Add 360° tour stop here* — each stop
is taken at the current viewpoint (your position in walk mode; the point you're
looking at in orbit) and is named after the room it's in. Stops are remembered
on this device; the panoramas themselves are captured live when you open the
tour, so they always show the current design.

## Render compare (Pro)

**File → Render compare** (or the ⌘K command *Render compare*) renders the same
camera view with two different **render presets** side-by-side so you can
judge which lighting mood works best for your design.

1. Pick **Preset A** (left) and **Preset B** (right) from the drop-downs at the
   bottom of the modal.
2. Click **Render both** — the capture is near-instant: the app renders A first,
   then B, restoring your lighting settings once both are done.
3. **Drag the divider** left and right to reveal more of A or B. Both halves are
   pixel-aligned — you're comparing the exact same camera angle.
4. Use the **⇄ swap** button to flip A and B (their images swap too).
5. Click **Re-render** any time you change the presets or settings.

On mobile, touch-drag the divider to compare. The feature requires Pro mode.

## Time-of-day compare (Pro)

**File → Time-of-day compare** (or the ⌘K command *Time-of-day compare*) shows
the exact same view at two times of day on a draggable reveal slider — the
same draggable-divider mechanism as *Render compare* above, but comparing
lighting instead of render presets. It's a quick way to check how a room reads in the morning versus
at night, or which rooms catch evening sun.

1. Pick **Time A** and **Time B** from the drop-downs at the bottom of the
   modal — defaults to Midday vs Night, the strongest contrast.
2. Click **Capture compare** — the app jumps to time A, captures the frame,
   then time B, then restores your own time-of-day setting exactly as it was.
3. **Drag the divider** to reveal more of A or B. Only the time of day
   changes between the two frames — your tone mapping, exposure, lights and
   environment stay exactly as you left them, so the comparison is fair.
4. Click **Re-capture** any time you change the two times or your design.

On mobile, touch-drag the divider to compare. The feature requires Pro mode.
