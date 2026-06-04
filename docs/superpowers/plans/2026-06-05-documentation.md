# Documentation (user guide + developer guide) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed VitePress **user guide** at `/sofa-so-good/docs/`, an in-repo (never-deployed) **developer guide** under `docs/developer/`, and an in-app help button (toolbar + Help modal + command palette) that opens the user guide in a new tab.

**Architecture:** VitePress builds a static site from `docs/user/` into `dist/docs/` (after the app's `vite build` empties `dist/`), wired into `deploy.yml` via a new `build:all` script. The app links out to `${import.meta.env.BASE_URL}docs/` — host-agnostic, no router, no impact on the app bundle. Developer docs are plain Markdown.

**Tech Stack:** VitePress (devDependency, Vue-based SSG with its own bundled Vite), React 19 + Zustand (existing UI), Vitest, Biome, `scripts/shot.mjs` (Puppeteer) for screenshots.

**Concurrency note:** Another session is editing `src/furniture/primitives/*` and may touch `CLAUDE.md`/`src/main.tsx`. Every commit in this plan stages **only** the explicit files listed in that task's `git add`. Never run `git add -A`/`git add .`, and never `pkill` a dev server without first confirming no other server is needed (see Task 5).

---

### Task 1: Scaffold the VitePress user-docs site

**Files:**
- Modify: `package.json` (add `vitepress` devDependency + scripts)
- Create: `docs/user/.vitepress/config.ts`
- Create: `docs/user/index.md`
- Modify: `.gitignore` (ignore VitePress cache/temp)

- [ ] **Step 1: Install VitePress (latest) as a devDependency**

Run: `npm install -D vitepress`
Expected: `package.json` gains `"vitepress": "^x.y.z"` under `devDependencies`; `package-lock.json` updated. (Do not hand-edit the version — let npm resolve latest.)

- [ ] **Step 2: Add docs scripts to `package.json`**

In the `"scripts"` block, add these four entries (keep existing scripts untouched):

```json
    "docs:dev": "vitepress dev docs/user --port 5175",
    "docs:build": "vitepress build docs/user",
    "docs:preview": "vitepress preview docs/user --port 5175",
    "build:all": "npm run build && npm run docs:build"
```

- [ ] **Step 3: Write the VitePress config**

Create `docs/user/.vitepress/config.ts`. The `base` and `outDir` are the load-bearing parts: `base` makes every link resolve under the Pages project path, and `outDir` writes the built site into the app's `dist/docs/` (path is relative to the VitePress root `docs/user`, so `../../dist/docs`).

```ts
import { defineConfig } from 'vitepress'

// User guide for Sofa So Good. Built into the app's dist/docs so it deploys at
// https://<pages-host>/sofa-so-good/docs/. base MUST match that sub-path.
export default defineConfig({
  title: 'Sofa So Good',
  description: 'User guide — furnish, finish, and walk through your HDB flat in 3D.',
  base: '/sofa-so-good/docs/',
  // Written relative to the VitePress root (docs/user). Lands in the repo's
  // dist/docs so `build:all` deploys it alongside the app. VitePress only
  // empties its own outDir, so this is safe to point inside dist.
  outDir: '../../dist/docs',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Open the app', link: 'https://github.com/' },
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Welcome', link: '/' },
          { text: 'Quick start', link: '/getting-started' },
          { text: 'Navigating the flat', link: '/navigating' },
        ],
      },
      {
        text: 'Designing',
        items: [
          { text: 'Placing & arranging furniture', link: '/placing-furniture' },
          { text: 'Finishes & materials', link: '/finishes-and-materials' },
          { text: 'Lighting & time of day', link: '/lighting-and-time' },
          { text: 'Themes & appearance', link: '/themes-and-appearance' },
        ],
      },
      {
        text: 'Bringing your own content',
        items: [
          { text: 'Importing models', link: '/importing-models' },
          { text: 'Importing textures', link: '/importing-textures' },
        ],
      },
      {
        text: 'Planning tools',
        items: [
          { text: 'Floor-plan editor', link: '/floor-plan-editor' },
          { text: 'Per-room editor', link: '/room-editor' },
          { text: 'Walkthrough & sun study', link: '/walkthrough-and-sun-study' },
          { text: 'Budget, checks & report', link: '/design-tools' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Keyboard shortcuts', link: '/keyboard-shortcuts' },
          { text: 'Tips & FAQ', link: '/tips-and-faq' },
        ],
      },
    ],
    outline: { level: [2, 3] },
    search: { provider: 'local' },
  },
})
```

- [ ] **Step 4: Write a placeholder landing page so the build has content**

Create `docs/user/index.md`:

```markdown
---
layout: home
hero:
  name: Sofa So Good
  text: Design your HDB flat in 3D
  tagline: Furnish it, finish the walls and floors, light it across the day, and walk through it — right in your browser.
  actions:
    - theme: brand
      text: Quick start
      link: /getting-started
    - theme: alt
      text: Keyboard shortcuts
      link: /keyboard-shortcuts
features:
  - title: Furnish
    details: Drag furniture from a unified catalog, snap to a grid, group and align pieces.
  - title: Finish
    details: Repaint walls and refinish floors with procedural and downloadable PBR materials.
  - title: Walk through
    details: Switch to first-person to feel the real scale of the flat at eye level.
---
```

- [ ] **Step 5: Ignore VitePress cache/temp in git**

Add to `.gitignore` (append; do not remove existing entries):

```
# VitePress
docs/user/.vitepress/cache
docs/user/.vitepress/.temp
```

(The built output goes to `dist/`, which is already ignored.)

- [ ] **Step 6: Verify the docs build produces `dist/docs`**

Run: `npm run docs:build`
Expected: exits 0; `dist/docs/index.html` exists. Verify with `ls dist/docs/index.html` → prints the path (no "No such file").

- [ ] **Step 7: Verify Biome accepts the config file**

Run: `npx biome check docs/user/.vitepress/config.ts`
Expected: "No fixes applied" / no errors. If it reports formatting, run `npx biome check --write docs/user/.vitepress/config.ts` and re-run.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore docs/user/.vitepress/config.ts docs/user/index.md
git commit -m "docs: scaffold VitePress user-guide site (build:all -> dist/docs)"
```

---

### Task 2: Wire docs build into the GitHub Pages deploy

**Files:**
- Modify: `.github/workflows/deploy.yml:31`

- [ ] **Step 1: Build the docs in the deploy workflow**

In `.github/workflows/deploy.yml`, change the Build step command from `npm run build` to `npm run build:all` so the docs are built into `dist/docs` before the artifact upload. The step becomes:

```yaml
      - name: Build
        run: npm run build:all
```

Leave the "Add SPA 404 fallback", "Disable Jekyll processing", and upload steps unchanged — `.nojekyll` already lets VitePress's `_`-prefixed assets serve verbatim.

- [ ] **Step 2: Sanity-check the full deploy build locally**

Run: `npm run build:all`
Expected: app build writes `dist/index.html`; docs build writes `dist/docs/index.html`. Verify both: `ls dist/index.html dist/docs/index.html` prints both paths.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: build user docs into dist/docs on deploy"
```

---

### Task 3: In-app help button → open the user guide in a new tab

**Files:**
- Create: `src/ui/docsUrl.ts`
- Create: `src/ui/docsUrl.test.ts`
- Modify: `src/ui/toolbar/icons.tsx` (add a `Book` icon)
- Modify: `src/ui/toolbar/Toolbar.tsx:250-259` (add the toolbar button)
- Modify: `src/ui/HelpModal.tsx` (add a footer link)
- Modify: `src/ui/CommandPalette.tsx:126-133` (add a command)

- [ ] **Step 1: Write the failing test for the docs-URL helper**

Create `src/ui/docsUrl.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DOCS_URL, openDocs } from './docsUrl'

describe('docsUrl', () => {
  it('resolves under the app base path with a trailing docs/ segment', () => {
    // In Vitest, import.meta.env.BASE_URL is '/', so DOCS_URL is '/docs/'.
    expect(DOCS_URL).toBe('/docs/')
  })

  it('openDocs opens the docs URL in a new tab with noopener', () => {
    const calls: Array<[string, string, string]> = []
    const orig = window.open
    // @ts-expect-error test stub
    window.open = (url: string, target: string, features: string) => {
      calls.push([url, target, features])
      return null
    }
    openDocs()
    window.open = orig
    expect(calls).toEqual([['/docs/', '_blank', 'noopener,noreferrer']])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/docsUrl.test.ts`
Expected: FAIL — cannot resolve `./docsUrl`.

- [ ] **Step 3: Implement the helper**

Create `src/ui/docsUrl.ts`:

```ts
// The deployed user guide lives at <app base>/docs/. import.meta.env.BASE_URL
// is '/sofa-so-good/' in production and '/' in dev, so this resolves to
// '/sofa-so-good/docs/' on Pages without hardcoding the host or project path.
export const DOCS_URL = `${import.meta.env.BASE_URL}docs/`

/** Open the user guide in a new tab. */
export function openDocs() {
  window.open(DOCS_URL, '_blank', 'noopener,noreferrer')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/docsUrl.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add a `Book` icon to the icon set**

In `src/ui/toolbar/icons.tsx`, add this entry inside the `Icon` object (e.g. right after the `Help` entry near line 248):

```tsx
  Book: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z" />
      <path d="M9 7h7M9 10h7" />
    </Svg>
  ),
