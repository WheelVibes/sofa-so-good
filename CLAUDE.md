# HDB 3D Interior-Design Sandbox — agent entry point

A browser 3D sandbox of a Singapore HDB 4-room flat for interior design (furnish,
finish surfaces, light across the day, walk through). React + TypeScript + Three.js
(@react-three/fiber), Zustand (sliced store), Vite, Vitest, Biome.

> **This file is the entry point — hard rules + conventions only; keep it short.**
> The full code map is **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. Area-specific
> rules live in path-scoped `CLAUDE.md` files that load when you work in that folder:
> `src/state/`, `src/furniture/`, `src/scene/`, `src/ui/`, `src/materials/`. Other
> reference docs: `docs/visual-verification-playbook.md`, `docs/interior-design-guidelines.md`,
> `CHANGELOG.md`/`TASKS.md`/`TODO.md`.

## Hard rules (always)
- **Keep docs current in the same change.** After adding/removing/reshaping a system,
  command, or feature: update this file + `docs/ARCHITECTURE.md` (+ the relevant path-scoped
  `CLAUDE.md`) + `README.md`; **user docs** (`docs/user/`) if user-facing (verify labels
  against source — tabs/menu items are exact); **developer docs** (`docs/developer/`) if
  architecture/how-to.
- **Visual verification after any app change** (not docs/tests-only): run the app, exercise
  via `window.__store` + `scripts/shot.mjs`, screenshot, **visually review** for bugs/
  artifacts, and report what you saw. Green `tsc`+tests is NOT proof the render is right.
  Read `docs/visual-verification-playbook.md` first (harness rules, gotchas, template); add
  new fixes back to it.
- **Dev-gating.** Licensed/non-redistributable additions (IKEA scrape, Kenney zip, proxied
  providers) ship **dev-only** (`devOnly` flag / `visiblePacks(isDev)` / `PROD_PROVIDER_IDS`);
  CORS-friendly CC0/CC-BY additions ship in prod too.
- **No hardcoded colour.** Use the CSS token class vocabulary (`.panel`/`.btn`/`.toolbar`/…),
  never Tailwind colour utilities or literals; every surface works in light + dark + 5 themes.
- **Before each commit**: `npm test` + `tsc` + `biome` (pre-commit hook blocks on errors).
  Commit/push only when asked; one focused change per commit; log shipped work in `CHANGELOG.md`.

## Commands (essentials — full list in ARCHITECTURE.md)
- `npm run dev` (5173; `window.__store`) · `npm test` · `npm run build` (`tsc` + Vite).
- `npm run check`/`check:fix` — Biome (2-space/100-col/single-quote/no-semicolons).
- `node scripts/shot.mjs <out.png> [waitMs] [evalFile] [actionsJson]` — screenshot harness.
- `npm run optimize:glb` · `compress:glb-textures` · `scraper-server`/`price-server` (dev).
- `npm run docs:build`/`build:all` (user guide) · `docs:dev:developer` (dev docs).

## Coding conventions
- **Furniture primitives**: floor-anchored, footprint-centred, facing +Z, built in real metres.
- **Structural soundness**: parts must connect (no floating members), supports reach
  floor→underside, legs inside the seat/top footprint. `material=` needs a real three
  `Material` (use `furnitureMaterials.ts` helpers), never a plain props object. For photoreal
  surfaces apply a CC0 DLC material (`mat:<id>`) over the procedural fallback — don't invent
  bespoke texture art.
- **Placement** follows [docs/interior-design-guidelines.md](docs/interior-design-guidelines.md):
  storage/appliances/beds flush to walls, TVs on windowless walls, seating faces TV, walkways
  + door/window clearances preserved. Constants in `layout/designRules.ts` (`CLEARANCE`) drive
  `layout/autoArrange.ts`.
- **Quality**: modular + extensible, no monolithic files, handle edge cases, viewport-responsive
  (desktop **and** mobile/touch). Tier-gate GPU cost (Performance is the default = flat renderer).
- **Licensing/credits**: bundled assets are procedural/CC0 where possible; bundled GLBs +
  Poly Haven/ambientCG/Kenney/Poly Pizza carry per-item license + attribution (CC-BY required),
  shown in the inspector + `CREDITS.json`.
- Keep `TODO.md`/`TASKS.md` current when deferring work.
