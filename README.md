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
- **Editing** — drag to place (with optional **snap-to-grid** and alignment
  guides), move, rotate, mirror, multi-select with align/distribute, **group**
  (move/rotate as a unit, click again to edit one piece), lock,
  copy/duplicate, numeric position/rotation, undo/redo, save/load named layouts
  (with thumbnails), and PNG export.
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
  per-component recolouring, real footprints), with automatic **low/medium/high
  LOD variants** so heavy models stay smooth on modest hardware.
- **One-click IKEA catalogue** — the *IKEA Singapore (live scrape)* pack
  (catalog → Packs) downloads models on demand via a local sidecar
  (`npm run scraper-server`): products scrape one-by-one (parallelized), each is
  LOD-optimized the moment it lands, and a per-product progress bar shows the
  run. Categories are auto-detected — no manual tagging — so the whole catalogue
  imports in one click. Local/dev-only; IKEA assets are not redistributed.
- **Combine compatible pieces** — drag a mattress onto a bed frame (or select
  the frame and use *Complete with → Place on this*) and it snaps snug onto the
  support surface: the mattress top sits flush with the footboard rail, centred
  on the sleeping area, and the two are grouped so they move and rotate together.
- **Performance** — CPU-first quality tiers with auto-detection, an adaptive
  guard that holds 30+ fps (shedding the shadow pass as a last resort), and a
  Graphics panel exposing every setting (shadows, reflections, post-processing,
  light cap, resolution) — all persisted. Optional GPU realism on the High
  tier (ambient occlusion + bloom) is lazy-loaded so the baseline stays lean.

## Controls

`drag` orbit · `scroll` zoom · `click` select / open doors · `R` rotate ·
`Del` delete · `⌃Z`/`⇧⌃Z` undo/redo · `⌃C`/`⌃V`/`⌃D` copy/paste/duplicate ·
`C` catalog · `M` measurements · `T` cycle time · `V` orbit/walk · in walk:
`WASD` move, `E` doors.

## Develop

```bash
npm install
npm run dev          # localhost:5173
npm test             # vitest
npm run build        # typecheck + production build
npm run optimize:glb # generate low/medium LOD variants for imported GLBs
npm run scraper-server # local sidecar for the IKEA live-scrape pack (dev-only)
```

Offline asset tooling (an IKEA SG model scraper + GLB analysis) lives under
`python/scripts/` and is not part of the app build. The *IKEA Singapore (live
scrape)* pack drives that scraper through `npm run scraper-server`: start it
alongside `npm run dev`, open the catalog's Packs tab, and click *Scrape IKEA
catalogue* — assets land in (gitignored) `public/assets/ikea/`.

Stack: React + TypeScript, three.js via @react-three/fiber, Zustand, Vite.
See [CLAUDE.md](CLAUDE.md) for architecture and how to add content. All
bundled assets are procedurally generated (CC0-equivalent); imported IKEA
models retain IKEA's licensing and are not redistributed.
