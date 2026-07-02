# Batch 1 — UI/UX polish quick wins

> **Orchestrator amendment (2026-07-02):** This worktree branches from origin/main (v0.9.0.61).
> **Task 8 (P31) is DEFERRED** — it locks behaviour shipped only on the unmerged
> `claude/fix-pinch-zoom-flicker` branch (`runImport.ts` / `coalesceProgress` do not exist here).
> Re-run Task 8 after that branch merges. Task 9's upload-progress screenshot step stays (it
> drives `notify.update({progress})` directly; the determinate bar renderer exists on main).
> Version bumps: Tasks 1–7 use 0.9.0.72→0.9.0.78 as written; Task 9 uses **0.9.0.79**.
> Line numbers were read from the pinch-zoom checkout — implementers MUST re-locate by content.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Ship the 8 "quick win" polish items (P14, P21, P11, P22, P24, P33, P30, P31) from the TODO "UI/UX polish program — Batch 1" onto the existing OKLch token system. Each item is small, isolated, and either pure-CSS-token work or a thin behavioural addition on top of infrastructure that already exists (the toast action-button API, the determinate progress bar, the Tooltip shortcut chip). No new abstractions; no framework migration.

## Architecture

- **Tokens** live in `src/styles/tokens.css` (`:root` block) and are consumed by component classes.
- **Component classes** live in `src/styles/components.css` (`.btn`, `.icon-btn`, `.tool-btn`, `.tab`, `.input`, `.num`, `.tip`, `.menu-item`, `.modal-overlay > .panel`), `src/styles/parts.css` (`.chip`, `.select-trigger`, `.cat-card .nm`, `.budget-hud`, `#helpPanel`), `src/styles/app.css` (`.fld .val`, `.menu-item .mi-*`, `.tip-box`), and `src/styles/features.css` (`.toast`, `.bud-bar`, `.lyr-nm`).
- **Focus** is already governed by one shared `:where(...):focus-visible` rule (components.css) plus control-specific `box-shadow` rings (`.input:focus`, `.num input:focus`) and `.cat-card:focus-visible` (parts.css). P14 tokenises these.
- **Shortcuts registry**: `src/controls/keybindings.ts` (`KEYBINDINGS`) → `src/ui/toolbar/shortcuts.ts` (`shortcutLabel(id)`, returns e.g. `'Ctrl Z'` / `'M'`) → consumed by `IconButton`/`Tooltip` (`shortcut` prop → `.tip-box .sk` chip) and by menu items via the local `chip()` helper as inline text.
- **Notifications**: `src/state/slices/notificationsSlice.ts` (`notify.start` supports `actionLabel`/`onAction`, `kind:'progress'` gets `progress:0`; `notify.update({progress})`) → rendered by `src/ui/notifications/NotificationContainer.tsx` (already renders the determinate `role="progressbar"` `.bud-bar`/`.bud-seg` from `n.progress`, and the `.toast-act` action button from `actionLabel`/`onAction`).
- **Deletion**: `deleteItem(id)` in `src/state/slices/itemsSlice.ts` (~line 160) pushes a coalesced history step and removes the item; it does NOT currently notify. Callers: `App.tsx`, `ContextMenu.tsx`, `InspectorPanel.tsx`, `MultiSelectPanel.tsx`, `LayersPanel.tsx`, `FinishPicker.tsx`.
- **Modals**: `src/ui/Modal.tsx` takes a numeric `width` prop applied inline as `{ width, maxWidth: 'calc(100vw - 24px)' }`. Ad-hoc widths also live in CSS (`components.css` `.modal-overlay > .panel { width: 360px; … }`, `parts.css` `#helpPanel { width: min(432px, …) }`) and inline in `LocationPrompt.tsx`, `GraphicsSettings.tsx`.

## Tech Stack

React 18 + TypeScript, Zustand sliced store (`src/state/store.ts`, `window.__store`), Vite, Vitest + @testing-library/react (jsdom), Biome (2-space / 100-col / single-quote / no-semicolons). Pure OKLch CSS token system across 5 themes × light/dark. Visual verification via `node scripts/shot.mjs --scenario <file.json>` (see `docs/visual-verification-playbook.md`).

## Global Constraints

