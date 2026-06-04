# Comprehensive user & developer documentation — design

**Date:** 2026-06-05
**Status:** approved (brainstorm)
**Topic:** Ship two documentation surfaces — a deployed **user guide** (VitePress,
served at `/sofa-so-good/docs/`) and an in-repo **developer guide**
(`docs/developer/`, not deployed) — plus an in-app **help button** that opens
the user guide in a new tab.

## Goals

- **User docs**: explain every user-facing feature and how to use/customize it,
  with worked examples and real screenshots. Discoverable from inside the app.
  Served at the `sofa-so-good/docs` endpoint (i.e. `/sofa-so-good/docs/` on the
  GitHub Pages project site).
- **Developer docs**: explain the architecture, patterns, and systems to someone
  maintaining the code, plus how-to recipes for extending the app. Lives in the
  repo, **never deployed to production**.
- **In-app entry point**: a help button that opens the user docs in a new page.

## Non-goals

- No in-app embedded docs viewer (docs open in a new tab, not a modal/iframe).
- No versioned docs / changelog site, search backend, or i18n. (VitePress local
  search is on by default and is enough.)
- Not duplicating `CLAUDE.md` or the `superpowers/` specs verbatim — developer
  docs distill and cross-link them.

## Context (current state)

- Single-page Vite + React + R3F app; **no router**.
- `vite.config.ts` sets `base: '/sofa-so-good/'` for production builds (GitHub
  Pages project site) and `/` for dev.
- `.github/workflows/deploy.yml` runs `npm run build` → uploads `dist/` to Pages.
  `vite build` empties `dist/` (`emptyOutDir`), so anything merged into `dist/`
  must be written **after** the app build.
- `public/` is copied to the deploy root, but VitePress is preferred over a
  hand-rolled static page (decision below).
- Existing `docs/` holds `superpowers/specs|plans`, guidelines, references — all
  Markdown, none deployed. Good home for developer docs.
- `src/ui/HelpModal.tsx` (toolbar `?`) shows shortcuts + tips — a natural place
  to also link the full docs. A command palette (`featuresSlice`) exists for a
  third entry point.

## Decisions

1. **User-docs tooling: VitePress.** Dedicated static-site generator, Markdown
   source, built-in nav/sidebar/search/dark-mode, themeable. Added as a
   **devDependency** (Vue + its own bundled Vite); it does **not** enter the app
   bundle. Chosen over an in-app route (would load the 3D bundle to read docs)
   and a hand-rolled MD→HTML step.
2. **Developer-docs home: `docs/developer/`** — an index plus focused topic
   guides, cross-linking the existing specs.
3. **Help button placement:** all three — a dedicated toolbar **User guide**
   button (opens new tab), a link in the `?` Help modal, and a command-palette
   entry.
4. **Screenshots:** captured for real via the existing Puppeteer harness
   (`scripts/shot.mjs`) and embedded in the user docs.

## Architecture

### User docs (VitePress)

```
docs/user/
  .vitepress/
    config.ts        # title, base, nav, sidebar, theme tweaks
    theme/           # optional: custom accent CSS to echo the app palette
  index.md           # landing / hero
  getting-started.md
  navigating.md
  placing-furniture.md
  finishes-and-materials.md
  lighting-and-time.md
  importing-models.md
  importing-textures.md
  floor-plan-editor.md
  room-editor.md
  walkthrough-and-sun-study.md
  design-tools.md
  themes-and-appearance.md
  keyboard-shortcuts.md
  tips-and-faq.md
  public/screenshots/*.png   # captured UI screenshots referenced by pages
```

- **`base: '/sofa-so-good/docs/'`** so all asset/link URLs resolve under the
  Pages project path. Local `docs:dev` serves at that same base on its own port.
- **`outDir`** points to the repo's `dist/docs` so the built site lands at the
  deployed `/docs` path. (Set `outDir` to an absolute `dist/docs` and
  `emptyOutDir: true` scoped to that dir — VitePress only clears its own output.)

### Build & deploy wiring

- `package.json` scripts:
  - `docs:dev` — `vitepress dev docs/user --port 5174`
  - `docs:build` — `vitepress build docs/user` (outputs to `dist/docs`)
  - `docs:preview` — `vitepress preview docs/user`
  - `build:all` — `npm run build && npm run docs:build` (app first, docs second,
    so the docs survive `dist/` being emptied)
