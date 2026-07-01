# Sofa So Good

> A realistic, browser-based **3D interior-design app** for Singapore homes — **HDB flats and condominiums**.

Pick an accurate starter floor plan (HDB 2/3/4/5-room, Executive/3Gen/Jumbo/Maisonette,
condo studio → penthouse, landed terrace) or draw your own, then **furnish** it from a
catalog, **finish** the walls and floors, **light** it across the day, **walk through**
it, and **share or export** the result — all in the browser, no account, and **fully
offline** once loaded. The move-in default is a ready-furnished 4-room HDB, so you can
start designing immediately.

![A furnished flat](docs/reference/floor-plan.svg)

📖 **[Read the user guide →](docs/user/getting-started.md)**

## Highlights

| | |
|---|---|
| 🛋️ **Furnish** | A unified ~95-item catalog across 15 categories — parametric (resize / recolour / configure), searchable, with your uploads, packs and a CC0 library in one grid. One-click **Sets**, full-flat **Presets**, and a **Tidy up** auto-arranger. → [Placing furniture](docs/user/placing-furniture.md) |
| 🎨 **Finish** | Procedural PBR floors, walls & ceilings (oak/walnut/parquet, marble, terrazzo, paints, brick, microcement) plus downloadable CC0 materials, per-room with “apply to all” and per-wall **accent walls**. → [Finishes & materials](docs/user/finishes-and-materials.md) |
| ☀️ **Light** | A real sun simulation for your location with day/night fixtures, glass tint, and one-tap lighting moods. → [Lighting & time](docs/user/lighting-and-time.md) |
| 👀 **View** | Orbit dollhouse, top-down plan, and a first-person walkthrough (WASD / on-screen joystick) with a live minimap. → [Navigating](docs/user/navigating.md) |
| 📐 **Floor plans** | A 2D editor to redraw the home (walls, rooms, doors, ceilings) or load an HDB / condo / landed template; the 3D home follows. Import a **Sweet Home 3D** `.sh3d` plan *(Pro)*. → [Floor-plan editor](docs/user/floor-plan-editor.md) |
| 🪑 **Per-room editor** | An IKEA-planner-style mode that isolates one room for focused furnishing. → [Room editor](docs/user/room-editor.md) |
| 📊 **Design tools** | Budget & shopping list, clearance checks, measuring, a design score, and a printable design report. → [Design tools](docs/user/design-tools.md) |
| 📦 **Your own models** | Import `.glb/.gltf/.obj/.fbx/.stl/.ply/.dae/.3mf/.usdz` — converted & optimized in-browser. → [Importing models](docs/user/importing-models.md) |
| ✨ **Smart Start** | Pick a style and the whole home is furnished + finished in one click — on any plan. |
| 🔗 **Share & export** | Shareable design links, a PNG snapshot, a portable `.sofa.json`, and a glTF/GLB/OBJ export *(Pro)*. |
| 🌗 **Themes** | Five Singapore-rooted themes × light/dark, plus a **Simple/Pro** mode toggle. → [Themes & appearance](docs/user/themes-and-appearance.md) |
| 📴 **Offline** | Self-hosted fonts + decoders and a PWA service worker — design with the network off. |

The renderer defaults to a fast, flat **Performance** tier (no GPU needed); Medium/High/Maximum
add shadows, reflections and post-processing on demand. The render loop is **on-demand** —
it draws only while something changes — so it stays cool and battery-friendly.

See the **[full user guide](docs/user/getting-started.md)** for everything else (panoramas,
versions, comments, AI export, live prices, …).

## Controls

`drag` orbit · `scroll` zoom · `click` select / open doors · `⌘K` command palette ·
`right-click` context menu · `R` rotate · `Del` delete · `⌃Z`/`⇧⌃Z` undo/redo ·
`⌃C`/`⌃V`/`⌃D` copy/paste/duplicate · `⌃A` select all · `C` catalog · `M` measure ·
`T` cycle time · `O` top view · `H` reset view · `L` tidy · `P` 2D⇄3D · `V` orbit/walk ·
in walk: `WASD` move, `E` doors · `?` help. → [All shortcuts](docs/user/keyboard-shortcuts.md)

## Develop

```bash
npm install
npm run dev      # localhost:5173
npm test         # vitest
npm run build    # typecheck + production build
npm run check    # Biome: format + lint
```

A **pre-commit hook** (auto-installed by `npm install`) runs `biome check` on staged files.
Optional dev sidecars — `npm run scraper-server` (IKEA live-scrape pack) and
`npm run price-server` (live SG retailer prices) — and the offline asset tooling under
`python/scripts/` are not part of the app build. Full command list and how to add content:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

- **User guide** — [`docs/user/`](docs/user/getting-started.md), a VitePress site deployed at
  `/sofa-so-good/docs/` and reachable in-app (the **User guide** button, Help modal, and ⌘K).
- **Developer guide** — maintainer docs under [`docs/developer/`](docs/developer/index.md);
  [`CLAUDE.md`](CLAUDE.md) is the lean agent entry point and
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) the always-current code map.

## Tech & licensing

React + TypeScript · three.js via @react-three/fiber · Zustand · Vite · Vitest · Biome.

Bundled assets are procedurally generated (CC0-equivalent) where possible; the few bundled
GLBs (e.g. the pool tables) carry their real licence + attribution (CC-BY where required),
shown in the inspector and [`CREDITS.md`](CREDITS.md). Imported IKEA models retain IKEA's
licensing and are not redistributed.