- **No hardcoded colours anywhere** — use the CSS token vocabulary only (`--accent`, `--danger`, `--surface-*`, `--text-*`, `color-mix(... var(--accent) ...)`). Never a colour literal or Tailwind colour utility. Every surface must work in light + dark + all 5 themes.
- **Feature flags**: pure-CSS polish is NOT a feature and needs no `FEATURE_FLAGS` entry (P14, P21, P11, P22, P24, P33 are pure-CSS/tooltip presentation). **P30 ruling: NO new flag.** P30 adds an "Undo" action button to a toast that fires after a delete. It (a) reuses the already-shipped, already-user-facing toast action API (`actionLabel`/`onAction`, live for update/style toasts), (b) is a purely additive, reversible convenience over an action the user just performed, and (c) has no analytical/professional surface. It matches the existing shipped pattern in `StyleTransferModal.tsx` / `StyleQuizModal.tsx` (both call `notify.start({..., actionLabel:'Undo', onAction: () => undo()})` un-flagged). So: no flag. Still tested in both Simple and Pro modes because deletion is reachable in both.
- **Simple/Pro**: any item whose visibility/behaviour depends on `uiMode` is tested in both modes. Deletion (P30), undo/redo (P24/P33) and the toolbar exist in both modes, so their added tests assert both modes where behaviour could differ.
- **Tests**: while iterating run only targeted tests: `npx vitest --run <paths>`. Run the full suite exactly once right before each commit (the pre-commit hook runs `npm test` + `tsc` + `biome`). CSS-only changes that can't be unit-tested get a concrete grep/computed-style verification step (this repo has no CSS-computed-style test harness, so pure-CSS token tasks use a `grep` assertion + the batch's one visual-verification task).
- **Versioning**: every commit bumps `APP_VERSION` build in `src/version.ts` AND adds a `CHANGELOG.md` entry (newest first, `## TYPE: summary (vX)` header + bullets). Commits below bump build sequentially `0.9.0.72` → `0.9.0.78`, Task 9 → `0.9.0.79`. Keep `package.json` first-three-parts in sync (unchanged here — only the build increments).
- **Commit convention** (from `git log --oneline`): `TYPE: summary`, TYPE ∈ `FEAT|FIX|CHORE|REFACTOR|DOCS|PERF`. One focused change per commit.
- **Visual verification** after app changes: one final task (Task 9) covers the whole batch.

---

### Task 1: P14 — Unified focus-ring token

**Files:**
- Modify `src/styles/tokens.css` — add token inside `:root` (near `--ease`/`--dur`).
- Modify `src/styles/components.css` — shared `:focus-visible` rule; `.input:focus`; `.num input:focus`.
- Modify `src/styles/parts.css` — `.cat-card:focus-visible`; `.select-trigger` focus (add rule).
- Test (verification): Create `src/styles/focusRing.test.ts` — grep-style assertion over the CSS files.

**Interfaces:**
- Produces CSS custom property `--focus-ring` (a full `box-shadow`-compatible ring value) and `--focus-ring-w`.
- Consumes existing `--accent`.

**Steps:**

- [ ] Write the verification test `src/styles/focusRing.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'

  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P14 unified focus ring', () => {
    it('defines --focus-ring in tokens.css as a 3px accent color-mix', () => {
      const tokens = read('./tokens.css')
      expect(tokens).toMatch(/--focus-ring-w:\s*3px/)
      expect(tokens).toMatch(/--focus-ring:[^;]*color-mix\([^;]*var\(--accent\)/)
    })
    it('applies --focus-ring via a shared :focus-visible rule over every control class', () => {
      const parts = read('./parts.css')
      const components = read('./components.css')
      const css = components + parts
      for (const sel of ['.btn', '.icon-btn', '.tool-btn', '.input', '.select-trigger', '.chip', '.tab']) {
        expect(css).toContain(`${sel}:focus-visible`)
      }
      expect(components).toMatch(/box-shadow:\s*var\(--focus-ring\)/)
    })
    it('hardcodes no colour literals in the new focus block', () => {
      const components = read('./components.css')
      const block = components.slice(components.indexOf('--- Unified focus ring'))
      expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    })
  })
  ```
- [ ] Run it, expect failure: `npx vitest --run src/styles/focusRing.test.ts` → fails (no `--focus-ring` token, no `.select-trigger:focus-visible`, marker comment absent).
- [ ] Implement in `src/styles/tokens.css`, inside `:root` after `--dur`:
  ```css
  /* Unified keyboard focus ring (P14): a 3px soft-accent halo, one token so
     every control matches. color-mix keeps it on-theme in all 5 palettes. */
  --focus-ring-w: 3px;
  --focus-ring: 0 0 0 var(--focus-ring-w) color-mix(in oklch, var(--accent) 45%, transparent);
  ```
