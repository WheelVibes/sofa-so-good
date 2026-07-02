> **Orchestrator amendment (2026-07-02):** The final-review merge-prep commit bumped the branch
> to **v0.10.0.0** (`package.json` 0.10.0) AFTER this plan was authored. All version bumps in
> this plan shift accordingly: Task 1 → **0.10.0.1**, Task 2 → **0.10.0.2**, … Task 9 →
> **0.10.0.9** (same order; replace every `0.9.0.8x` version/changelog reference with the
> mapped `0.10.0.x`). The merge-prep commit also touched CHANGELOG.md/TODO.md/TASKS.md/
> src/ui/CLAUDE.md and FinishPicker/itemsSlice (deleteItem gained a `{silent}` option) —
> re-locate all edit targets by content, and Task 8's CLAUDE.md addition must merge with the
> conventions lines the merge-prep commit already added (extend, don't duplicate).
> **TODO.md convention (user, 2026-07-02): shipped items are removed from TODO.md entirely —
> never left as checked/"SHIPPED" lines. Each task that ships a P-item deletes that item's
> bullet from TODO.md in the same commit.**

# Batch 2a — UI/UX polish program (CSS / tokens / docs subset)

> **Orchestrator context (2026-07-02):** This plan targets the integration worktree at `/home/cwlroda/projects/sofa-so-good/.claude/worktrees/ui-polish-program` (branch `worktree-ui-polish-program`). Batch 1 is already merged here: the `--focus-ring`/`--modal-*` tokens (`tokens.css`), `.mi-kbd` menu chips (`ToolbarMenu.tsx` `MenuItem` already has a `kbd` prop; `.menu-item .mi-kbd` exists in `app.css`), `IconButton` disabled/reason props, and the delete→Undo toast. Do **not** read the primary checkout at `/home/cwlroda/projects/sofa-so-good` — it is a different branch. All line numbers below were read from this worktree on 2026-07-02; re-locate by content before editing.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Ship the CSS/token/docs subset of TODO "Batch 2 — medium": **P1** motion-scale tokens, **P20** line-height tokens, **P12** row-padding normalization, **P4** unified hover-lift, **P13** hover-reveal row actions, **P36** sticky section headers, **P2** entrance-stagger capability, and the **P19+P23** documentation task in `src/ui/CLAUDE.md`. Everything is pure-CSS polish on the existing OKLch token system plus a handful of thin TSX touches (setting a `--i` custom property on mapped list children, and adding the `.liftable`/`.stagger-in` class names). No new abstractions, no feature flags, no framework changes. One final visual-verification task covers the whole batch.

## Architecture

- **Tokens** live in `src/styles/tokens.css`. The `:root` block (lines ~1–100) holds the shared scale; each of the 5 themes × light/dark re-declares colour/shadow/border tokens (lines ~78–400). Motion tokens today: `--ease: cubic-bezier(0.2, 0.8, 0.2, 1)` (line 38) and `--dur: 0.16s` (line 39). Spacing scale `--s-1:4px … --s-7:28px` (lines 20–26). Radii `--r-1:3px` (chips/kbd), `--r-2:5px` (buttons/cards), `--r-3:7px`, `--r-pill:999px`. Type scale `--t-2xs:10px … --t-xl:20px` (lines 29–35). Shadows `--shadow-panel` / `--shadow-pop` are per-theme.
- **Component CSS** is split: `src/styles/components.css` (`.menu-item` line 279 `padding: 8px 9px`; `.menu.open` + `@keyframes pop`/`fade`/`modalpop` lines 277–278, 50–62; `.row` line 383 `padding: 8px 0`), `src/styles/parts.css` (`.chip` line 31 `padding: 8px 12px`; `.cat-card:hover` line 57 with `translateY(-1px)`+`--shadow-panel`; `.card-grid` line 48 `overflow-y:auto`; `.catalog` line 6; `.sec`/`.sec-h` lines 200–203), `src/styles/features.css` (`.empty-mini` lines 34–46; `.lyr-body` line 65 `overflow-y:auto`; `.lyr-ghead`/`.lyr-ghead-row` lines 68–79; `.lyr-row` line 88 `padding: 6px 7px`; `.lyr-acts` lines 105–106 opacity hover-reveal; `.swap-card:hover` line 133; `.ver-card`/`.ver-card:hover` lines 231–233; `.cmdk-results`/`.cmdk-item` lines 292–311; `.clr-item .ci-detail` line 166 `line-height:1.5`), `src/styles/flows.css` (`.preset-card:hover` line 110; `.onb-lede` line 142 `line-height:1.55`; `.onb-steps em` line 154 `line-height:1.45`; `.empty-sub` line 184 `line-height:1.5`), `src/styles/app.css` (the app-wide `@media (prefers-reduced-motion: reduce)` block lines 223–238 that forces `animation-duration`/`transition-duration: 0.01ms !important` on `*`; `.menu-item .mi-kbd` line 106; `.pop-panel` menu animation lines 3–65), and `src/styles/responsive.css` (`body.mobile` overrides; the hover-reveal touch fixes for `.fav-btn`/`.stamp-btn`/`.lyr-geye` around lines 350–362).
- **List render points** (for P2 `--i` and P4/P13 class touches): catalog grid — `src/ui/catalog/CatalogDrawer.tsx` (`.card-grid` line 423) whose cells are `CatalogCard.tsx` (`.cat-card` line 120) / `RemoteCard.tsx` (`.cat-card` line 83); layers rows — `src/ui/catalog/LayersPanel.tsx` (`.lyr-group` container line 116, `.lyr-row` map line 166/170, `.lyr-acts` line 200); ⌘K results — `src/ui/CommandPalette.tsx` (`.cmdk-results` line 791, `.cmdk-item` map with a flat `index` line 798–814); menu items — `src/ui/toolbar/ToolbarMenu.tsx` (`.pop-panel` container line 44, children are `MenuItem` `.menu-item` buttons line 88 + `.menu-label` dividers). Swap cards — `src/ui/SwapModal.tsx` (`.swap-card` line 110). Version cards — `src/ui/VersionsPanel.tsx` (`.ver-card` line 237). `.preset-card` exists only in CSS (no TSX render found) — treated CSS-only.
- **Reduced-motion**: the single global block in `app.css` (lines 223–238) already neutralises `animation-duration`/`transition-duration` for every existing `.fade`/`.pop`/`.modalpop`/`sheetUp` animation. It does **NOT** currently reset `animation-delay`/`transition-delay` — P2's staggered delays would still fire, so P2 must extend this block.
- **Test precedent**: `src/styles/focusRing.test.ts` and `src/styles/tabularNums.test.ts` are grep-assertion CSS tests that `readFileSync` a stylesheet via `fileURLToPath(new URL('./x.css', import.meta.url))` and match with regex. TSX touches get `@testing-library/react` component tests. Full suite + `tsc` + Biome run on the pre-commit hook.

## Tech Stack

React 18 + TypeScript, Zustand sliced store (`src/state/store.ts`, `window.__store`), Vite, Vitest + @testing-library/react (jsdom), Biome (2-space / 100-col / single-quote / no-semicolons). Pure OKLch CSS token system across 5 themes × light/dark. Visual verification via `node scripts/shot.mjs --scenario <file.json>` (see `docs/visual-verification-playbook.md`).

## Global Constraints

- **No hardcoded colours anywhere** — CSS token vocabulary only (`--accent`, `--surface-*`, `--text-*`, `--border`/`--border-2`, `--shadow-*`, `color-mix(… var(--accent) …)`). Never a colour literal or Tailwind colour utility. Every surface must work in light + dark across all 5 themes.
- **Reduced motion**: every new keyframe/transition/animation-delay MUST be covered by the global `@media (prefers-reduced-motion: reduce)` block in `app.css`. That block today only zeroes `*-duration`; P2 (stagger) additionally zeroes `animation-delay`/`transition-delay` there so staggered items do not appear one-by-one under reduce-motion. New transitions inherit the existing `transition-duration: 0.01ms` reset automatically.
- **Pure-CSS polish is NOT a feature** — no `FEATURE_FLAGS` entry, no `useFeature` gate for any item in this batch. Stagger and hover-lift must NOT regress mobile/touch: `translateY` lifts and hover-reveals key off `:hover`, which touch lacks, so touch behaviour must be preserved (hover-reveal actions must also reveal on `:focus-within` and be always-visible under `body.mobile`, matching the existing `.lyr-geye`/`.fav-btn` mobile pattern in `responsive.css`).
- **Simple/Pro**: nothing in this batch changes per-mode visibility (pure presentation), so no per-mode tests are required. Where a touched component already renders in both modes it keeps working unchanged.
- **Tests**: while iterating run only targeted tests: `npx vitest --run <paths>`. CSS-only tasks get a `grep`-assertion test in `src/styles/` (precedent above). TSX touches get a component test asserting a real behaviour (the `--i` attribute value, the `.liftable` class presence). Run the full suite exactly once right before each commit (the pre-commit hook runs `npm test` + `tsc` + `biome`).
- **Versioning**: every commit bumps `APP_VERSION` in `src/version.ts` sequentially (see the amendment header: Task N → `0.10.0.N`), and adds a `CHANGELOG.md` entry at the top (newest first, `## TYPE: summary (vX)` header + bullets). `package.json` first-three-parts stay `0.10.0` (only build increments). Biome style: 2-space, single quotes, no semicolons, 100-col.
- **TODO.md**: each task that ships a P-item DELETES that item's bullet from TODO.md in the same commit (shipped items are removed entirely — user rule).
- **Commit convention**: `TYPE: summary (vX)`, TYPE ∈ `FEAT|FIX|CHORE|REFACTOR|DOCS|PERF`; one focused change per commit; end the message body with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- **Visual verification**: one final task (Task 9) covers the whole batch.

---

### Task 1: P1 — Motion scale tokens

**Files:**
- Modify `src/styles/tokens.css` — add tokens inside `:root`, immediately after `--dur` (line 39).
- Test (verification): Create `src/styles/motionTokens.test.ts`.

**Interfaces:**
- Produces `--dur-1: 150ms`, `--dur-2: 300ms`, `--dur-3: 600ms`, and `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`.
- Consumed by Task 7 (stagger keyframe uses `--dur-2` + `--ease-out`). Existing `--dur`/`--ease` are unchanged (kept for all current animations).

**Steps:**

- [ ] Write `src/styles/motionTokens.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'

  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P1 motion scale tokens', () => {
    it('defines the --dur-1/-2/-3 scale (~150/300/600ms) in tokens.css', () => {
      const tokens = read('./tokens.css')
      expect(tokens).toMatch(/--dur-1:\s*150ms/)
      expect(tokens).toMatch(/--dur-2:\s*300ms/)
      expect(tokens).toMatch(/--dur-3:\s*600ms/)
    })
    it('defines the easeOutExpo entrance easing token', () => {
      expect(read('./tokens.css')).toMatch(/--ease-out:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/)
    })
    it('keeps the existing --dur/--ease tokens intact', () => {
      const tokens = read('./tokens.css')
      expect(tokens).toMatch(/--dur:\s*0\.16s/)
      expect(tokens).toMatch(/--ease:\s*cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\)/)
    })
  })
  ```
- [ ] Run it, expect failure: `npx vitest --run src/styles/motionTokens.test.ts` → fails (no `--dur-1`/`--ease-out`).
- [ ] Implement in `src/styles/tokens.css`, inside `:root`, directly after the `--dur: 0.16s;` line:
  ```css
  /* Motion scale (P1). --dur (0.16s) stays the default micro-transition; this
     scale is for larger entrance/exit choreography. --ease-out is easeOutExpo —
     a fast-in / soft-settle curve for entrances (stagger, panel slide). */
  --dur-1: 150ms;
  --dur-2: 300ms;
  --dur-3: 600ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  ```
- [ ] Bump `src/version.ts` `APP_VERSION` per the amendment (Task 1 → `'0.10.0.1'`).
- [ ] Add `CHANGELOG.md` entry at top: `## FEAT: motion scale tokens --dur-1/-2/-3 + --ease-out (v0.10.0.1)` with bullets (150/300/600ms scale + easeOutExpo entrance easing alongside the existing `--dur`/`--ease`).
- [ ] Delete the P1 bullet from TODO.md's Batch 2 list (shipped items are removed entirely).
- [ ] Run tests: `npx vitest --run src/styles/motionTokens.test.ts` → passes.
- [ ] Commit: `git commit -am "FEAT: --dur-1/-2/-3 + --ease-out motion scale tokens (v0.10.0.1)"`.

---

### Task 2: P20 — Line-height tokens

**Files:**
- Modify `src/styles/tokens.css` — add `--lh-tight`/`--lh-body` inside `:root` (after the type scale, ~line 35).
- Modify `src/styles/features.css` — `.empty-mini span` (line 44) `line-height: 1.5` → token; `.clr-item .ci-detail` (line 166) `line-height: 1.5` → token.
- Modify `src/styles/flows.css` — `.empty-sub` (line 184) `line-height: 1.5` → token; `.onb-lede` (line 142) `line-height: 1.55` → `var(--lh-body)`; `.onb-steps em` (line 154) `line-height: 1.45` → `var(--lh-body)`.
- Test (verification): Create `src/styles/lineHeight.test.ts`.

**Interfaces:**
- Produces `--lh-tight: 1.25` (headings / single-line labels) and `--lh-body: 1.5` (multiline descriptions, empty states, onboarding copy). Existing per-selector hardcoded `line-height` values on multiline copy are replaced; single-line label line-heights (e.g. `.swap-card .nm { line-height: 1.25 }`) are left as-is this task (documented in Task 8's type-hierarchy section as `--lh-tight`).

**Steps:**

- [ ] Write `src/styles/lineHeight.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'

  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P20 line-height tokens', () => {
    it('defines --lh-tight 1.25 and --lh-body 1.5 in tokens.css', () => {
      const tokens = read('./tokens.css')
      expect(tokens).toMatch(/--lh-tight:\s*1\.25/)
      expect(tokens).toMatch(/--lh-body:\s*1\.5/)
    })
    it('applies --lh-body to multiline descriptions and empty states', () => {
      const features = read('./features.css')
      const flows = read('./flows.css')
      expect(features).toMatch(/\.empty-mini span\b[^}]*line-height:\s*var\(--lh-body\)/s)
      expect(features).toMatch(/\.ci-detail\b[^}]*line-height:\s*var\(--lh-body\)/s)
      expect(flows).toMatch(/\.empty-sub\b[^}]*line-height:\s*var\(--lh-body\)/s)
      expect(flows).toMatch(/\.onb-lede\b[^}]*line-height:\s*var\(--lh-body\)/s)
    })
  })
  ```
- [ ] Run it, expect failure: `npx vitest --run src/styles/lineHeight.test.ts` → fails.
- [ ] Implement in `src/styles/tokens.css`, inside `:root` after the `--t-xl` line:
  ```css
  /* Line-height tokens (P20). --lh-tight for headings + single-line labels;
     --lh-body for multiline reading copy (descriptions, empty states, onboarding). */
  --lh-tight: 1.25;
  --lh-body: 1.5;
  ```
- [ ] Implement `src/styles/features.css`: `.empty-mini span` `line-height: 1.5` → `line-height: var(--lh-body)`; `.clr-item .ci-detail` `line-height: 1.5` → `line-height: var(--lh-body)`.
- [ ] Implement `src/styles/flows.css`: `.empty-sub` `line-height: 1.5` → `var(--lh-body)`; `.onb-lede` `line-height: 1.55` → `var(--lh-body)`; `.onb-steps em` `line-height: 1.45` → `var(--lh-body)`.
- [ ] Bump `src/version.ts` to `'0.10.0.2'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: --lh-tight/--lh-body line-height tokens (v0.10.0.2)` — `--lh-body` (1.5) applied to `.empty-mini`, clearance detail, empty-state sub, onboarding lede/steps copy; `--lh-tight` (1.25) documented for headings/labels.
- [ ] Delete the P20 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/styles/lineHeight.test.ts` → passes.
- [ ] Commit: `git commit -am "FEAT: --lh-tight/--lh-body tokens on multiline copy + empty states (v0.10.0.2)"`.

---

### Task 3: P12 — Row-padding normalization

**Files:**
- Modify `src/styles/features.css` — `.lyr-row` (line 90) `padding: 6px 7px`.
- Modify `src/styles/components.css` — `.menu-item` (line 281) `padding: 8px 9px`; `.row` (line 383) `padding: 8px 0`.
- Modify `src/styles/parts.css` — `.chip` (line 33) `padding: 8px 12px`.
- Test (verification): Create `src/styles/rowPadding.test.ts`.

**Interfaces:** No new tokens — normalizes existing ad-hoc px paddings onto the `--s` scale. Three sanctioned row-padding compositions (chosen to be the NEAREST `--s-N` mapping of each current value, so the visual delta is ≤1px per side — density is preserved, not redesigned):
- **Compact row** `var(--s-2) var(--s-3)` = 6px 8px → `.lyr-row` (was 6px 7px; +1px horizontal).
- **Standard row** `var(--s-3)` = 8px → `.menu-item` (was 8px 9px; −1px horizontal). `.row` → `var(--s-3) 0` (was 8px 0; exact).
- **Pill row** `var(--s-3) var(--s-4)` = 8px 12px → `.chip` (exact).

**Steps:**

- [ ] Write `src/styles/rowPadding.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'

  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P12 row-padding normalization', () => {
    it('.lyr-row uses the compact-row composition var(--s-2) var(--s-3)', () => {
      expect(read('./features.css')).toMatch(/\.lyr-row\s*\{[^}]*padding:\s*var\(--s-2\)\s+var\(--s-3\)/s)
    })
    it('.menu-item and .row use the standard-row s-3 composition', () => {
      const c = read('./components.css')
      expect(c).toMatch(/\.menu-item\s*\{[^}]*padding:\s*var\(--s-3\)/s)
      expect(c).toMatch(/\.row\s*\{[^}]*padding:\s*var\(--s-3\)\s+0/s)
    })
    it('.chip uses the pill-row composition var(--s-3) var(--s-4)', () => {
      expect(read('./parts.css')).toMatch(/\.chip\s*\{[^}]*padding:\s*var\(--s-3\)\s+var\(--s-4\)/s)
    })
    it('leaves no bare px paddings on those four row selectors', () => {
      expect(read('./features.css')).not.toMatch(/\.lyr-row\s*\{[^}]*padding:\s*6px\s+7px/s)
      expect(read('./components.css')).not.toMatch(/\.menu-item\s*\{[^}]*padding:\s*8px\s+9px/s)
    })
  })
  ```
- [ ] Run it, expect failure: `npx vitest --run src/styles/rowPadding.test.ts` → fails.
- [ ] Implement `src/styles/features.css`: `.lyr-row` `padding: 6px 7px;` → `padding: var(--s-2) var(--s-3);` (preserve every other declaration in the rule).
- [ ] Implement `src/styles/components.css`: `.menu-item` `padding: 8px 9px;` → `padding: var(--s-3);`; `.row` `padding: 8px 0;` → `padding: var(--s-3) 0;`.
- [ ] Implement `src/styles/parts.css`: `.chip` `padding: 8px 12px;` → `padding: var(--s-3) var(--s-4);`.
- [ ] Bump `src/version.ts` to `'0.10.0.3'`.
- [ ] Add `CHANGELOG.md` entry: `## REFACTOR: row-padding normalized onto the --s scale (v0.10.0.3)` — three sanctioned compositions (compact `--s-2 --s-3`, standard `--s-3`, pill `--s-3 --s-4`) replace ad-hoc px on `.lyr-row`/`.menu-item`/`.row`/`.chip`; each mapped to its nearest scale step (≤1px delta).
- [ ] Delete the P12 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/styles/rowPadding.test.ts` → passes.
- [ ] Commit: `git commit -am "REFACTOR: normalize .lyr-row/.menu-item/.row/.chip padding onto --s scale (v0.10.0.3)"`.

---

### Task 4: P4 — Hover-lift standard (`.liftable`)

**Files:**
- Modify `src/styles/components.css` — add the shared `.liftable` utility (near the top, by the shared control rules).
- Modify `src/styles/parts.css` — `.cat-card` (line 55–57): keep `transition` on the base rule; strip `transform`/`box-shadow` from `.cat-card:hover` (keep its `border-color`/`background`).
- Modify `src/styles/features.css` — `.swap-card:hover` (line 133): strip `transform`/`box-shadow`, keep border/background; `.ver-card:hover` (line 233) keeps its `background` change only.
- Modify `src/styles/flows.css` — `.preset-card:hover` (line 110): strip `transform`/`box-shadow`, keep border/background; `.preset-card` joins the `.liftable` selector group in `components.css` (CSS-only — no TSX render exists).
- Modify TSX to add the class: `src/ui/catalog/CatalogCard.tsx` (line 120 className), `src/ui/catalog/RemoteCard.tsx` (line 83), `src/ui/SwapModal.tsx` (line 110), `src/ui/VersionsPanel.tsx` (line 237).
- Test: Create `src/styles/liftable.test.ts` (CSS grep) + `src/ui/SwapModal.liftable.test.tsx` (class-presence).

**Interfaces:**
- Produces the `.liftable` class: `transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);` and `.liftable:hover { transform: translateY(-2px); box-shadow: var(--shadow-pop); }`. The per-card `:hover` rules keep only their `border-color`/`background` changes; the lift + pop-shadow are unified into one place (no stacked duplicate `transform`/`box-shadow`). Reduced-motion is already covered — the global block zeroes the `transform`/`box-shadow` transition duration.

**Steps:**

- [ ] Write `src/styles/liftable.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'

  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P4 unified hover-lift', () => {
    it('defines one .liftable:hover lift using translateY(-2px) + --shadow-pop', () => {
      const c = read('./components.css')
      expect(c).toMatch(/\.liftable:hover\s*[^{]*\{[^}]*transform:\s*translateY\(-2px\)/s)
      expect(c).toMatch(/\.liftable:hover\s*[^{]*\{[^}]*box-shadow:\s*var\(--shadow-pop\)/s)
    })
    it('applies the lift to preset-card via the shared selector group', () => {
      expect(read('./components.css')).toMatch(/\.preset-card/)
    })
    it('no longer stacks a duplicate transform on the per-card hover rules', () => {
      expect(read('./parts.css')).not.toMatch(/\.cat-card:hover\s*\{[^}]*translateY/s)
      expect(read('./features.css')).not.toMatch(/\.swap-card:hover\s*\{[^}]*translateY/s)
      expect(read('./flows.css')).not.toMatch(/\.preset-card:hover\s*\{[^}]*translateY/s)
    })
  })
  ```
- [ ] Write `src/ui/SwapModal.liftable.test.tsx` — assert the swap cards carry `.liftable`. Read the top of `SwapModal.tsx` first to match its real props/store seeding; the load-bearing assertion:
  ```tsx
  it('renders swap cards with the .liftable hover-lift class', () => {
    const { container } = render(/* <SwapModal … open /> with a seeded item + alternatives */)
    const card = container.querySelector('.swap-card')
    expect(card?.classList.contains('liftable')).toBe(true)
  })
  ```
  (If seeding SwapModal is heavy, substitute `src/ui/VersionsPanel.liftable.test.tsx` asserting `.ver-card.liftable` — pick whichever list is cheapest to render. One TSX class-presence test is sufficient.)
- [ ] Run both, expect failure: `npx vitest --run src/styles/liftable.test.ts src/ui/SwapModal.liftable.test.tsx`.
- [ ] Implement `src/styles/components.css` — add near the shared control block:
  ```css
  /* Hover-lift standard (P4). One treatment for interactive cards: a 2px rise
     + pop-shadow on hover. Cards keep their own border/background hover accents;
     this owns the lift so it never double-stacks. Reduced-motion neutralises the
     transition via the global block in app.css. */
  .liftable,
  .preset-card {
    transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }
  .liftable:hover,
  .preset-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-pop);
  }
  ```
- [ ] Implement `src/styles/parts.css`: `.cat-card:hover` → keep `border-color`/`background` only (remove `transform`/`box-shadow`).
- [ ] Implement `src/styles/features.css`: `.swap-card:hover` → keep `border-color`/`background`, remove `transform`/`box-shadow`. `.ver-card:hover` keeps its `background: var(--surface-solid)` only.
- [ ] Implement `src/styles/flows.css`: `.preset-card:hover` → keep `border-color`/`background`, remove `transform`/`box-shadow`.
- [ ] Implement TSX class additions: `CatalogCard.tsx` `className={\`cat-card group liftable${stampingThis ? ' stamping' : ''}\`}`; `RemoteCard.tsx` `className="cat-card group liftable"`; `SwapModal.tsx` `className="swap-card liftable"`; `VersionsPanel.tsx` the mapped `.ver-card` (line 237) → `className="ver-card liftable"` (leave the static `.ver-card.current` tile without lift).
- [ ] Bump `src/version.ts` to `'0.10.0.4'`.
- [ ] Add `CHANGELOG.md` entry: `## REFACTOR: unified .liftable hover-lift across cards (v0.10.0.4)` — one `translateY(-2px)` + `--shadow-pop` treatment on `.cat-card`/`.swap-card`/`.preset-card`/`.ver-card`, replacing the stacked per-card `translateY(-1px)`+`--shadow-panel` rules.
- [ ] Delete the P4 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/styles/liftable.test.ts src/ui/SwapModal.liftable.test.tsx` → passes.
- [ ] Commit: `git commit -am "REFACTOR: unify card hover-lift into .liftable (translateY + --shadow-pop) (v0.10.0.4)"`.

---

### Task 5: P13 — Hover-reveal row actions (keyboard + touch safe)

**Files:**
- Modify `src/styles/features.css` — extend the `.lyr-row` action reveal (line 106) to also fire on `:focus-within`.
- Modify `src/styles/responsive.css` — inside the `body.mobile` block (near the existing `.lyr-geye`/`.fav-btn` touch fixes ~lines 350–362), add `.lyr-acts { opacity: 1; }` so row actions are always visible on touch.
- Test (verification): Create `src/styles/hoverReveal.test.ts`.

**Interfaces:** No new tokens. Audit result (documented in the changelog + Task 8): the **only** hover-reveal row-action surface is the Layers panel `.lyr-acts` (features.css:105–106, opacity `0`→`1` on `.lyr-row:hover`/`.sel`). History rows have no per-row action buttons (each row is a single jump button — nothing to reveal). Version rows (`.ver-actions`) are always visible by design (destructive delete/restore should not hide). So P13 = make `.lyr-acts` keyboard-accessible (`:focus-within`) and touch-visible (`body.mobile`), matching the existing `.lyr-geye` treatment.

**Steps:**

- [ ] Write `src/styles/hoverReveal.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'

  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P13 hover-reveal row actions', () => {
    it('reveals .lyr-acts on hover, selection, and keyboard focus-within', () => {
      const f = read('./features.css')
      expect(f).toMatch(/\.lyr-row:focus-within\s+\.lyr-acts/)
      expect(f).toMatch(/\.lyr-row:hover\s+\.lyr-acts/)
    })
    it('keeps .lyr-acts always visible on touch (body.mobile)', () => {
      const r = read('./responsive.css')
      expect(r).toMatch(/\.lyr-acts\s*\{[^}]*opacity:\s*1/s)
    })
  })
  ```
- [ ] Run it, expect failure: `npx vitest --run src/styles/hoverReveal.test.ts` → fails (no `:focus-within`, no mobile rule).
- [ ] Implement `src/styles/features.css`: extend the reveal selector list at line 106:
  ```css
  .lyr-row:hover .lyr-acts,
  .lyr-row:focus-within .lyr-acts,
  .lyr-row.sel .lyr-acts { opacity: 1; }
  ```
- [ ] Implement `src/styles/responsive.css`: inside the existing `body.mobile { … }` block, next to the `.lyr-geye` touch fix, add:
  ```css
  /* Layers row actions (hide/lock/delete) reveal on hover/focus on desktop; touch
     has no hover, so keep them visible on mobile (matches the .lyr-geye fix). */
  .lyr-acts { opacity: 1; }
  ```
- [ ] Bump `src/version.ts` to `'0.10.0.5'`.
- [ ] Add `CHANGELOG.md` entry: `## FIX: layers row actions reveal on keyboard focus + stay visible on touch (v0.10.0.5)` — `.lyr-acts` now reveals on `:focus-within` (WCAG keyboard access) and is always visible under `body.mobile`; audit note: history rows have no per-row actions and version actions are intentionally always-visible.
- [ ] Delete the P13 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/styles/hoverReveal.test.ts` → passes.
- [ ] Commit: `git commit -am "FIX: reveal .lyr-acts on :focus-within + always-visible on touch (v0.10.0.5)"`.

---

### Task 6: P36 — Sticky section headers in scrolling panels

**Files:**
- Modify `src/styles/features.css` — `.lyr-ghead-row` (line 78): make the group header row sticky within its scroll ancestor `.lyr-body` (`overflow-y:auto`, features.css:65).
- Modify `src/styles/parts.css` — `.sec-h` (line 202): make section headers sticky within their scrolling `.panel-body` ancestor.
- Test (verification): Create `src/styles/stickyHeaders.test.ts`.

**Interfaces:** No new tokens. `position: sticky; top: 0; z-index: 1;` + a `background: var(--surface)` fill (so scrolled content doesn't bleed through) + a subtle bottom hairline via `box-shadow: 0 1px 0 var(--border)`. Scroll-container audit:
- Layers: `.lyr-ghead-row` sits inside `.lyr-group` inside `.lyr-body` (the `overflow-y:auto` panel body) — sticky works. `top: 0` pins to the top of `.lyr-body`.
- `.sec-h` lives inside a `.sec` inside a scrolling `.panel-body`/inspector body — sticky works there; where a `.sec` sits in a non-scrolling modal it is a harmless no-op. Implementer MUST confirm by scrolling each panel in Task 9; if an intermediate wrapper clips (`overflow:hidden`), the fix is to remove that intermediate clip, not to move the header.

**Steps:**

- [ ] Write `src/styles/stickyHeaders.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'

  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P36 sticky section headers', () => {
    it('pins the layers group header row (.lyr-ghead-row) to the top of the scroll body', () => {
      const f = read('./features.css')
      expect(f).toMatch(/\.lyr-ghead-row\s*\{[^}]*position:\s*sticky/s)
      expect(f).toMatch(/\.lyr-ghead-row\s*\{[^}]*top:\s*0/s)
    })
    it('pins .sec-h and gives both a background + subtle bottom hairline', () => {
      const p = read('./parts.css')
      expect(p).toMatch(/\.sec-h\s*\{[^}]*position:\s*sticky/s)
      expect(p).toMatch(/\.sec-h\s*\{[^}]*box-shadow:\s*0 1px 0 var\(--border\)/s)
    })
  })
  ```
- [ ] Run it, expect failure: `npx vitest --run src/styles/stickyHeaders.test.ts` → fails.
- [ ] Implement `src/styles/features.css`: extend `.lyr-ghead-row` (preserve `display:flex; align-items:center`):
  ```css
  .lyr-ghead-row {
    display: flex; align-items: center;
    position: sticky; top: 0; z-index: 1;
    background: var(--surface);
    box-shadow: 0 1px 0 var(--border);
  }
  ```
  (If `.lyr-body` has a solid background token other than `--surface`, match it so the header fill is seamless — verify by content.)
- [ ] Implement `src/styles/parts.css`: extend `.sec-h` (preserve its font/colour/flex declarations):
  ```css
  .sec-h {
    /* …existing font-size/color/flex declarations… */
    position: sticky; top: 0; z-index: 1;
    background: var(--surface);
    box-shadow: 0 1px 0 var(--border);
    padding-bottom: var(--s-2);
  }
  ```
- [ ] Bump `src/version.ts` to `'0.10.0.6'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: sticky section headers in scrolling panels (v0.10.0.6)` — `.lyr-ghead-row` group headers and `.sec-h` section headers pin to the top of their scroll body with a subtle `--border` hairline; verified against the `.lyr-body`/`.panel-body` scroll hierarchy.
- [ ] Delete the P36 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/styles/stickyHeaders.test.ts` → passes. (Real stickiness is confirmed visually in Task 9 — grep can't prove the scroll ancestor is correct.)
- [ ] Commit: `git commit -am "FEAT: sticky .lyr-ghead-row + .sec-h headers in scrolling panels (v0.10.0.6)"`.

---

### Task 7: P2 — Entrance stagger capability

**Files:**
- Modify `src/styles/components.css` — add the `.stagger-in` utility + `@keyframes staggerIn` (near the existing `@keyframes pop`/`fade`, ~line 278).
- Modify `src/styles/app.css` — extend the `@media (prefers-reduced-motion: reduce)` block (lines 223–238) to also zero `animation-delay`/`transition-delay`.
- Modify TSX: `src/ui/toolbar/ToolbarMenu.tsx` (add `stagger-in` to the `.pop-panel` container, line 44); `src/ui/catalog/CatalogDrawer.tsx` (add `stagger-in` to `.card-grid`, line 423, and set `--i` on each card via an optional `staggerIndex?: number` prop on `CatalogCard`/`RemoteCard`); `src/ui/CommandPalette.tsx` (add `stagger-in` to `.cmdk-results`, line 791, and set `--i` from the existing flat `index` on each `.cmdk-item`, line 814); `src/ui/catalog/LayersPanel.tsx` (add `stagger-in` to the `.lyr-group` container and set `--i` from the map index on each `.lyr-row`, line 166/170).
- Test: Create `src/styles/stagger.test.ts` (CSS grep) + `src/ui/CommandPalette.stagger.test.tsx` (asserts `--i` is set on items).

**Interfaces:**
- Produces the `.stagger-in` utility: children animate `staggerIn var(--dur-2) var(--ease-out) both` with `animation-delay: calc(var(--i, 0) * 50ms)`; `:nth-child(1..12)` set `--i` as a CSS fallback for hand-authored menus; inline `style={{ '--i': idx }}` (use `as CSSProperties` cast) overrides for mapped lists.
- **Re-render safety**: CSS entrance animations only fire on DOM (re)mount, not on prop re-render of keyed nodes — selecting a layer/card does not replay the stagger. Menus mount fresh on open (Popover), so they stagger on each open, as intended.
- **Reduced-motion**: the extended global block zeroes `animation-delay` so all items appear at once.

**Steps:**

- [ ] Write `src/styles/stagger.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'

  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P2 entrance stagger', () => {
    it('defines .stagger-in children with a --i-driven 50ms animation-delay', () => {
      const c = read('./components.css')
      expect(c).toMatch(/\.stagger-in > \*\s*\{[^}]*animation:\s*staggerIn var\(--dur-2\) var\(--ease-out\)/s)
      expect(c).toMatch(/animation-delay:\s*calc\(var\(--i,\s*0\)\s*\*\s*50ms\)/)
      expect(c).toMatch(/@keyframes staggerIn/)
    })
    it('provides an nth-child --i fallback for hand-authored menus', () => {
      expect(read('./components.css')).toMatch(/\.stagger-in > \*:nth-child\(1\)\s*\{\s*--i:\s*0/)
    })
    it('reduced-motion zeroes animation-delay so items do not appear one-by-one', () => {
      const app = read('./app.css')
      const block = app.slice(app.indexOf('prefers-reduced-motion'))
      expect(block).toMatch(/animation-delay:\s*0(ms|s)?\s*!important/)
      expect(block).toMatch(/transition-delay:\s*0(ms|s)?\s*!important/)
    })
  })
  ```
- [ ] Write `src/ui/CommandPalette.stagger.test.tsx` — open the palette via its real store lever (read the file top), assert each `.cmdk-item` carries a numeric `--i`:
  ```tsx
  it('sets a --i custom property on each command-palette result for stagger', () => {
    const { container } = render(/* <CommandPalette open /> per its real API */)
    const items = [...container.querySelectorAll<HTMLElement>('.cmdk-item')]
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].style.getPropertyValue('--i')).not.toBe('')
  })
  ```
  (If CommandPalette is expensive to mount, substitute `LayersPanel.stagger.test.tsx` asserting `--i` on `.lyr-row` — reuse the seed idiom from Batch 1's `LayersPanel.truncation.test.tsx`. One `--i` TSX test suffices.)
- [ ] Run both, expect failure: `npx vitest --run src/styles/stagger.test.ts src/ui/CommandPalette.stagger.test.tsx`.
- [ ] Implement `src/styles/components.css` (near `@keyframes pop`):
  ```css
  /* Entrance stagger (P2). Children of a .stagger-in container fade+rise in
     sequence. --i (the child's index) drives a 50ms cascade; mapped lists set it
     inline, hand-authored menus fall back to the nth-child rules below. `both`
     holds the from-state before the delay so nothing flashes at full opacity.
     Reduced-motion (app.css) zeroes the delay so all items land at once. */
  .stagger-in > * {
    animation: staggerIn var(--dur-2) var(--ease-out) both;
    animation-delay: calc(var(--i, 0) * 50ms);
  }
  .stagger-in > *:nth-child(1) { --i: 0; }
  .stagger-in > *:nth-child(2) { --i: 1; }
  .stagger-in > *:nth-child(3) { --i: 2; }
  .stagger-in > *:nth-child(4) { --i: 3; }
  .stagger-in > *:nth-child(5) { --i: 4; }
  .stagger-in > *:nth-child(6) { --i: 5; }
  .stagger-in > *:nth-child(7) { --i: 6; }
  .stagger-in > *:nth-child(8) { --i: 7; }
  .stagger-in > *:nth-child(9) { --i: 8; }
  .stagger-in > *:nth-child(10) { --i: 9; }
  .stagger-in > *:nth-child(11) { --i: 10; }
  .stagger-in > *:nth-child(12) { --i: 11; }
  @keyframes staggerIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: none; }
  }
  ```
- [ ] Implement `src/styles/app.css` — inside the existing `@media (prefers-reduced-motion: reduce)` `*` rule, add:
  ```css
  animation-delay: 0ms !important;
  transition-delay: 0ms !important;
  ```
- [ ] Implement `src/ui/toolbar/ToolbarMenu.tsx`: `.pop-panel` container → `className="pop-panel stagger-in"` (menu items are direct children; nth-child fallback handles `--i`).
- [ ] Implement `src/ui/CommandPalette.tsx`: `.cmdk-results` → `className="cmdk-results stagger-in"`; on the `.cmdk-item` button add `style={{ '--i': index } as CSSProperties}` (import `type CSSProperties` from `'react'`; `index` already exists in scope). The flat `index` spans groups — the cascade runs across the whole result list, as desired.
- [ ] Implement `src/ui/catalog/CatalogDrawer.tsx`: `.card-grid` → `className="card-grid stagger-in"`; thread the map index into `CatalogCard`/`RemoteCard` via an optional `staggerIndex?: number` prop that sets `style={{ '--i': staggerIndex } as CSSProperties}` on the root `.cat-card` (unset → nth-child fallback covers the first 12).
- [ ] Implement `src/ui/catalog/LayersPanel.tsx`: add `className="lyr-group stagger-in"` on the group container and `style={{ '--i': idx } as CSSProperties}` on each `.lyr-row` from the map index (the header is child 0 with `--i:0`; confirm it doesn't visibly jump — verify in Task 9).
- [ ] Bump `src/version.ts` to `'0.10.0.7'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: entrance stagger for menus, catalog grid, layers, ⌘K results (v0.10.0.7)` — shared `.stagger-in` utility (`--i` × 50ms cascade over `staggerIn` keyframe, `--dur-2`/`--ease-out`); mapped lists set `--i` inline, menus use an nth-child fallback; reduced-motion now zeroes `animation-delay`/`transition-delay` so items land together.
- [ ] Delete the P2 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/styles/stagger.test.ts src/ui/CommandPalette.stagger.test.tsx` → passes.
- [ ] Commit: `git commit -am "FEAT: .stagger-in entrance cascade for menus/catalog/layers/cmdk (v0.10.0.7)"`.

---

### Task 8: P19 + P23 — Document border, hover & type-hierarchy conventions

**Files:**
- Modify `src/ui/CLAUDE.md` — add a "Visual conventions (borders / hover / type hierarchy)" section. NOTE (amendment): the merge-prep commit already added convention lines (kbd prop, modal tokens, focus ring) — EXTEND that section, don't duplicate.
- Report-only: sweep for obvious violations found during the audit; fix trivial ones inline (single-token swaps), report the rest in the commit body if the set is large.

**Interfaces:** Documentation only — encodes the conventions established by Tasks 1–7 and the existing token system. No code behaviour change.

**Steps:**

- [ ] Add to `src/ui/CLAUDE.md` (merge with the merge-prep conventions section; keep it lean):
  ```md
  - **Borders.** `--border` is the default hairline (panels, rows, cards, dividers,
    inputs at rest). `--border-2` is the *stronger* border — use it only to signal
    emphasis or hover/active state (e.g. `.clr-item:hover { border-color: var(--border-2) }`,
    left accent bars, hovered share options). Never a colour literal; never a third
    ad-hoc border alpha. Accent borders (`border-color: var(--accent)`) mark
    selection/focus, not mere hover.
  - **Hover.** Fills step up one surface level: rest → `--surface-2`, hover →
    `--surface-3` (rows, chips, ghost buttons). Interactive **cards** use the shared
    `.liftable` class (a `translateY(-2px)` + `--shadow-pop` rise) — do not hand-roll a
    per-card `transform`/`box-shadow`. **Row actions** that appear on hover (`.lyr-acts`
    pattern) MUST also reveal on `:focus-within` and be always-visible under
    `body.mobile` (touch has no hover). All hover transitions use `var(--dur) var(--ease)`;
    larger entrances use the `--dur-1/-2/-3` + `--ease-out` scale.
  - **Type hierarchy.** One ladder, from the `--t-*` scale:
    - Page/hero title — `--t-xl` (20px), weight 800, `--lh-tight`.
    - Panel title — `--t-lg` (16px), weight 800, `--lh-tight`.
    - Section header (`.sec-h`, `.lyr-ghead`, `.menu-label`) — `--t-2xs` (10px), weight 700,
      UPPERCASE, `letter-spacing: 0.06–0.08em`, `--text-3`.
    - Body / item label — `--t-base` (13px) or `--t-sm` (12px), weight 500–600, `--text`/`--text-2`.
    - Caption / meta — `--t-xs` (11px) or `--t-2xs` (10px), weight 600, `--text-3`.
    Multiline reading copy (descriptions, empty states, onboarding) uses `--lh-body`
    (1.5); single-line titles/labels use `--lh-tight` (1.25). Numeric readouts add
    `font-variant-numeric: tabular-nums` (or `.mono`).
  ```
- [ ] Audit sweep (report-only unless trivial): `grep -rn "line-height:\s*1\.[0-9]" src/styles/*.css` and note remaining hardcoded borders/line-heights on multiline copy that Tasks 2/4/5 didn't cover. Fix only single-token swaps; list anything larger in the commit body as follow-up (do not expand scope here).
- [ ] Bump `src/version.ts` to `'0.10.0.8'`.
- [ ] Add `CHANGELOG.md` entry: `## DOCS: border / hover / type-hierarchy conventions in src/ui/CLAUDE.md (v0.10.0.8)` — documents `--border` vs `--border-2`, the surface-step + `.liftable` + focus-within hover rules, and the `--t-*`/`--lh-*` type ladder; lists any un-swept violations found in the audit.
- [ ] Delete the P19 and P23 bullets from TODO.md.
- [ ] Run the doc-adjacent test guard: `npx vitest --run src/styles` → passes.
- [ ] Commit: `git commit -am "DOCS: border/hover/type-hierarchy conventions + violation sweep (v0.10.0.8)"`.

---

### Task 9: Batch visual verification

**Files:**
- Create `scripts/scenarios/ui-polish-batch2a.json` (scenario harness input).
- Reference `docs/visual-verification-playbook.md` for step vocabulary and gotchas.

**Interfaces:** consumes `window.__store` levers; produces screenshots reviewed by eye. Covers: stagger entrance on Edit-menu open, card hover-lift, hover-reveal row actions in Layers (hover + keyboard focus), a sticky group/section header mid-scroll, and an empty state rendering with the new `--lh-body`.

**Steps:**

- [ ] Read `docs/visual-verification-playbook.md` and an existing scenario JSON in `scripts/scenarios/` (e.g. `ui-polish-batch1.json`) to match the step schema exactly (`eval`/`waitFor`/`click`/`screenshot`/`store`/`viewport`/`hover`).
- [ ] Author `scripts/scenarios/ui-polish-batch2a.json` with ordered named steps:
  - `stagger-edit-menu`: `click` the Edit toolbar menu trigger → `waitFor` `.pop-panel.stagger-in .menu-item` → `screenshot` immediately (expect the items mid-cascade / just-settled). Add an `eval` asserting the container has class `stagger-in`.
  - `card-hover-lift`: ensure the catalog is open (`store` lever), `hover` a `.cat-card` (or `eval` a `:hover` proxy — playbook notes how to force hover), `waitFor` past `--dur` → `screenshot` (expect the card raised 2px with `--shadow-pop`).
  - `layers-row-actions-hover`: open Layers (`store`), seed ≥1 item, `hover` a `.lyr-row` → `screenshot` (expect `.lyr-acts` visible). Then `layers-row-actions-focus`: `eval` `document.querySelector('.lyr-row button')?.focus()` → `screenshot` (expect actions revealed via `:focus-within`).
  - `sticky-header`: open Layers with enough items to scroll (seed many, or the Inspector with several `.sec` sections), `eval` scroll the `.lyr-body` (or `.panel-body`) down ~120px → `waitFor` → `screenshot` (expect the header pinned at the top of the scroll body with its hairline, content scrolling beneath).
  - `empty-state-lineheight`: drive an empty state using `.empty-mini`/`.empty-sub` (e.g. History panel with no edits, or Favourites tab with none) → `waitFor` → `screenshot`. Add an `eval` logging `getComputedStyle(el).lineHeight` as a sanity check.
- [ ] Run once (never alongside the full test suite): `node scripts/shot.mjs --scenario scripts/scenarios/ui-polish-batch2a.json --out-dir <scratchpad>/shots`.
- [ ] **Visually review every screenshot** and report what you saw per surface: menu items cascade in (not all-at-once); card lifts 2px with pop-shadow; row actions appear on hover AND keyboard focus; the section header stays pinned mid-scroll with its hairline; empty-state copy at the roomier 1.5 leading. Also re-check reduced-motion (playbook technique): confirm the menu items appear together (no one-by-one). Note any artifact and fix before finalising. Green tests are not proof.
- [ ] Run the full suite once: `npm test`, then `npx tsc --noEmit` and `npm run check`.
- [ ] Bump `src/version.ts` to `'0.10.0.9'`.
- [ ] Add `CHANGELOG.md` entry: `## CHORE: visual-verification scenario for UI polish batch 2a (v0.10.0.9)` — covering stagger entrance, card hover-lift, hover/focus row-action reveal, sticky headers mid-scroll, and empty-state line-height; report observed results.
- [ ] Commit: `git commit -am "CHORE: ui-polish-batch2a visual-verification scenario (v0.10.0.9)"`.

---

### Critical Files for Implementation
- src/styles/tokens.css
- src/styles/features.css
- src/styles/components.css
- src/styles/app.css
- src/ui/CLAUDE.md
