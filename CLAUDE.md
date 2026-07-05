# Sofa So Good — agent entry point

A browser 3D interior-design app for Singapore homes — **HDB flats and condominiums**
(furnish, finish surfaces, light across the day, walk through). Ships a library of
accurate starter plans (HDB 2/3/4/5-room + Executive/3Gen/Jumbo/Maisonette, condo
studio → penthouse, landed terrace) plus a 2D editor for custom plans; the move-in
default is a furnished 4-room HDB. React + TypeScript + Three.js (@react-three/fiber),
Zustand (sliced store), Vite, Vitest, Biome.

> **This file is the entry point — hard rules + conventions only; keep it lean.**
> It is loaded on *every* turn, so it must stay short: do **not** grow it with system
> detail. The full code map is **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. Area-specific
> rules live in path-scoped `CLAUDE.md` files that load only when you work in that folder:
> `src/state/`, `src/furniture/`, `src/scene/`, `src/ui/`, `src/materials/`. Other reference
> docs: `docs/visual-verification-playbook.md`, `docs/interior-design-guidelines.md`,
> `REFERENCES.md` (competitor apps to study), `CHANGELOG.md`/`TASKS.md`/`TODO.md`.

## Hard rules (always)
- **Keep docs current in the same change.** After adding/removing/reshaping a system,
  command, or feature: update this file + `docs/ARCHITECTURE.md` (+ the relevant path-scoped
  `CLAUDE.md`) + `README.md`; **user docs** (`docs/user/`) if user-facing (verify labels
  against source — tabs/menu items are exact); **developer docs** (`docs/developer/`) if
  architecture/how-to.
- **Keep the docs modular as the repo grows.** This root file is a lean entry point — when
  detail would bloat it, push it to a dedicated file instead (e.g. a new `docs/*.md`, or split
  `ARCHITECTURE.md` once a topic outgrows its line). **Add a path-scoped `CLAUDE.md` to any
  `src/` subtree** that gains its own non-obvious rules or grows large (new top-level module →
  new `src/<module>/CLAUDE.md`), so guidance loads only where it's relevant. Prefer many small,
  scoped docs over one growing file.
- **Visual verification after any app change** (not docs/tests-only): run the app, exercise
  via `window.__store` + `scripts/shot.mjs`, screenshot, **visually review** for bugs/
  artifacts, and report what you saw. Green `tsc`+tests is NOT proof the render is right.
  Read `docs/visual-verification-playbook.md` first (harness rules, gotchas, template); add
  new fixes back to it.
- **Platform-specific quirks/bugs → search the web first, don't trust memory or assume.**
  For any mobile- or desktop-specific behaviour (iOS/Safari PWA safe-area & `env()` insets,
  `black-translucent` status bar, `100dvh`/viewport units, `position: fixed` clamping,
  home-indicator/notch, Android/Chrome or Firefox rendering quirks, touch/pointer-event
  differences, WebGL/GPU-driver bugs, …), **`WebSearch` for the documented cause + canonical
  fix before writing code** — these are exactly the areas where model knowledge is stale,
  vendor-specific, and easy to guess wrong (an iOS full-bleed bottom-bar bug took *five*
  reasoned-from-memory attempts before a web search found the real mechanism). Cite the source
  in the commit/PR, and prefer the community-documented pattern over a first-principles guess.
  This matters most when the sandbox can't reproduce the environment (no real device / GPU /
  safe-area insets), so a screenshot can't confirm the fix — reason from documented behaviour,
  not from headless output that omits the quirk.
- **Dev-gating.** Licensed/non-redistributable additions (IKEA scrape, Kenney zip, proxied
  providers) ship **dev-only** (`devOnly` flag / `visiblePacks(isDev)` / `PROD_PROVIDER_IDS`);
  CORS-friendly CC0/CC-BY additions ship in prod too.
- **Every feature is behind a feature flag.** Any user-facing feature (panel, tool, export,
  mode, AI/commerce surface) **must** have an entry in `FEATURE_FLAGS`
  (`src/features/featureFlags.ts`) and be gated through it: `useFeature('<flag>')` in React,
  `isFeatureEnabled('<flag>')` elsewhere, the `COMMAND_FLAGS` map for any ⌘K command, and a
  `useFeature` guard on its toolbar/menu entries (desktop **and** mobile). Set `default` (prod
  on/off); add `devOnly: true` for licensed/sidecar-dependent features (forced off in prod by
  `resolveFlags`); prod-safe CC0/pure-code features default `true`. No feature ships ungated.