- `deploy.yml`: change the build step from `npm run build` to `npm run build:all`.
  The existing `cp dist/index.html dist/404.html` and `touch dist/.nojekyll`
  steps remain (the `.nojekyll` already covers VitePress's `_`-prefixed assets).
- CI (`ci.yml`) is unchanged — docs are Markdown; no tsc/biome impact. (Biome
  already excludes nothing special here; VitePress config is a small TS file that
  passes formatting, or is added to Biome's ignore if needed.)

### In-app help button

- A shared helper computes the docs URL host-agnostically:
  `const DOCS_URL = \`${import.meta.env.BASE_URL}docs/\`` → `/sofa-so-good/docs/`
  in production, `/docs/` in dev.
- **Toolbar**: a new `Icon.Book` (or reuse an existing glyph) "User guide" button
  in the toolbar that calls `window.open(DOCS_URL, '_blank', 'noopener')`. Shown
  in orbit mode alongside the other top-level controls; tooltip "User guide".
- **Help modal**: a footer link/button "Open the full user guide ↗" in
  `HelpModal.tsx` using the same URL.
- **Command palette**: a "Documentation" action (group: panels/help) that opens
  the same URL.
- **Dev caveat (documented in developer docs):** in app `npm run dev` the
  `/docs/` path is not served unless `npm run docs:dev`/`docs:build` has produced
  it; the button still works against a built/deployed site.

### Developer docs (`docs/developer/`)

```
docs/developer/
  index.md                  # overview + how to navigate + links to CLAUDE.md/specs
  architecture.md           # stack, module map, data flow, boot sequence
  state-management.md       # Zustand slices, persistence, hydration, save schema
  rendering-and-scene.md    # Canvas, lighting/time, quality tiers, effects
  furniture-catalog.md      # parametric primitives, GLB items, catalog merge
  materials-and-finishes.md # procedural generators, DLC mat:<id>, world UV
  import-pipeline.md        # user GLB, multi-format convert, optimize, IKEA, textures
  apartment-and-floorplan.md# constants, plan editor, per-room editor, collision
  ui-and-design-system.md   # tokens/themes, toolbar, panels, responsive/mobile
  packs-and-remote-catalog.md # DLC packs registry, remote providers, scraper sidecar
  testing-and-verification.md # vitest, visual-verification harness, biome, CI/deploy
  offline-tooling.md        # python scrapers, optimize:glb, asset pipeline
  adding-features.md        # recipes: add a primitive / finish / category / pack
```

Each guide is concise, links to the authoritative source files and the relevant
`docs/superpowers/specs/*`, and avoids re-stating `CLAUDE.md` line-by-line.

## Data flow

User clicks the toolbar **User guide** button → `window.open('/sofa-so-good/docs/')`
→ GitHub Pages serves the VitePress static site built into `dist/docs/` by
`build:all` in the deploy workflow. No runtime coupling between the app and the
docs site.

## Error handling / edge cases

- **Dev**: `/docs/` 404s under `npm run dev` unless docs are built/served —
  acceptable and documented; the button uses `noopener` and simply opens the URL.
- **`dist/` emptied by app build**: mitigated by ordering (`build:all` runs docs
  after the app).
- **Port clash**: `docs:dev` uses a non-5173 port.
- **Jekyll/underscore assets**: covered by the existing `.nojekyll`.
- **Bundle size**: VitePress is dev-only; the app bundle is unaffected.

## Testing & verification

- `npm run build:all` succeeds and produces `dist/docs/index.html` +
  `dist/index.html`.
- `npm run docs:build` then `docs:preview` renders the site at the configured
  base; spot-check internal links and images resolve.
- Visual verification of the in-app button: load the app, confirm the toolbar
  **User guide** button + Help-modal link + palette entry are present and open a
  new tab to the docs URL (capture a screenshot). Screenshots embedded in the
  user docs are captured via `scripts/shot.mjs`.
- `tsc` + `biome` pass for the small `src/` changes (button + URL helper).

## Rollout / sequencing

1. Add VitePress + scripts + `docs/user/` skeleton + config; verify `docs:build`
   lands in `dist/docs`.
2. Wire `build:all` into `deploy.yml`.
3. Author user-docs pages; capture + embed screenshots.
4. Add the in-app button / modal link / palette entry + URL helper.
5. Author `docs/developer/` guides.
6. Update `README.md` (link to user docs) and `CLAUDE.md` (note the docs system +
   `build:all`/`docs:*` scripts + `docs/developer/`).

## Concurrency note

Another session is editing `src/furniture/primitives/*`. Doc commits must stage
only documentation/build/UI-help files and never touch those in-flight changes.