```

- [ ] **Step 6: Add the toolbar "User guide" button**

In `src/ui/toolbar/Toolbar.tsx`, add the import near the other local imports (after line 9 `import { IconButton } from './IconButton'` group):

```tsx
import { openDocs } from '../docsUrl'
```

Then in the right-hand controls block (the Appearance + Help group, lines 250-259), add a User-guide button immediately before the Help `IconButton`:

```tsx
        {/* Appearance + Help live on the right of the island in every mode. */}
        <Divider />
        <AppearancePopover />
        <IconButton
          icon="Book"
          label="User guide"
          onClick={openDocs}
        />
        <IconButton
          icon="Help"
          label="Help & shortcuts"
          shortcut="?"
          active={helpOpen}
          onClick={() => setHelpOpen(true)}
        />
```

- [ ] **Step 7: Add the Help-modal footer link**

In `src/ui/HelpModal.tsx`, add the import at the top (after line 2):

```tsx
import { DOCS_URL } from './docsUrl'
```

Then add a third section after the Tips section (after the closing `</div>` of the Tips `sec`, before the modal closes at line 63):

```tsx
      <div className="sec">
        <div className="sec-h">
          <span>Documentation</span>
        </div>
        <ul className="help-list">
          <li>
            <Icon.Book className="icn" width={16} height={16} />
            <span>
              Read the{' '}
              <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                full user guide ↗
              </a>{' '}
              for step-by-step walkthroughs and examples.
            </span>
          </li>
        </ul>
      </div>