- [ ] Implement in `src/styles/components.css`. Replace the shared `:where(...):focus-visible` rule so it emits the token ring; keep zero specificity via `:where()` and add the control classes explicitly so the ring lands on classed controls that aren't semantic buttons (`.chip`, `.tab`, `.select-trigger`):
  ```css
  /* --- Unified focus ring (P14) ------------------------------------
     One accent halo across every interactive control (WCAG 2.4.7).
     `:where()` keeps zero specificity so control-specific rings still win
     where a control wants a different treatment; `:focus-visible` shows it
     for keyboard/AT focus only. */
  :where(button, [role='button'], [role='menuitem'], [role='menuitemcheckbox'],
    [role='option'], [role='tab'], summary, [tabindex='0'],
    .btn, .icon-btn, .tool-btn, .chip, .tab, .select-trigger):focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  ```
  Then update `.input:focus` and `.num input:focus` to reuse the token instead of the ad-hoc `0 0 0 3px var(--accent-soft)`:
  ```css
  .input:focus { outline: none; border-color: var(--accent); background: var(--surface-solid); box-shadow: var(--focus-ring); }
  ```
  ```css
  .num input:focus { outline: none; border-color: var(--accent); background: var(--surface-solid); box-shadow: var(--focus-ring); }
  ```
  (Preserve each rule's existing non-ring declarations — re-locate by content.)
- [ ] Implement in `src/styles/parts.css`. Replace `.cat-card:focus-visible` to use the halo instead of the double `outline`+`border-color`, and add an explicit `.select-trigger:focus-visible`:
  ```css
  .cat-card:focus-visible { outline: none; box-shadow: var(--focus-ring); border-color: var(--accent); }
  ```
  ```css
  .select-trigger:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  ```
- [ ] Bump `src/version.ts` `APP_VERSION` to `'0.9.0.72'`.
- [ ] Add `CHANGELOG.md` entry at top: `## FEAT: unified --focus-ring token across all controls (v0.9.0.72)` with bullets describing the single 3px accent color-mix halo replacing per-control rings.
- [ ] Run tests: `npx vitest --run src/styles/focusRing.test.ts` → passes.
- [ ] Commit: `git commit -am "FEAT: unified --focus-ring token across .btn/.icon-btn/.tool-btn/.input/.select-trigger/.chip/.tab (v0.9.0.72)"`.

---

### Task 2: P21 — Tabular numerals

**Files:**
- Modify `src/styles/components.css` — `.num input` rule.
- Modify `src/styles/app.css` — `.fld .val` and `.fld .val-edit input` rules.
- Modify `src/styles/parts.css` — `.budget-hud-spent`, `.budget-hud-target`, `.budget-hud-delta`.
- Test (verification): Create `src/styles/tabularNums.test.ts`.

**Interfaces:** consumes nothing new; adds `font-variant-numeric: tabular-nums` declarations. Note dimension readouts already use `.mono` which sets `font-feature-settings: 'tnum' 1` (components.css) — no change needed there; assert it stays.

**Steps:**

- [ ] Write `src/styles/tabularNums.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'

  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P21 tabular numerals', () => {
    it('sets tabular-nums on .fld .val, .num input and budget HUD readouts', () => {
      const app = read('./app.css')
      const components = read('./components.css')
      const parts = read('./parts.css')
      expect(app).toMatch(/\.fld \.val\b[^}]*font-variant-numeric:\s*tabular-nums/s)
      expect(components).toMatch(/\.num input\b[^}]*font-variant-numeric:\s*tabular-nums/s)
      expect(parts).toMatch(/\.budget-hud-spent[^}]*font-variant-numeric:\s*tabular-nums/s)
    })
    it('keeps dimension readouts tabular via .mono tnum', () => {
      expect(read('./components.css')).toMatch(/\.mono\b[^}]*font-feature-settings:\s*'tnum'\s*1/s)
    })
  })
  ```
- [ ] Run it, expect failure: `npx vitest --run src/styles/tabularNums.test.ts` → fails (no `tabular-nums` on those selectors).
- [ ] Implement `src/styles/app.css`: add `font-variant-numeric: tabular-nums;` to the `.fld .val` block and to `.fld .val-edit input`.
- [ ] Implement `src/styles/components.css`: add `font-variant-numeric: tabular-nums;` inside the existing `.num input` rule.
- [ ] Implement `src/styles/parts.css`: add `font-variant-numeric: tabular-nums;` to `.budget-hud-spent`, `.budget-hud-target` and `.budget-hud-delta` — the three numeric rows that jitter as the spend total ticks during a drag. (If these selectors don't exist on this base, find the budget HUD numeric selectors in parts.css by content and apply there.)
- [ ] Bump `src/version.ts` to `'0.9.0.73'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: tabular numerals on numeric readouts (v0.9.0.73)` — kills digit-width jitter on `.fld .val`, `.num` inputs and the budget HUD during drags/edits.
- [ ] Run tests: `npx vitest --run src/styles/tabularNums.test.ts` → passes.
- [ ] Commit: `git commit -am "FEAT: font-variant-numeric tabular-nums on .num/.fld .val/budget HUD (v0.9.0.73)"`.

---

### Task 3: P11 — Modal width tokens

**Files:**
- Modify `src/styles/tokens.css` — add `--modal-sm/-md/-lg` (after the `--focus-ring` block from Task 1).
- Modify `src/styles/components.css` — `.modal-overlay > .panel` default stays 360px (no token needed).
- Modify `src/styles/parts.css` — `#helpPanel` width → `var(--modal-sm)`.
- Modify `src/ui/Modal.tsx` — allow `width` to accept a token string; numeric fallback preserved.
- Modify callers: `src/ui/SwapModal.tsx` (`width={560}`), `src/ui/StyleQuizModal.tsx` (`width={560}`), `src/ui/PanoramaModal.tsx` (`width={720}`), `src/ui/StyleTransferModal.tsx` (`width={720}`), `src/ui/notifications/NotificationContainer.tsx` (`width={480}`), `src/ui/LocationPrompt.tsx` (inline `min(420px,…)`), `src/ui/GraphicsSettings.tsx` (leave `width: 320` — intentional, below the sm tier). Re-locate all by content; caller set may differ slightly on this base.
- Test: Modify `src/ui/Modal.test.tsx` (file exists).

**Interfaces:**
- Produces tokens `--modal-sm` (`min(432px, calc(100vw - 24px))`), `--modal-md` (`min(560px, calc(100vw - 24px))`), `--modal-lg` (`min(720px, calc(100vw - 24px))`).
- `Modal` prop `width?: number | string` — when a string, applied directly (token); when a number, applied as px with the existing clamp.

**Steps:**

- [ ] Read `src/ui/Modal.test.tsx` fully. Add a failing test asserting a string width passes through unclamped:
  ```ts
  it('accepts a token string width and applies it directly', () => {
    render(<Modal open onClose={() => {}} title="T" width="var(--modal-md)">x</Modal>)
    const panel = document.querySelector('.modal-overlay > .panel') as HTMLElement
    expect(panel.style.width).toBe('var(--modal-md)')
  })
  ```
  (Match the existing test file's render helpers/props exactly.)
- [ ] Run it, expect failure: `npx vitest --run src/ui/Modal.test.tsx` → fails (type error / width applied as px).
- [ ] Implement tokens in `src/styles/tokens.css`, inside `:root`:
  ```css
  /* Modal panel widths (P11) — replaces ad-hoc min(560px…)/min(432px…). Each
     clamps to the viewport so it never overflows a narrow phone. */
  --modal-sm: min(432px, calc(100vw - 24px));
  --modal-md: min(560px, calc(100vw - 24px));
  --modal-lg: min(720px, calc(100vw - 24px));
  ```
- [ ] Implement `src/ui/Modal.tsx`: change `width?: number` to `width?: number | string` and update the inline style:
  ```tsx
  style={
    width != null
      ? typeof width === 'string'
        ? { width }
        : { width, maxWidth: 'calc(100vw - 24px)' }
      : undefined
  }
  ```
- [ ] Update callers to tokens: `SwapModal` `width={560}` → `width="var(--modal-md)"`; `StyleQuizModal` `width={560}` → `width="var(--modal-md)"`; `PanoramaModal` `width={720}` → `width="var(--modal-lg)"`; `StyleTransferModal` `width={720}` → `width="var(--modal-lg)"`; `NotificationContainer` `width={480}` → `width="var(--modal-sm)"` (480 rounds to the small tier; the details list is short). `LocationPrompt` inline `min(420px, calc(100vw - 24px))` → `var(--modal-sm)`. `GraphicsSettings` keeps `width: 320` (narrow settings popover, intentionally below `--modal-sm` — note in changelog).
- [ ] Update CSS: `parts.css` `#helpPanel { width: min(432px, calc(100vw - 24px)); }` → `#helpPanel { width: var(--modal-sm); }`.
- [ ] Bump `src/version.ts` to `'0.9.0.74'`.
- [ ] Add `CHANGELOG.md` entry: `## REFACTOR: --modal-sm/-md/-lg width tokens (v0.9.0.74)` — replaces ad-hoc modal widths across SwapModal, StyleQuizModal, PanoramaModal, StyleTransferModal, notification details, LocationPrompt, #helpPanel.
- [ ] Run tests: `npx vitest --run src/ui/Modal.test.tsx` → passes.
- [ ] Commit: `git commit -am "REFACTOR: --modal-sm/-md/-lg tokens replace ad-hoc modal widths (v0.9.0.74)"`.

---

### Task 4: P22 — Truncation affordance

**Files:**
- Modify `src/ui/catalog/LayersPanel.tsx` — the `.lyr-nm` span.
- Modify `src/ui/glbEditor/GlbDesignerDialog.tsx` — any `.lyr-nm` without a `title` (one already has it).
- Modify `src/ui/Modal.tsx` — `.panel-title`: add `title={title}`.
- Note: `.cat-card .nm` already has `title` in both `CatalogCard.tsx` and `RemoteCard.tsx` — no change, regression coverage only.
- Test: Create `src/ui/catalog/LayersPanel.truncation.test.tsx`.

**Interfaces:** consumes `itemLabel(it)` (already imported in LayersPanel) and the `title` prop of Modal.

**Steps:**

- [ ] Write `src/ui/catalog/LayersPanel.truncation.test.tsx`. Seed the store with one item, render, assert the `.lyr-nm` element carries a `title` equal to its text:
  ```tsx
  import { render } from '@testing-library/react'
  import { beforeEach, describe, expect, it } from 'vitest'
  import { useStore } from '../../state/store'
  import { LayersPanel } from './LayersPanel'

  describe('P22 layers row truncation affordance', () => {
    beforeEach(() => {
      useStore.setState({
        layersOpen: true,
        items: [{ id: 'i1', defId: 'sofa-2seat', x: 0, z: 0, rotation: 0, roomId: 'r1' } as never],
      })
    })
    it('gives each .lyr-nm a title so the full label is hover-recoverable', () => {
      const { container } = render(<LayersPanel />)
      const nm = container.querySelector('.lyr-nm') as HTMLElement
      expect(nm).not.toBeNull()
      expect(nm.getAttribute('title')).toBe(nm.textContent)
    })
  })
  ```
  (Verify the exact store keys and the minimal `Item` shape by reading the top of `LayersPanel.tsx` before finalising the seed; adjust to whatever `itemLabel` needs. Check whether LayersPanel is a named or default export.)
- [ ] Run it, expect failure: `npx vitest --run src/ui/catalog/LayersPanel.truncation.test.tsx` → fails (no `title` attribute).
- [ ] Implement `LayersPanel.tsx`:
  ```tsx
  <span className="lyr-nm" title={itemLabel(it)}>{itemLabel(it)}</span>
  ```
- [ ] Implement `GlbDesignerDialog.tsx` — add `title` to any `.lyr-nm` span lacking one, mirroring its rendered text expression.
- [ ] Implement `Modal.tsx`:
  ```tsx
  <div className="panel-title" title={title}>{title}</div>
  ```
  (If `title` can be a ReactNode, only set the attribute when it is a string.)
- [ ] Bump `src/version.ts` to `'0.9.0.75'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: truncation affordance — hover-recoverable full names (v0.9.0.75)` — `title` on `.lyr-nm` (layers + GLB designer) and modal `.panel-title`; catalog card names already carry it.
- [ ] Run tests: `npx vitest --run src/ui/catalog/LayersPanel.truncation.test.tsx src/ui/Modal.test.tsx` → passes.
- [ ] Commit: `git commit -am "FEAT: title attr on truncated .lyr-nm + .panel-title for hover recovery (v0.9.0.75)"`.

---

### Task 5: P24 — Shortcut hints in tooltips & menus

**Files:**
- Modify `src/ui/toolbar/ToolbarMenu.tsx` — add optional `kbd` prop to `MenuItem` (interface + render).
- Modify `src/styles/app.css` — add a `.menu-item .mi-kbd` right-aligned chip style (and a reusable bare `.kbd` rule if one doesn't exist).
- Modify `src/ui/toolbar/menus/EditMenu.tsx` — replace the inline `chip(shortcutLabel('togglePlanEditor'))` label suffix with the `kbd` prop; delete the unused local `chip()` helper.
- Modify `src/ui/toolbar/menus/FileMenu.tsx` — audit against `KEYBINDINGS`; pass `kbd={shortcutLabel(<id>)}` only on rows with a real binding.
- Note: toolbar buttons already append the combo (`IconButton` → `Tooltip` `shortcut` prop → `.tip-box .sk`). This task extends the same combo source to menus.
- Test: Modify `src/ui/toolbar/shortcuts.test.ts` (exists) to lock label format; Create `src/ui/toolbar/menus/EditMenu.kbd.test.tsx`.

**Interfaces:**
- Consumes `shortcutLabel(id: KeybindingId): string` from `src/ui/toolbar/shortcuts.ts`.
- Produces `MenuItem` prop `kbd?: string` and CSS class `.mi-kbd` (a `.kbd`-styled right-aligned chip).

**Steps:**

- [ ] Write `src/ui/toolbar/menus/EditMenu.kbd.test.tsx` — render `EditMenu` with the floor-plan-editor feature enabled and assert the "Floor plan editor" row renders a `.mi-kbd` chip with the binding label, not inline `(P)` text:
  ```tsx
  import { render, screen } from '@testing-library/react'
  import { describe, expect, it } from 'vitest'
  import { EditMenu } from './EditMenu'

  describe('P24 menu shortcut chips', () => {
    it('renders the floor-plan-editor shortcut as a right-aligned .mi-kbd chip', () => {
      // enable the flag via the repo's real mechanism — read featureFlags.ts:
      // either setFeatureFlagOverrides({...}) or uiMode + reresolveFeatureFlags()
      const { container } = render(<EditMenu />)
      screen.getByRole('button', { name: 'Edit' }).click()
      const chip = container.querySelector('.mi-kbd') as HTMLElement
      expect(chip?.textContent).toBe('P')
      expect(screen.queryByText(/Floor plan editor\s*\(/)).toBeNull()
    })
  })
  ```
  (Confirm the real flag-override helper by reading `src/features/featureFlags.ts`; confirm how ToolbarMenu opens; confirm the actual binding label via `shortcutLabel('togglePlanEditor')`. Adapt as needed — the assertion that matters: `.mi-kbd` chip content equals the registry label, and the old inline "(P)" text is gone.)
- [ ] Run it, expect failure: `npx vitest --run src/ui/toolbar/menus/EditMenu.kbd.test.tsx` → fails (no `.mi-kbd`, still inline `(P)`).
- [ ] Implement `ToolbarMenu.tsx` `MenuItem`: add `kbd?: string` to the props type; destructure it; after the `.mi-text` span render:
  ```tsx
  {kbd ? <span className="mi-kbd kbd">{kbd}</span> : null}
  ```
- [ ] Implement `src/styles/app.css` — right-aligned kbd chip reusing the existing `<kbd>` visual language (mono, `--surface-3`, `--border`):
  ```css
  /* Right-aligned shortcut chip inside a menu row (P24). Shares the <kbd>
     look; margin-left:auto pins combos to a consistent right column. */
  .menu-item .mi-kbd {
    margin-left: auto;
    flex: none;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.5;
    padding: 1px 5px;
    border-radius: var(--r-1);
    background: var(--surface-3);
    color: var(--text-2);
    border: 1px solid var(--border);
  }
  ```
  (If a bare `.kbd` rule already exists in parts.css, let `.mi-kbd` add only `margin-left:auto; flex:none;` and drop the duplicated declarations.)
- [ ] Implement `EditMenu.tsx`: floor-plan-editor `MenuItem` → `label="Floor plan editor"` + `kbd={shortcutLabel('togglePlanEditor')}`; delete the now-unused local `chip()` helper.
- [ ] Implement `FileMenu.tsx`: audit rows against `KEYBINDINGS`; wire `kbd` only where a real binding exists (most File rows stay bare).
- [ ] Modify `src/ui/toolbar/shortcuts.test.ts`: pin `shortcutLabel('togglePlanEditor')` and `shortcutLabel('undo')` to their current labels so menu/tooltip text can't silently drift.
- [ ] Bump `src/version.ts` to `'0.9.0.76'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: shortcut chips in menus, right-aligned via .kbd (v0.9.0.76)`.
- [ ] Run tests: `npx vitest --run src/ui/toolbar/menus/EditMenu.kbd.test.tsx src/ui/toolbar/shortcuts.test.ts` → passes.
- [ ] Commit: `git commit -am "FEAT: right-aligned .kbd shortcut chips in menus from shortcuts registry (v0.9.0.76)"`.

---

### Task 6: P33 — Disabled-with-reason tooltips

**Files:**
- Modify `src/ui/toolbar/IconButton.tsx` — add `disabled?: boolean` + `disabledReason?: string`.
- Modify `src/ui/toolbar/Toolbar.tsx` — Undo/Redo IconButtons: `disabled={!canUndo}` / `disabled={!canRedo}` + reasons.
- Modify `src/ui/HistoryPanel.tsx` — disabled Undo/Redo `.btn` buttons: add `title` reason.
- Test: Create `src/ui/toolbar/IconButton.test.tsx`.

**Interfaces:**
- Produces `IconButton` props `disabled?: boolean`, `disabledReason?: string`.
- Consumes existing `Tooltip` `label`/`shortcut`.

**Steps:**

- [ ] Write `src/ui/toolbar/IconButton.test.tsx`:
  ```tsx
  import { render, screen } from '@testing-library/react'
  import { describe, expect, it } from 'vitest'
  import { IconButton } from './IconButton'

  describe('P33 disabled-with-reason', () => {
    it('disables the button and carries the reason on title when disabled', () => {
      render(<IconButton icon="Undo" label="Undo" disabled disabledReason="Nothing to undo" />)
      const btn = screen.getByRole('button', { name: /Undo/ })
      expect(btn).toBeDisabled()
      expect(btn.getAttribute('title')).toBe('Nothing to undo')
    })
    it('keeps the normal label + no title when enabled', () => {
      render(<IconButton icon="Undo" label="Undo" shortcut="Ctrl Z" />)
      const btn = screen.getByRole('button', { name: 'Undo' })
      expect(btn).not.toBeDisabled()
      expect(btn.getAttribute('title')).toBeNull()
    })
  })
  ```
  (Read `IconButton.tsx` first — match its real prop names (`icon` may take a component) and adjust the render accordingly. Prefer `title` on the `<button>` as the assertable surface — synchronous, and works on touch where `.tip` is suppressed. Also swap the Tooltip label to the reason when disabled.)
- [ ] Run it, expect failure: `npx vitest --run src/ui/toolbar/IconButton.test.tsx` → fails (no `disabled` prop).
- [ ] Implement `IconButton.tsx`: add `disabled?: boolean` and `disabledReason?: string`; compute `const tipLabel = disabled && disabledReason ? disabledReason : label`; pass `label={tipLabel}` + `shortcut={disabled ? undefined : shortcut}` to `Tooltip`; on the `<button>` add `disabled={disabled}`, `aria-disabled={disabled || undefined}`, `title={disabled ? disabledReason : undefined}`, and guard `onClick={disabled ? undefined : onClick}`.
- [ ] Implement `Toolbar.tsx`: Undo IconButton → `disabled={!canUndo}` + `disabledReason="Nothing to undo"`; Redo → `disabled={!canRedo}` + `disabledReason="Nothing to redo"` (find how `canUndo`/`canRedo` are derived — they exist in the history slice).
- [ ] Implement `HistoryPanel.tsx`: on the Undo `.btn` add `title={canUndo ? undefined : 'Nothing to undo'}`; on Redo add `title={canRedo ? undefined : 'Nothing to redo'}`.
- [ ] Bump `src/version.ts` to `'0.9.0.77'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: disabled-with-reason tooltips on undo/redo (v0.9.0.77)`.
- [ ] Run tests: `npx vitest --run src/ui/toolbar/IconButton.test.tsx` → passes.
- [ ] Commit: `git commit -am "FEAT: disabled-with-reason tooltips on undo/redo buttons (v0.9.0.77)"`.

---

### Task 7: P30 — Undo-in-toast for destructive delete

**Files:**
- Modify `src/state/slices/itemsSlice.ts` — `deleteItem`: after the delete `set(...)`, emit a success toast with an Undo action via `get().notify.start`.
- Test: Create `src/state/slices/itemsSlice.delete.test.ts` (or extend the existing itemsSlice test file if one exists).

**Interfaces:**
- Consumes `get().notify.start({ kind:'success', actionLabel:'Undo', onAction })` and `get().undo`.
- `deleteItem` already pushes a coalesced history step so a single `undo()` reverts the whole delete.

**Steps:**

- [ ] Confirm ruling: **no feature flag** (see Global Constraints — matches shipped un-flagged Undo toasts in StyleTransferModal/StyleQuizModal).
- [ ] Read `src/state/slices/itemsSlice.ts` around `deleteItem` to confirm the slice-creator `get`/`set` signature and the exact history call; read an existing slice test for the store seeding idiom.
- [ ] Write the test `src/state/slices/itemsSlice.delete.test.ts`:
  ```ts
  import { beforeEach, describe, expect, it } from 'vitest'
  import { useStore } from '../store'

  describe('P30 delete emits an Undo toast', () => {
    beforeEach(() => {
      useStore.setState({ notifications: [], items: [], selectedItemIds: [], selectedItemId: null })
    })
    it('toasts "deleted" with an Undo action wired to undo()', () => {
      // seed via the real add path if available (read itemsSlice for the adder)
      useStore.setState({
        items: [{ id: 'i1', defId: 'sofa-2seat', x: 0, z: 0, rotation: 0, roomId: 'r1' } as never],
      })
      useStore.getState().deleteItem('i1')
      expect(useStore.getState().items).toHaveLength(0)
      const toast = useStore.getState().notifications.at(-1)
      expect(toast?.kind).toBe('success')
      expect(toast?.actionLabel).toBe('Undo')
      toast?.onAction?.()
      expect(useStore.getState().items).toHaveLength(1)
    })
    it('behaves identically in Pro mode', () => {
      // set uiMode to 'pro' via the repo's real mechanism (+ reresolveFeatureFlags() if that
      // is the idiom), then repeat the core assertion (toast + Undo present).
    })
  })
  ```
  (Adjust the seed to the real `Item` shape / adder — prefer a real `addItem`/placement action over hand-seeding so history has a baseline to undo to. Fill in the Pro-mode test body with the repo's actual mode mechanism.)
- [ ] Run it, expect failure: `npx vitest --run src/state/slices/itemsSlice.delete.test.ts` → fails (no toast emitted).
- [ ] Implement `itemsSlice.ts` `deleteItem`: after the existing delete `set(...)` block, append:
  ```ts
  get().notify.start({
    title: 'Item deleted',
    kind: 'success',
    // Reversible destructive action → offer inline Undo instead of a confirm
    // dialog (matches the style/transfer toasts). The delete was pushed as one
    // coalesced history step, so a single undo() restores it.
    autoDismissMs: 6000,
    actionLabel: 'Undo',
    onAction: () => get().undo(),
  })
  ```
  (Match `notify.start`'s real option names — read `notificationsSlice.ts`; e.g. the auto-dismiss key may differ.)
- [ ] Bump `src/version.ts` to `'0.9.0.78'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: undo-in-toast for item deletion (v0.9.0.78)` — deleting an item now toasts "Item deleted — Undo" wired to the coalesced history step; reversible, un-flagged (matches the shipped style-transfer Undo toast). Works in Simple and Pro.
- [ ] Run tests: `npx vitest --run src/state/slices/itemsSlice.delete.test.ts` → passes.
- [ ] Commit: `git commit -am "FEAT: undo-in-toast when an item is deleted (v0.9.0.78)"`.

---

### Task 8: P31 — Determinate upload progress bar — **DEFERRED**

**DEFERRED per the orchestrator amendment**: the target code (`src/furniture/upload/runImport.ts` `startBackgroundImport` + `coalesceProgress`) exists only on the unmerged `claude/fix-pinch-zoom-flicker` branch. After that branch merges to main, add a regression test asserting `startBackgroundImport` drives `notify.update` with `progress` in (0,1] and a matching `"X / Y"` message from the same coalesced counter (spy on `useStore.getState().notify.update` for determinism). No source change expected — the wiring shipped; the test locks it.

---

### Task 9: Batch visual verification

**Files:**
- Create `scripts/scenarios/ui-polish-batch1.json` (scenario harness input).
- Reference `docs/visual-verification-playbook.md` for step vocabulary and gotchas.

**Interfaces:** consumes `window.__store` levers; produces screenshots reviewed by eye. Covers: focus ring on a button, tooltip with shortcut hint, delete-undo toast, determinate progress bar (driven directly via notify), a modal using the new width token.

**Steps:**

- [ ] Read `docs/visual-verification-playbook.md` and an existing scenario JSON in `scripts/scenarios/` to match the step schema exactly (`eval`/`waitFor`/`click`/`screenshot`/`store`/`viewport`).
- [ ] Author `scripts/scenarios/ui-polish-batch1.json` with ordered named steps:
  - `focus-ring`: `eval` to keyboard-focus a `.tool-btn` (`document.querySelector('.tool-btn').focus()`) → `screenshot` (expect the 3px accent halo).
  - `tooltip-shortcut`: hover/focus the Undo `.tool-btn`, wait past the tooltip delay → `screenshot` (expect the `.tip-box` with the shortcut chip).
  - `delete-undo-toast`: seed + select an item via `store`/`eval`, call `window.__store.getState().deleteItem(id)`, `waitFor` `.toast-host .toast-act` → `screenshot` (expect "Item deleted" + "Undo" button).
  - `upload-progress`: `eval` `const s=window.__store.getState(); const id=s.notify.start({title:'Importing…',kind:'progress'}); s.notify.update(id,{progress:0.42,message:'42 / 100'})` → `waitFor` `[role="progressbar"] .bud-seg` → `screenshot` (expect a ~42%-filled accent bar). (Match `notify.start`'s real signature — it may return the id or take one.)
  - `modal-width`: open a modal that uses a token width (e.g. the help panel via its store lever, or SwapModal) → `waitFor` `.modal-overlay > .panel` → `screenshot`; add an `eval` step logging `getComputedStyle(panel).width` for a sanity check.
- [ ] Run once (never alongside the full test suite): `node scripts/shot.mjs --scenario scripts/scenarios/ui-polish-batch1.json --out-dir <scratchpad>/shots`.
- [ ] **Visually review every screenshot** and report what you saw for each surface (ring visible + on-theme, tooltip chip present, undo toast + action, progress bar ~42%, modal at token width). Note any artifact and fix before finalising. Green tests are not proof.
- [ ] Run the full suite once: `npm test`, then `npx tsc --noEmit` and `npm run check`.
- [ ] Bump `src/version.ts` to `'0.9.0.79'`.
- [ ] Add `CHANGELOG.md` entry: `## CHORE: visual-verification scenario for UI polish batch 1 (v0.9.0.79)`.
- [ ] Commit: `git commit -am "CHORE: ui-polish-batch1 visual-verification scenario (v0.9.0.79)"`.
