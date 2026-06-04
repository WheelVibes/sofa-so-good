# HDB Sandbox — 3D Interior Designer

An interactive, realistic 3D sandbox of a Singapore HDB 4-room flat for
interior design. Furnish it from a catalog, paint surfaces, light it across
the day, view it as a dollhouse / floor plan / first-person walkthrough, and
export the result — all in the browser.

![The furnished flat](docs/reference/floor-plan.svg)

## Features

- **Accurate HDB 4-room layout** — walls, doors, windows, and room areas
  derived from a measured floor plan; openable doors; a household-shelter
  blast door; and HDB-signature touches like window safety grilles and a
  kitchen backsplash.
- **~75-item furniture catalog** across 15 categories mirroring IKEA's
  departments — beds, seating, tables, storage, kitchen, bathroom, appliances,
  lighting, decor, textiles, outdoor, **electronics**, **kids**, **laundry**,
  and **others** (catch-all) — all parametric (resize / recolour / configure
  form, material, weave, and sheen in the inspector), searchable, with live 3D
  thumbnails.
  Includes an entryway shoe cabinet, floating + leaning mirrors, wall shelves,
  L-shaped sectional, sideboard, bar cart, room divider, baby crib, and potted
  plants in bush / snake-plant / palm forms. Comes furnished out of the box,
  with one-click **Sets** (vignettes), full-flat **Presets**, and a per-room
  **Tidy up** auto-arranger that follows real interior-design clearances.
- **Realistic materials** — procedurally generated PBR finishes (12 floors
  incl. oak/walnut/teak planks, white/grey/charcoal porcelain, marble,
  terrazzo, carpet, concrete; 10 wall paints) plus fabric and wood-grain on
  furniture and a polished-granite worktop. Per-room floor and wall finishes.
  Photoreal CC0 textures/models can also be fetched in-app from Poly Haven /
  ambientCG / Kenney.
- **Time-of-day lighting** — SunCalc-driven sun for your location, ACES tone
  mapping, image-based lighting, shadows, and real fixture lights
  (lamps, pendants, fans, wall sconces, and signature cove LEDs) that switch
  on at night. An **Auto / On / Off** toggle lights windowless rooms in
  daylight or kills fixtures entirely.
- **HDB-estate skyline** — neighbouring blocks ring the flat so windows frame
  a real view; their windows light up warm at night.
- **Three views** — orbit (dollhouse with auto wall-reveal), a one-click
  top-down plan (pair with Measurements for an annotated floor plan), a
  first-person walkthrough, plus a **Turntable** auto-orbit for recording a
  presentation clip.
- **Per-room editor** — an IKEA-planner-style mode that isolates one room to
  plan its furniture (toolbar **View → Edit room: …**; a **← exit button at the
  far left of the toolbar** or **Esc** leaves). It shows just that room's walls + floor + its own furniture,
  with the camera-facing walls hidden so you always see in, supports orbit **and**
  walk, and keeps the full catalog/placement/measurement tools. It's deliberately
  lightweight — locked to the fast Performance renderer with full-resolution
  models, and skips all the time-of-day/sun/shadow machinery.
- **Editing** — drag to place (with optional **snap-to-grid** and alignment
  guides), move, rotate, mirror, multi-select with align/distribute, **group**
  (move/rotate as a unit, click again to edit one piece), lock,
  copy/duplicate, numeric position/rotation, undo/redo, save/load named layouts
  (with thumbnails), and PNG export.
- **Streamlined toolbar** — a compact, scrollable **icon island**: frequent
  actions are one-click icons; related tools tuck into labelled dropdown menus
  (View, Scene, Arrange, Tools, File). Hover any control for its name and
  keyboard shortcut. Scroll the wheel over the island (or click-and-drag it) to
  pan it — the canvas behind never zooms. New view shortcuts: Top view **O**,
  Reset **H**, Tidy **L** (alongside Measurements **M**, Catalog **C**, camera
  **V**, and the editing keys). Layout **presets** and furniture **sets** live in
  the **Arrange** menu; the live **FPS counter** is a toggle in the **Graphics**
  panel.
- **Editable floor plan** — a 2D top-down editor to redraw the apartment shell
  (walls, rooms with live areas, doors/windows) or start from a template; the
  3D flat, finishes, and furniture collision all follow your custom plan, and
  plans save to a named library.
- **Design tools** — a SGD **budget** / shopping list, door-swing **clearance
  checks**, a **sun study** time-lapse, an auto **walkthrough** tour, and a
  printable **design report**.
- **Bring your own models** — import your own `.glb` furniture (categorised,
  searchable, recolourable like the built-ins). An offline pipeline also turns
  scraped IKEA SG products into rich catalog items (colour/finish variants,
  per-component recolouring, real footprints, and the **real product photo** as
  the catalog thumbnail), with automatic **low/medium/high LOD variants** so
  heavy models stay smooth on modest hardware.
- **One-click IKEA catalogue** — the *IKEA Singapore (live scrape)* pack
  (catalog → Packs) downloads models on demand via a local sidecar
  (`npm run scraper-server`): products scrape one-by-one (parallelized), each is
  LOD-optimized the moment it lands, and a per-product progress bar shows the
  run. Categories are auto-detected — no manual tagging — so the whole catalogue
  imports in one click. Local/dev-only — the pack card only appears in a dev
  build; production hides it (importing IKEA model folders still works there).
  IKEA assets are not redistributed.
