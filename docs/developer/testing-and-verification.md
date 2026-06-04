# Testing & verification

## Unit tests

`npm test` (Vitest, run once) / `npm run test:watch`. Co-located `*.test.ts(x)`.
Pure logic is the priority to unit-test (placement, parsers, the render-decision
function, price/AI request builders, etc.).

## Visual verification (required)

For **any** change to the app (not docs/tests-only) you must run the app,
exercise the changed path, capture screenshots, and **review the pixels** — a
green suite never proves the render looks right. Drive the store via
`window.__store` and the Puppeteer harness:

```
node scripts/shot.mjs <out.png> [waitMs] [evalFile] [actionsJson]
```

Read `docs/visual-verification-playbook.md` first — it documents the harness
rules and the known interaction gotchas (location-prompt modal, onboarding,
camera framing, render-populated cache races, dev-server restarts, Draco
decoding) and a known-good evalFile template.

## Format & lint

**Biome** (`biome.json`): `npm run check` / `check:fix`. 2-space, 100-col,
single-quote, no-semicolons, trailing-commas. A **pre-commit hook**
(`.githooks/pre-commit`) runs `biome check --staged` and blocks on any
format/lint error in staged files (bypass with `--no-verify`). Markdown isn't
linted by Biome.

## CI & deploy

- `.github/workflows/ci.yml` enforces format-check + `tsc`; lint is non-blocking
  until the backlog clears.
- `.github/workflows/deploy.yml` runs **`npm run build:all`** → uploads `dist/`
  to GitHub Pages.

## Docs build

- `npm run docs:dev` — VitePress dev server for the user guide.
- `npm run docs:build` — builds `docs/user/` into `dist/docs/`.
- `npm run build:all` — `npm run build` (app, empties `dist/`) **then**
  `docs:build` (writes `dist/docs/`) — order matters so the app build can't wipe
  the docs.

> Dev caveat: the user guide links to `${BASE_URL}docs/`, which only exists in a
> built `dist/` — it isn't served by the app's own `npm run dev`. Use
> `docs:dev`/`docs:preview` to view the guide locally. (Note `docs:dev`/preview
> default to port 5175, which the `price-server` sidecar also uses — don't run
> both at once.)
