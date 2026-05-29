# HDB Sandbox — 3D Interior Designer

An interactive, realistic 3D sandbox of a Singapore HDB 4-room flat for
interior design. Furnish it from a catalog, paint surfaces, light it across
the day, view it as a dollhouse / floor plan / first-person walkthrough, and
export the result — all in the browser.

![The furnished flat](docs/reference/floor-plan.svg)

## Features

- **Accurate HDB 4-room layout** — walls, doors, windows, and room areas
  derived from a measured floor plan; openable doors; a household-shelter
  blast door.
- **~60-item furniture catalog** across beds, seating, tables, storage,
  kitchen, bathroom, appliances, lighting, and decor — all parametric
  (resize / recolour / configure in the inspector), searchable, with live
  3D thumbnails. Comes furnished out of the box.
- **Realistic materials** — procedurally generated PBR finishes (wood, tile,
  marble, terrazzo, carpet, concrete, painted plaster) plus fabric and
  wood-grain on furniture and a polished-granite worktop. Per-room floor and
  wall finishes. Photoreal CC0 textures/models can also be fetched in-app
  from Poly Haven / ambientCG / Kenney.
- **Time-of-day lighting** — SunCalc-driven sun for your location, ACES tone
  mapping, image-based lighting, soft shadows, and real lamp/pendant/fan
  lights that switch on at night.
- **Three views** — orbit (dollhouse with auto wall-reveal), a one-click
  top-down plan (pair with Measurements for an annotated floor plan), and a
  first-person walkthrough.
- **Editing** — drag to place, move, rotate, multi-select, copy/duplicate,
  numeric position/rotation, undo/redo, save/load layouts, and PNG export.
- **Performance** — CPU-first quality tiers with auto-detection, an adaptive
  guard that holds 30+ fps, and a Graphics panel exposing every setting
  (shadows, reflections, bloom, light cap, resolution) — all persisted.

## Controls

`drag` orbit · `scroll` zoom · `click` select / open doors · `R` rotate ·
`Del` delete · `⌃Z`/`⇧⌃Z` undo/redo · `⌃C`/`⌃V`/`⌃D` copy/paste/duplicate ·
`C` catalog · `M` measurements · `T` cycle time · `V` orbit/walk · in walk:
`WASD` move, `E` doors.

## Develop

```bash
npm install
npm run dev      # localhost:5173
npm test         # vitest
npm run build    # typecheck + production build
```

Stack: React + TypeScript, three.js via @react-three/fiber, Zustand, Vite.
See [CLAUDE.md](CLAUDE.md) for architecture and how to add content. All
bundled assets are procedurally generated (CC0-equivalent).