```

- [ ] **Step 8: Add the command-palette entry**

In `src/ui/CommandPalette.tsx`, add the import after line 5 (`import { useStore } ...`):

```tsx
import { openDocs } from './docsUrl'
```

Then add a command in the `base` array immediately after the `help` command (after line 133, the closing `},` of the help entry):

```tsx
      {
        id: 'docs',
        group: 'Tools & panels',
        label: 'Open the user guide',
        icon: 'Book',
        run: () => openDocs(),
      },
```

- [ ] **Step 9: Typecheck, lint, and run the focused test**

Run: `npx tsc --noEmit && npx biome check src/ui/docsUrl.ts src/ui/docsUrl.test.ts src/ui/toolbar/icons.tsx src/ui/toolbar/Toolbar.tsx src/ui/HelpModal.tsx src/ui/CommandPalette.tsx && npx vitest run src/ui/docsUrl.test.ts`
Expected: tsc clean; Biome no errors (run `--write` on any formatting and re-check); 2 tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/ui/docsUrl.ts src/ui/docsUrl.test.ts src/ui/toolbar/icons.tsx src/ui/toolbar/Toolbar.tsx src/ui/HelpModal.tsx src/ui/CommandPalette.tsx
git commit -m "feat(ui): add User guide button (toolbar + Help modal + command palette)"
```

---

### Task 4: Author the user-guide content pages