- **Every feature is categorised `tier: 'simple' | 'pro'`** on its `FEATURE_FLAGS` entry.
  **Simple is the app default** and shows only the minimal *core design loop* (furnish, finish,
  view, share, budget); `pro`-tier features are forced **off in Simple mode** by `resolveFlags`
  (so the existing `useFeature`/`isFeatureEnabled` gates hide them automatically — no extra
  gating code). Keep Simple genuinely minimal yet fully functional for a casual user; put
  anything analytical/professional/advanced (measure, checks, drawings, scores, AI, versions,
  authoring tools, …) in `pro`. The Simple↔Pro toggle itself is **not** flag-gated.
- **Test BOTH modes.** Anything whose visibility/behaviour depends on the Simple/Pro mode (or on
  a `pro`-tier flag) must be unit-tested in **both** modes — default Simple AND Pro
  (`resolveFlags(..., 'simple')` vs `'pro'`, or set `uiMode` then `reresolveFeatureFlags()`).
  A `pro` feature must verify it is hidden in Simple and present in Pro.
- **No hardcoded colour.** Use the CSS token class vocabulary (`.panel`/`.btn`/`.toolbar`/…),
  never Tailwind colour utilities or literals; every surface works in light + dark + 5 themes.
- **Before each commit**: `npm test` + `tsc` + `biome` (pre-commit hook blocks on errors).
  Vitest defaults to the **node** environment — a test that touches the DOM must start with
  `// @vitest-environment happy-dom` (details in ARCHITECTURE.md).
  While **iterating**, run targeted tests only (`npx vitest --run <paths near your change>`);
  run the **full suite exactly once, right before the commit** — full-suite runs are ~2 min
  and dominate iteration time. Never run the full suite and a screenshot/scenario harness at the
  same time (sequence heavy phases).
  **Never pipe a test/build run through `tail`/`head` or any truncating filter** — you lose the
  failure names and force a full ~3 min rerun. Redirect the complete output to a log file
  (`npx vitest --run > /tmp/…/vitest.log 2>&1`) and grep/tail the FILE afterwards.
  Commit/push only when asked; one focused change per commit; log shipped work in `CHANGELOG.md`.
- **Versioning (`major.minor.patch.build`).** The running build lives in `src/version.ts`
  (`APP_VERSION`, the source of truth the "Check for updates" flow compares); `package.json`
  mirrors the first three parts. Current line started at **`0.1.0.0`**. **Every commit bumps the
  `build`** (or `patch`/`minor` for bigger work). **Each PR to `main` bumps `patch` or `minor`**
  depending on how big / how many features it carries (small fix → patch; sizeable or multi-feature
  → minor); reset the lower parts on a higher bump (a minor bump zeroes patch+build). **Never bump
  `major`** until explicitly told to. Keep `src/version.ts` and `package.json` in sync. **Every PR
  title must state the version it ships**, e.g. `… (v0.2.0.0)`.
- **Research against references.** When designing a new feature or judging what good UI/UX
  should look like, consult **[REFERENCES.md](REFERENCES.md)** (competitor/reference apps —
  Coohom, Planner 5D, IKEA Kreativ, Sweet Home 3D, …) and aim to match or surpass them. Any
  new relevant app/tool you discover while researching must be **added to `REFERENCES.md`**.

## Commands (essentials — full list in ARCHITECTURE.md)
- `npm run dev` (5173; `window.__store`) · `npm test` · `npm run build` (`tsc` + Vite).
- `npm run check`/`check:fix` — Biome (2-space/100-col/single-quote/no-semicolons).
- `node scripts/shot.mjs <out.png> [waitMs] [evalFile] [actionsJson]` — legacy one-shot screenshot harness.
- `node scripts/shot.mjs --scenario <file.json|file.mjs> [--out-dir <dir>]` — **scenario mode** (recommended): runs ordered named steps (eval/waitFor/click/screenshot/store/viewport/drag/wait…) in one browser session with structured per-step logging; see `docs/visual-verification-playbook.md`.
- `npm run optimize:glb` · `compress:glb-textures` · `scraper-server`/`price-server` (dev).
- `npm run docs:build`/`build:all` (user guide) · `docs:dev:developer` (dev docs).
- Packaging: `docker build .` (nginx image, `VITE_BASE=/`) · `npm run dist:desktop` (Electron
  installers) — details in ARCHITECTURE.md. Node pinned **24.18.0** (`.nvmrc`).
- Cloudflare backend (Pages + Workers + D1/R2/KV): `typecheck:worker` (tsc for `functions/`+
  `server/`+`workers/`), `build-library-index` (R2 manifest). Full deploy + guardrails guide:
  **[docs/deployment-cloudflare.md](docs/deployment-cloudflare.md)**. Backend features gate on
  `VITE_API_BASE` (`hasBackend()`); accounts are admin-created (no public signup).

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