- **Combine compatible pieces** — drag a mattress onto a bed frame (or select
  the frame and use *Complete with → Place on this*) and it rests snug on the
  frame's actual slatted base (detected from the model's geometry, so a thick
  mattress sits proud above the footboard, as in real life), centred on the
  sleeping area and grouped so the pair moves together. Combining is
  context-aware: dining chairs, stools, and benches arrange **around** a table
  on the floor (not on top), and modular sofa sections snap **edge-to-edge**
  side by side to extend a sofa or form an L-shape.
- **Performance** — four render quality tiers: **Performance / Medium / High /
  Maximum**. **Performance is the default for everyone** — a flat, IKEA-style
  renderer with no real-time shadows, reflections, or post-processing, so the
  scene loads instantly and stays fluid even on laptops/phones without a GPU.
  Medium adds sun shadows + soft reflections; High adds bloom, ambient
  occlusion & antialiasing (lazy-loaded); Maximum maxes everything out for
  strong GPUs. Heavier tiers are opt-in from the Graphics panel; an adaptive
  guard only ever steps *down* to hold 30+ fps, and every setting is overridable
  and persisted. A separate **Asset quality** control (Auto / Low / Medium /
  Original) sets model + texture detail independently of the render effects, so
  you can view full-resolution assets (e.g. IKEA products) on any render tier.
  The offline LOD pass can bake **KTX2 / Basis** GPU-compressed textures
  (`optimize:glb --ktx2`) for a further runtime-memory win. The app also
  **paints its UI instantly** instead of waiting on saved-data restore, so
  there's no blank-screen gap on first load.
- **Loading screen** — an aesthetic overlay (soft warm gradient + a looping
  line-art room that furnishes itself) covers the initial load and masks the
  transitions into walkthrough and the per-room editor, with a contextual
  caption ("Furnishing your flat…", "Entering walkthrough…", "Entering room…").
  It fades quickly on fast loads and respects reduced-motion preferences.
- **One warm design system, four themes** — a domestic, Singapore-rooted
  interface authored in OKLCH: **Clay** (terracotta), **Kampong** (garden
  green), **Porcelain** (teal-jade), and **Estate** (HDB ochre), each in
  light + dark (or **Auto**, following your OS). Switch from the toolbar's
  **Appearance** menu; the whole UI — toolbar, catalog, inspector, nav cluster,
  panels, modals — recolours instantly and your choice persists.
- **Pro-tool interactions** — a **⌘K command palette** (fuzzy search across
  actions, panels, views, and "add furniture"), a **right-click context menu**
  on any placed piece, an **Objects / Layers** view (items grouped by room with
  select / lock / delete), a first-run **onboarding** intro, and a fused
  compass + zoom rail. Responsive down to phones, where floating panels become
  bottom sheets.
- **Production-grade panels** — **Swap with similar** (replace a piece in place
  with same-category alternatives, each tagged with a footprint-fit badge),
  **Clearance & fit checks** (HDB door-swing validation with a summary + fix
  suggestions), **Versions** (save / restore named layout snapshots with
  thumbnails), a **Shopping list + Saved collections** (heart any catalog card),
  and **Share & export** (shareable link + a real PNG snapshot). The **2D
  floor-plan editor** and **upload dialogs** are fully theme-aware in light and
  dark.

## Controls

`drag` orbit · `scroll` zoom · `click` select / open doors · `⌘K` command
palette · `right-click` context menu · `R` rotate · `Del` delete ·
`⌃Z`/`⇧⌃Z` undo/redo · `⌃C`/`⌃V`/`⌃D` copy/paste/duplicate · `C` catalog ·
`M` measurements · `T` cycle time · `O` top view · `H` reset view · `L` tidy ·
`?` help · `V` orbit/walk · in walk: `WASD` move, `E` doors.

## Develop

```bash
npm install
npm run dev          # localhost:5173
npm test             # vitest
npm run build        # typecheck + production build
npm run check        # Biome: format + lint (report only)
npm run check:fix    # Biome: apply safe format + lint fixes
npm run format       # Biome: format-write all files
npm run lint         # Biome: lint only
npm run optimize:glb          # generate low/medium LOD variants (WebP textures)
npm run optimize:glb -- --ktx2 # …with KTX2/Basis GPU-compressed textures (needs `toktx` on PATH)
npm run scraper-server # local sidecar for the IKEA live-scrape pack (dev-only)
```

A **pre-commit hook** (`.githooks/pre-commit`, auto-installed by `npm install`
via the `prepare` script) runs `biome check` on staged files and blocks any
commit with formatting/lint errors. Bypass in a pinch with `git commit
--no-verify`.

Offline asset tooling (an IKEA SG model scraper + GLB analysis) lives under
`python/scripts/` and is not part of the app build. The *IKEA Singapore (live
scrape)* pack drives that scraper through `npm run scraper-server`: start it
alongside `npm run dev`, open the catalog's Packs tab, and click *Scrape IKEA
catalogue* — assets land in (gitignored) `public/assets/ikea/`.

Stack: React + TypeScript, three.js via @react-three/fiber, Zustand, Vite.
See [CLAUDE.md](CLAUDE.md) for architecture and how to add content. All
bundled assets are procedurally generated (CC0-equivalent); imported IKEA
models retain IKEA's licensing and are not redistributed.