Each page is Markdown under `docs/user/`. Write clear prose, numbered step lists, and `<kbd>` shortcut chips where relevant. Source the feature details from `README.md`, `CLAUDE.md`, and `src/` (don't invent behavior). Screenshots are added in Task 5 — leave an HTML comment placeholder `<!-- screenshot: <name> -->` where one belongs.

**Files (all Create):**
- `docs/user/getting-started.md`
- `docs/user/navigating.md`
- `docs/user/placing-furniture.md`
- `docs/user/finishes-and-materials.md`
- `docs/user/lighting-and-time.md`
- `docs/user/themes-and-appearance.md`
- `docs/user/importing-models.md`
- `docs/user/importing-textures.md`
- `docs/user/floor-plan-editor.md`
- `docs/user/room-editor.md`
- `docs/user/walkthrough-and-sun-study.md`
- `docs/user/design-tools.md`
- `docs/user/keyboard-shortcuts.md`
- `docs/user/tips-and-faq.md`

- [ ] **Step 1: Write `getting-started.md`**

Cover: what the app is (a Singapore HDB 4-room flat sandbox), the first-run experience (the move-in-ready default layout + onboarding carousel + location prompt), the screen layout (3D viewport, toolbar across the top, catalog drawer, nav cluster bottom-right), and a 60-second "place your first piece" walkthrough. Use this skeleton and fill every section with real prose:

```markdown
# Quick start

Sofa So Good is a browser sandbox of an accurate Singapore HDB 4-room flat. You
furnish it, finish the walls and floors, light it across the day, and walk
through it — nothing to install.

<!-- screenshot: app-overview -->

## What you see

- **3D viewport** — the flat, pre-furnished with a move-in-ready layout.
- **Toolbar** (top) — camera, view, scene, arrange, tools, and file actions.
- **Catalog** — open it with the <kbd>C</kbd> key or the Catalog button.
- **Nav cluster** (bottom-right) — compass, zoom, and minimap.

## Place your first piece

1. Open the catalog (<kbd>C</kbd>).
2. Search for a piece (e.g. "armchair").
3. Drag its card onto the floor. Press <kbd>R</kbd> while dragging to rotate.
4. Release to drop it. It snaps to the grid and avoids collisions.

## Next steps

- [Arrange furniture](/placing-furniture)
- [Repaint walls & floors](/finishes-and-materials)
- [Walk through your flat](/walkthrough-and-sun-study)
```

- [ ] **Step 2: Write `navigating.md`**

Cover orbit vs walk (<kbd>V</kbd>), mouse drag to orbit, wheel to zoom, the nav cluster (compass/zoom/minimap), Top view (<kbd>O</kbd>), Reset view (<kbd>H</kbd>), and double-click to focus a piece. Include a steps list for switching to Walk and moving with WASD.

- [ ] **Step 3: Write `placing-furniture.md`**

Cover: dragging from the catalog, the unified catalog (built-ins, generated, your uploads, IKEA, downloaded CC0, Poly Haven), category tabs + favourites (heart), search; the snap grid (toggle + 10/25/50 cm / 1 m via the toolbar), rotate (<kbd>R</kbd>) / flip (<kbd>F</kbd>) / duplicate (<kbd>⌘D</kbd>) / delete (<kbd>Del</kbd>); alignment guides + nearest-wall gap; multi-select align/distribute; grouping (Group/Ungroup, select-whole-group then drill-in); locking; "Complete with" combining (mattress→bed, sofa sections) via drag-snap or the inspector. Use step lists and `<kbd>` chips.

- [ ] **Step 4: Write `finishes-and-materials.md`**

Cover: clicking a wall/floor to open the finish picker, procedural finishes (wood/tile/marble/carpet/concrete/terrazzo/plaster/wallpaper/checker), wall accent picker, per-room floor finishes, applying a downloaded CC0 PBR material to furniture ("CC0 DLC" `mat:` finishes in the inspector), and the Finish-picker "Tidy up room" auto-arranger. Include an example: "Give the living room a marble floor and a feature wall."

- [ ] **Step 5: Write `lighting-and-time.md`**

Cover: time-of-day (the <kbd>T</kbd> cycle + Scene menu presets + the sun-direction compass), how the sun drives shadows/sky/ambient, and light fixtures glowing at night (Lights Auto/On/Off toggle). Example: "Set an evening scene and turn the lamps on."

- [ ] **Step 6: Write `themes-and-appearance.md`**

Cover the Appearance popover: 4 themes (Clay / Kampong / Porcelain / Estate) × Light/Dark/Auto, that the choice persists, and Auto follows the OS. One screenshot placeholder per a couple of themes.

- [ ] **Step 7: Write `importing-models.md`**

Cover the Upload model dialog: supported formats (`.glb`/`.gltf` plus `.obj`/`.fbx`/`.stl`/`.ply`/`.dae`/`.3mf`/`.usdz`), that non-GLB formats are **converted to GLB in your browser**, the in-browser optimize pass (weld/dedup/prune + Draco + WebP textures), the **Maximum compression (KTX2)** opt-in (falls back to WebP), drag-and-drop of loose files or whole folders, auto-detected IKEA group folders, the Category select (Auto), and background import progress. Worked example: "Import an OBJ chair (with its .mtl + textures)" as a step list. Note multi-file formats need their sibling files included in the same drop.

- [ ] **Step 8: Write `importing-textures.md`**

Cover the Upload material dialog: supported maps (PNG/JPG/WebP/BMP/TGA/TIFF/EXR/HDR, ≤4096², ≤16 MB), that exotic formats are decoded + re-encoded to WebP in the browser, albedo required + normal/roughness/AO optional, and that the imported material then appears as a furniture finish. Worked example: "Import a TGA wood albedo + normal and apply it to a table."

- [ ] **Step 9: Write `floor-plan-editor.md`**

Cover the 2D top-down editor (Arrange → Floor plan): drawing interior/exterior walls, rectangular rooms (auto area + total), doors/windows, grid + corner snapping, drag-move, per-room floor finishes, starter templates, and saving plans. Note a non-default plan re-renders the 3D flat and that collision follows it.

- [ ] **Step 10: Write `room-editor.md`**

Cover the per-room editor (View → "Edit room: …"): it isolates one room (clipped walls, camera-facing wall reveal), pins Performance render + Original assets, supports placement/measurement, and Walk is bounded to the room. Exit via the left-arrow toolbar button or <kbd>Esc</kbd>.

- [ ] **Step 11: Write `walkthrough-and-sun-study.md`**

Cover Walk mode (<kbd>V</kbd>, WASD + mouse-look, bounded by walls/doors), the auto Walkthrough tour + record, and the Sun study time-lapse (Tools menu).

- [ ] **Step 12: Write `design-tools.md`**

Cover the Tools/Arrange menus: Budget / shopping list (SGD) + Collections (favourites), Clearance & fit checks (door-swing), Sets (pre-arranged vignettes + IKEA set recipes), Presets/Style, Versions (save/restore/delete with thumbnails), Share & export (link + PNG snapshot), and the printable Report.

- [ ] **Step 13: Write `keyboard-shortcuts.md`**

A Markdown table of every shortcut. Source the labels/keys from `src/ui/HelpModal.tsx` `SHORTCUTS` and `src/controls/keybindings.ts` so they match the app exactly:

```markdown
# Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Command palette | <kbd>⌘K</kbd> |
| Toggle catalog | <kbd>C</kbd> |
| Rotate selection | <kbd>R</kbd> |
| Flip selection | <kbd>F</kbd> |
| Duplicate | <kbd>⌘D</kbd> |
| Delete | <kbd>Del</kbd> |
| Measurements | <kbd>M</kbd> |
| Tidy room | <kbd>L</kbd> |
| Top view | <kbd>O</kbd> |
| Reset view | <kbd>H</kbd> |
| Walk / orbit | <kbd>V</kbd> |
| Time of day | <kbd>T</kbd> |
| Undo / redo | <kbd>⌘Z</kbd> |
| Help | <kbd>?</kbd> |
```

(Before committing, open `src/controls/keybindings.ts` and reconcile any differences — the keybindings file is the source of truth.)

- [ ] **Step 14: Write `tips-and-faq.md`**

Cover the in-app tips (drag-to-place + <kbd>R</kbd>, click a wall to repaint, Walk for scale, Appearance for themes) and a short FAQ: "Where are my designs saved?" (browser autosave + Versions), "Is my data uploaded?" (no — imports/conversion run in your browser), "Why is the default look flat?" (Performance tier for instant load; raise it in Graphics), "Can I use my own models/textures?" (yes — see the import guides).

- [ ] **Step 15: Verify the docs build with all pages**

Run: `npm run docs:build`
Expected: exits 0, no dead-link warnings for the sidebar/nav links. Fix any broken internal links VitePress reports.

- [ ] **Step 16: Commit**

```bash
git add docs/user
git commit -m "docs: author user-guide content pages"
```

---

### Task 5: Capture and embed screenshots

Use the existing Puppeteer harness. **Coordinate with the concurrent session first** (see Step 1) because the harness uses a dev server on port 5173.

**Files:**
- Create: `docs/user/public/screenshots/*.png`
- Modify: the `docs/user/*.md` pages (replace `<!-- screenshot: name -->` placeholders with `![alt](/screenshots/name.png)`)

- [ ] **Step 1: Check for a running dev server / concurrent session**

Run: `head -n 10 /home/cwlroda/.cursor/projects/home-cwlroda-projects-sofa-so-good/terminals/*.txt 2>/dev/null; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/ || echo none`
If a concurrent session's dev server is on 5173, start the harness's server on a **different** port instead of killing it: run the app dev server with `npm run dev -- --port 5273` and capture against `http://localhost:5273/`. Do **not** `pkill` a server you didn't start.

- [ ] **Step 2: Ensure the screenshot output dir exists**

Run: `mkdir -p docs/user/public/screenshots`

- [ ] **Step 3: Capture the app-overview screenshot**

Drive the harness against the running dev server. Example (adjust port/URL to Step 1):

Run: `node scripts/shot.mjs docs/user/public/screenshots/app-overview.png 3500`
Expected: a PNG is written. Open it with the Read tool and confirm it shows the furnished flat + toolbar (not a blank/black canvas). If blank, increase the wait ms and/or invalidate a render (see `docs/visual-verification-playbook.md`).

- [ ] **Step 4: Capture the remaining screenshots referenced by the pages**

For each `<!-- screenshot: name -->` placeholder, drive the relevant UI (open catalog, finish picker, upload dialog, appearance popover, etc.) via `scripts/shot.mjs` actions and `window.__store`, saving to `docs/user/public/screenshots/<name>.png`. Read each PNG back and confirm it shows the intended UI before using it. Keep the set small and high-value (overview, catalog, finishes, import dialog, appearance, walk) — text-heavy pages don't all need images.

- [ ] **Step 5: Replace placeholders with image embeds**

In each page, replace `<!-- screenshot: name -->` with `![Descriptive alt text](/screenshots/name.png)`. (VitePress serves `public/` at the site root, so the path is `/screenshots/...`.)

- [ ] **Step 6: Rebuild and verify images resolve**

Run: `npm run docs:build`
Expected: exits 0; `ls dist/docs/screenshots/` lists the PNGs (VitePress copies `public/` into the output).

- [ ] **Step 7: Stop any dev server you started**

If you launched a server in Step 1, stop only that one (by the PID you started). Leave the concurrent session's server alone.

- [ ] **Step 8: Commit**

```bash
git add docs/user
git commit -m "docs: add user-guide screenshots"
```

---

### Task 6: Author the developer guide

**Files (all Create under `docs/developer/`):**
- `index.md`, `architecture.md`, `state-management.md`, `rendering-and-scene.md`, `furniture-catalog.md`, `materials-and-finishes.md`, `import-pipeline.md`, `apartment-and-floorplan.md`, `ui-and-design-system.md`, `packs-and-remote-catalog.md`, `testing-and-verification.md`, `offline-tooling.md`, `adding-features.md`

Each guide distills the relevant `CLAUDE.md` section + source files and links to the authoritative `docs/superpowers/specs/*`. Keep each focused; link rather than duplicate.

- [ ] **Step 1: Write `index.md`**

Overview of the docs set + a map of the guides + pointers to `CLAUDE.md` (the dense architecture guide), `README.md`, and `docs/superpowers/specs/`. State explicitly that these docs are **not** deployed (the user guide under `docs/user/` is the deployed one). Use this skeleton:

```markdown
# Developer guide

Maintainer-facing documentation for Sofa So Good. These pages are **not
deployed** — the deployed user guide lives in `docs/user/` and ships at
`/sofa-so-good/docs/`.

Start with [Architecture](./architecture.md), then dive into the system you're
touching. `CLAUDE.md` at the repo root is the terse, always-current architecture
index; these guides expand on it with rationale and how-to recipes. Design
history lives under `docs/superpowers/specs/`.

## Guides
- [Architecture](./architecture.md)
- [State management](./state-management.md)
- [Rendering & scene](./rendering-and-scene.md)
- [Furniture catalog](./furniture-catalog.md)
- [Materials & finishes](./materials-and-finishes.md)
- [Import pipeline](./import-pipeline.md)
- [Apartment & floor plan](./apartment-and-floorplan.md)
- [UI & design system](./ui-and-design-system.md)
- [Packs & remote catalog](./packs-and-remote-catalog.md)
- [Testing & verification](./testing-and-verification.md)
- [Offline tooling](./offline-tooling.md)
- [Adding features](./adding-features.md)
```

- [ ] **Step 2: Write `architecture.md`**

Tech stack (React 19 + R3F + three + Zustand + Vite), the `src/` module map (mirror the CLAUDE.md "Layout of the code" list, condensed), the boot sequence (`main.tsx` registers GLB decoders → renders immediately → `runBootstrap()` hydrates IDB/packs/autosave → `bootPhase` ready), and the two `<Canvas>` setup (main scene + room editor). Link to `CLAUDE.md`.

- [ ] **Step 3: Write `state-management.md`**

The Zustand store split into slices (`src/state/slices/*`) — list each slice and its responsibility; persistence + migrations under `storage/` (layout autosave, qualityPrefs, editorPrefs, appearancePrefs, floorPlanStore, hydrate*); `schema.ts` save/load serializer (v2 groupId migration). Point at the slice files.

- [ ] **Step 4: Write `rendering-and-scene.md`**

`src/scene/`: the Canvas + systems (lighting/time via SunCalc → altitudeCurve, hemisphere fill, IBL probe, FurnitureLights, Sky), Effects (bloom/SMAA), the `RenderTier` (Performance default → Medium → High → Maximum) vs `AssetTier` LOD axis, `QualityController` adaptive 30fps step-down, ContextLossGuard, ScreenshotController, and the render-on-demand `frameloop=demand` pump.

- [ ] **Step 5: Write `furniture-catalog.md`**

Parametric primitives (`primitives/` + `PrimitiveKind` + `builtinCatalog.ts`), GLB items (bundled CC0, user, IKEA) via `GltfModel`/`gltfRender.ts`, the merged catalog (`catalog.ts` + `useCatalogGetter`/`useUnifiedCatalog`), `lightEmitters.ts`, height-aware collision flags (`verticalSpan`/`mounted`/`noClip`), and the 15 categories. Cross-link `adding-features.md`.

- [ ] **Step 6: Write `materials-and-finishes.md`**

`src/materials/`: procedural generators + world-space UVs, `furnitureMaterials.ts` helpers (always pass a real `Material`), the `mat:<id>` DLC resolver + `FurnitureMaterialLoader`, and the texture `convert/` decode+re-encode path. Link the multi-format spec.

- [ ] **Step 7: Write `import-pipeline.md`**

The whole import story: user GLB upload (`furniture/upload/` — validate/persist/bulkImport/hashFile/readDrop/runImport, batched commits, background job), multi-format conversion (`furniture/convert/`) + optimize (`furniture/optimize/`, worker), IKEA import (`furniture/ikea/`), and texture normalization (`materials/convert/`). Link `docs/superpowers/specs/2026-06-04-multi-format-import-conversion-design.md` and the IKEA specs.

- [ ] **Step 8: Write `apartment-and-floorplan.md`**

`apartment/constants.ts` (source of truth for walls/doors/windows/rooms), the default flat vs `PlanShell`, `floorplan/` model + 2D editor, the per-room editor (`RoomEditorScene`/`roomShell`), and collision (`collision/placement.ts`, plan + room collision walls). Link the per-room and floor-plan specs.

- [ ] **Step 9: Write `ui-and-design-system.md`**

`src/styles/` token system (8 OKLCH palettes via `[data-theme]`/`[data-mode]`), the `.panel`/`.btn`/`.toolbar` vocabulary, the toolbar icon-island (`ui/toolbar/`), panels/inspector/cmdk/context-menu, responsive/`body.mobile` bottom-sheets, and where the docs button lives (`ui/docsUrl.ts` + toolbar/HelpModal/CommandPalette). Link the toolbar + design specs.

- [ ] **Step 10: Write `packs-and-remote-catalog.md`**

The Packs registry (`catalog/packs/registry.ts`, `kind` discriminator, `visiblePacks(isDev)`, dev-only gating), Poly Pizza prod client, remote providers (Poly Haven prod / ambientCG dev-proxy), and the IKEA live-scrape sidecar. Explain the CORS gating rule + how to add a source. Link the DLC/CC0/multi-provider specs.

- [ ] **Step 11: Write `testing-and-verification.md`**

`npm test` (Vitest), the visual-verification requirement + `scripts/shot.mjs` harness (link `docs/visual-verification-playbook.md`), Biome (`check`/`check:fix`, pre-commit hook), and CI/deploy (`ci.yml` format/tsc/lint; `deploy.yml` `build:all` → Pages). Note the `docs:dev`/`docs:build`/`build:all` scripts and the `/docs` dev caveat.

- [ ] **Step 12: Write `offline-tooling.md`**

`python/scripts/` (IKEA scraper, glb_analysis, categorize, compatibility, optimize_glb_lod.mjs), `scripts/` (index-assets, fetch-assets, scraper-server, asset-pipeline), and the npm wrappers (`optimize:glb`, `compress:glb-textures`, `index-assets`, `scraper-server`). Note these are offline, not part of the app build, and Python uses `python3` / 3.10+ typings.

- [ ] **Step 13: Write `adding-features.md`**

Concrete recipes with file paths, each as a numbered checklist: add a furniture primitive (primitives/ + index + PrimitiveKind + builtinCatalog + flags + defaults + light emitter), add a finish (materials/builtinCatalog + generators), add a category (the exhaustive `Record<FurnitureCategory,…>` consumers + CategoryTabs/CategoryIcon), add a bundled GLB (`public/assets/furniture/` + sidecar + `npm run index-assets`), and add a downloadable source (Poly-Pizza-style client or `RemoteProvider` or `manual` registry entry). Mirror the CLAUDE.md "Adding content" rules.

- [ ] **Step 14: Commit**

```bash
git add docs/developer
git commit -m "docs: add developer guide (architecture, systems, how-to recipes)"
```

---

### Task 7: Cross-link from README/CLAUDE + final gates + visual check

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Link the docs from `README.md`**

Add a short "Documentation" section (near the top features or the offline-tooling section) pointing users to the deployed user guide (`/sofa-so-good/docs/`, also reachable via the in-app **User guide** button) and maintainers to `docs/developer/`.

- [ ] **Step 2: Note the docs system in `CLAUDE.md`**

Add a concise entry to the Commands section for `npm run docs:dev` / `docs:build` / `build:all` (user guide is VitePress under `docs/user/` → built into `dist/docs` and deployed at `/sofa-so-good/docs/`; developer docs under `docs/developer/` are not deployed), and mention the in-app **User guide** button (`src/ui/docsUrl.ts`). Respect the "keep CLAUDE.md + README current" rule.

- [ ] **Step 3: Full gates**

Run: `npm run check:fix && npx tsc --noEmit && npm test`
Expected: Biome clean; tsc clean; tests pass (the only acceptable failure is the known pre-existing `importGroup` thumbnail test — confirm it fails identically on the base commit and is unrelated to these changes).

- [ ] **Step 4: Build everything**

Run: `npm run build:all`
Expected: `dist/index.html` and `dist/docs/index.html` both exist.

- [ ] **Step 5: Visual verification of the in-app button**

With a dev server running (reuse or a non-clashing port per Task 5 Step 1), capture the toolbar showing the new **User guide** book button next to Help, and open the Help modal to confirm the "full user guide ↗" link. Save to `/tmp/docs-button.png`, read it back, and confirm the button renders correctly. Also run `npm run docs:preview` and confirm the user guide renders at the configured base with working nav/search.

- [ ] **Step 6: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: cross-link user + developer guides from README and CLAUDE"
```

---

## Self-review notes

- **Spec coverage:** VitePress user docs at `/sofa-so-good/docs/` (Tasks 1–2, 4–5); developer `docs/developer/` tree (Task 6); in-app help button in all three surfaces (Task 3); captured screenshots (Task 5); README/CLAUDE updates (Task 7). All spec sections map to a task.
- **Ordering:** `build:all` runs the app build before the docs build so `dist/` being emptied can't wipe the docs (Tasks 1–2).
- **Concurrency:** every `git add` lists explicit files; Task 5 explicitly avoids killing a server the concurrent session owns.
- **Types:** `DOCS_URL`/`openDocs` defined in Task 3 Step 3 and used identically in Steps 6–8; `Icon.Book` defined in Step 5 and referenced in Steps 6–8.
