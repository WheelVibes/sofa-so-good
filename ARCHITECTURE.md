# ARCHITECTURE — high-level blueprint

A browser **3D interior-design app** for Singapore homes — **HDB flats and
condominiums**: furnish, finish surfaces, light across the day, and walk through.
Ships a library of accurate starter plans (HDB 2/3/4/5-room + Executive/3Gen/Jumbo/
Maisonette, condo studio → penthouse, landed terrace) and a 2D editor for custom
plans; the move-in default is a furnished 4-room HDB. Single-page app, **no
backend** — all state lives client-side (`localStorage` + IndexedDB), and it runs
**fully offline** (self-hosted fonts/decoders + a precaching service worker).

> **Two architecture docs, by depth:**
> - **This file** = the orientation map: the directory tree + how data flows. Read
>   it first to know *where* to work.
> - **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** = the dense, authoritative
>   per-system code map (one line per system). Read it for *exactly which module*.
> - **[`CLAUDE.md`](CLAUDE.md)** + path-scoped `src/<area>/CLAUDE.md` = the rules.
>   Keep all of these current in the same change that reshapes a system.

## Stack
React 19 + TypeScript · Three.js via @react-three/fiber (R3F) + drei · Zustand 5
(sliced store) · Zod 4 (save schema) · Vite 8 · Vitest 4 · Biome 2 · VitePress (docs).
Python is **offline asset tooling only**, not part of the app build.

## Directory tree (major folders)

```
sofa-so-good/
├── src/                  # The application
│   ├── App.tsx · main.tsx        # Mount + top-level composition
│   ├── state/            # Zustand store — single source of truth (slices/, storage/, schema.ts)
│   ├── scene/            # The R3F <Canvas>: cameras, lighting, demand render pump, capture, controllers
│   ├── apartment/        # 3D shell built from the plan — walls/windows/doors/skirting, PlanShell/Apartment
│   ├── floorplan/        # PURE plan model + geometry (walls/rooms/openings/levels/templates) — unit-tested
│   ├── furniture/        # Furniture catalog defs + 3D meshes + GLB import/convert/LOD
│   ├── catalog/          # Catalog packs, pricing, remote/IKEA providers
│   ├── materials/        # Procedural + CC0 PBR materials / textures
│   ├── collision/        # Placement collision, broadphase, clearance gaps (pure)
│   ├── layout/           # Auto-arrange, align/distribute, design rules (pure)
│   ├── analysis/         # Design score, daylight, accessibility checks (pure)
│   ├── lighting2d/        # 2D lux grid / lighting-plan analysis (pure)
│   ├── elevation/        # 2D elevation + dimension projections (pure)
│   ├── export/           # DXF / GLB / OBJ / STL / BOQ / quote exporters (pure builders)
│   ├── ai/               # Optional BYO-key AI: auto-layout, floor-plan, palette
│   ├── features/         # FEATURE_FLAGS registry + sharing/auth
│   ├── controls/         # Keybindings, modal guard, hotkeys
│   ├── ui/               # All DOM overlays: toolbar, panels, inspector, modals, plan editor (ui/floorplan/)
│   ├── styles/           # CSS design tokens (.panel/.btn/.menu-item…) — light+dark+5 themes
│   ├── services/ · ffe/ · lib/ · types/   # Geocoding; FF&E schedule; misc libs; ambient d.ts
├── scripts/              # Tooling: shot.mjs screenshot harness + scenarios/, asset/price sidecars
├── docs/                 # ARCHITECTURE.md (full map), user/ + developer/ VitePress guides, research/
├── public/               # Static served assets (models, textures, fixtures) — mostly .claudeignore'd
├── assets/               # Manifests / screenshots (not the app)
├── python/               # Offline IKEA scraper + asset optimisation (not in app build)
├── CLAUDE.md             # Agent entry point: hard rules + conventions
├── .clauderules          # Quick-reference guardrails (companion to CLAUDE.md)
├── package.json · vite.config.ts · vitest.config.ts · biome.json · tsconfig*.json
└── *.md                  # README, CHANGELOG, TASKS, TODO, FEATURE_PARITY, REFERENCES, PHOTOREALISM, CREDITS
```

## How data flows (the layering to follow)

```
                 user input (DOM or 3D pointer)
                            │
        ┌───────────────────┴────────────────────┐
        ▼                                         ▼
   src/ui/*  (panels, toolbar, plan editor)   src/scene/* (R3F pointer/select)
        │ calls slice actions                     │
        └───────────────────┬────────────────────┘
                            ▼
            src/state/slices/*  (Zustand — the single source of truth)
              · validates / mutates · pushes undo · marks scene dirty
                            │
        ┌───────────────────┼─────────────────────────────┐
        ▼                   ▼                              ▼
  PURE compute layer    persistence                   render reaction
  floorplan/ collision/ state/storage/ →               scene/ (demand loop)
  layout/ analysis/     localStorage + IndexedDB;       re-reads store →
  export/ (no React/    schema.ts round-trips the       apartment/ shell +
  three; unit-tested)   save format                     furniture/ meshes draw
```

**Rules of the flow (read before writing code):**
1. **State is central.** UI and scene never hold authoritative data — they read
   from / dispatch into the Zustand slices (`useStore`). A change to a slice is
   what makes the demand-mode canvas re-render.
2. **Logic goes in the pure layer**, not in components: new geometry, collision,
   layout, analysis, or export logic belongs in `floorplan/`/`collision/`/`layout/`/
   `analysis/`/`export/` as pure, unit-tested TS (types-only imports of three).
   Components and exporters are thin consumers of it.
3. **The plan drives the shell.** `FloorPlan` (in `floorplan/`) is the source of
   truth for walls/rooms/openings/levels; both the 2D editor (`ui/floorplan/`) and
   the 3D shell (`apartment/`) render *from* it. Edit the model, not the renderers.
4. **Persisted fields round-trip through `state/schema.ts`** (optional + additive).
5. **Every user-facing feature is flag-gated** (`features/featureFlags.ts`) and
   categorised `simple`/`pro`; Simple mode is the minimal default.
6. **Styling is tokens only** (`src/styles/`) — no hex literals / Tailwind colours;
   must work in light + dark across all 5 themes.

For the exact module behind any system named above, jump to
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
