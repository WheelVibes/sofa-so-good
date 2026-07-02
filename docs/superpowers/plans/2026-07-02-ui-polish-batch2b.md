> **Orchestrator amendment (2026-07-02):** The Batch 2a final-review fix (stagger fill-mode
> `both` → `backwards`) landed as **v0.10.0.13** after this plan was authored. All version bumps
> shift by one: Task 1 → **0.10.0.15**, Task 2 → **0.10.0.16**, … Task 11 → **0.10.0.25** (this plan doc itself shipped as the v0.10.0.14 DOCS commit)
> (same order; remap every version/changelog reference accordingly). That fix also touched
> `src/styles/components.css` (stagger rule), `src/ui/CLAUDE.md` (motion bullet), and
> `docs/visual-verification-playbook.md` (reduced-motion note) — re-locate all edit targets by
> content and extend (don't duplicate) the CLAUDE.md bullets.

> **Orchestrator context (2026-07-02):** This plan targets the integration worktree at `/home/cwlroda/projects/sofa-so-good/.claude/worktrees/ui-polish-program` (branch `worktree-ui-polish-program`). Batch 1 + Batch 2a are already merged here: the `--focus-ring`/`--modal-*` tokens, the `--dur-1/-2/-3`/`--ease-out` motion scale, `--lh-tight`/`--lh-body`, `.liftable`, `.stagger-in`, sticky `.lyr-ghead-row`/`.sec-h` headers, `.mi-kbd` chips, `IconButton` disabled/reason props, and the delete→Undo toast, plus main's Docker/Electron work. Do **not** read the primary checkout at `/home/cwlroda/projects/sofa-so-good` — it is a different branch. All line numbers below were read from this worktree on 2026-07-02; **re-locate every edit target by content before editing** (batch commits shift line numbers).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **TODO.md convention (user, 2026-07-02):** shipped items are removed from TODO.md entirely — never left as checked/"SHIPPED" lines. Each task that ships a P-item deletes that item's bullet from TODO.md in the same commit.

# Batch 2b — UI/UX polish program (primitives / inline-px / motion subset)

## Goal

Ship the remaining "Batch 2 — medium" items in `TODO.md`: **P10** panel-width tokens, **P9** purge hardcoded px from React inline styles (+ a regression guard), **P15** a typed `<Button>` primitive over the existing `.btn-*` vocabulary, **P16** a Button `loading` state wired to a real async action, **P17** a `.skeleton` loader primitive on catalog card images, **P3** desktop panel slide/fade entrance, **P5** success/confirm micro-animations (toast checkmark pop + `EditConfirmBar` dismiss), **P28** an empty-state CTA sweep, **P35** a documented + enforced destructive-confirmation policy, and a scoped ruling on **P34** optimistic placement feedback (DROP with rationale — the confirm-bar model already gives immediate feedback). One final visual-verification task covers the batch. Everything builds on the existing OKLch token system + the Batch 2a motion scale; no framework changes.

## Architecture

- **Tokens** live in `src/styles/tokens.css` `:root`: spacing `--s-1:4px … --s-7:28px`, type `--t-2xs:10px … --t-xl:20px`, motion `--dur:0.16s`/`--ease` + Batch 2a's `--dur-1:150ms`/`--dur-2:300ms`/`--dur-3:600ms`/`--ease-out: cubic-bezier(0.16,1,0.3,1)`, line-height `--lh-tight:1.25`/`--lh-body:1.5`.
- **Panel widths (P10):** floating `.catalog` `width:326px` (`parts.css`), `.inspector` `width:300px` (`parts.css`), `.er-finish` `width:312px` (`flows.css`); tablet ≤1024 variants in `responsive.css` (`.catalog 300px`, `.inspector 284px`, `.er-finish 296px`). The docked rail is a **fixed `320px`** (`components.css`) driven by `:has(.dock-panel)`/`:has(.dock-panel-left)` — so normalising the floating widths to `320px` makes a panel the same width whether floating or docked.
- **Buttons (P15/P16):** the class vocabulary is `.btn` + `.btn-accent`/`.btn-soft`/`.btn-danger`/`.btn-block`/`.btn-sm` (`components.css`). No `Button` component exists — controls live in `src/ui/controls/` (`Select.tsx`, `ColorPicker.tsx`). Spinner idiom: `@keyframes toastspin` + `.toast .icn.spin { animation: toastspin 0.9s linear infinite }` (`features.css`).
- **Skeleton (P17):** async thumbnails resolve via `useBuiltinThumbnail(def)` (returns `null` while a gltf/parametric render is pending — `catalog/thumbnails.tsx`) and `useThumbnail(entry, visible)` (`RemoteCard.tsx`). `.card-thumb` (`parts.css`) is the `position:relative` box; while `thumb` is null it renders a `CategoryIcon` placeholder. RemoteCard already overlays a `.thumb-status` "Downloading…" pill. The inspector `.insp-thumb` renders a **synchronous** `CategoryIcon` only — no async image — so P17 does **not** apply there (documented in the task).
- **Panel mount / dock (P3):** `.dock-panel`/`.dock-panel-left` panels **mount on open**; `:has()` opens `--right-rail`/`--left-rail` (`components.css`). Mobile ≤640 keeps bottom-sheets animated via `@keyframes sheetUp` (`responsive.css`). The rail width vars are plain custom properties set inside a `:has()` selector — a `transition` on `.stage-area`'s `left`/`right` (which read the vars) can animate the canvas reflow; the panel's own entrance animates via a keyframe on mount.
- **Toast / confirm (P5):** `NotificationContainer.tsx` renders `.toast in` (+ `err`) with the kind glyph `className={`icn${kind==='progress'?' spin':''}`}`; success uses `Icon.Check`. `EditConfirmBar.tsx` mounts only while `pendingEdit != null`; `.edit-confirm` entrance is `animation: sheetDrop var(--dur) var(--ease)` and the element carries `transform: translateX(-50%)` (`parts.css`) — any exit keyframe MUST preserve that translateX.
- **Empty states (P28):** `src/ui/EmptyState.tsx` (`icon`+`title`+`description?`+`cta?`). 15 usages across `CommentsPanel`, `VersionsPanel`, `AccessibilityPanel`, `DaylightPanel`, `SwapModal`, `BudgetPanel` (×2), `HistoryPanel`, `catalog/CatalogDrawer` (×5), `catalog/RemoteBrowseTab` (×2), `catalog/LayersPanel` (×2). Existing CTAs: CommentsPanel ("+ Add comment"), CatalogDrawer "no matches"/"nothing in budget", RemoteBrowseTab "clear search".
- **Destructive actions (P35):** `confirmAction({...}) → Promise<boolean>` (prompt slice, `ConfirmModal.tsx`) is the themed confirm; already used by `FinishPicker.clearRoom` and file-menu resets. Missing confirms: `VersionsPanel.remove(slot)` (deletes a saved-version slot from localStorage) and `SavedViewsSection` `deleteView(v.id)` — both irreversible, no confirm. `itemsSlice` deletes already conform (Undo toast).
- **Placement (P34):** drag from a catalog card arms placement (`CatalogCard.tsx`), `dragover` drives the live `PlacementGhost` following the cursor, and `drop` commits via the shared path to a `pendingEdit` → `EditConfirmBar` (`usePlacementController.ts`). Immediate feedback already exists — see the P34 ruling in Task 10.
- **Test precedent:** `src/styles/*.test.ts` are `readFileSync`+regex grep tests. TSX gets `@testing-library/react` tests. `scripts/scenarios/*.json` drive `node scripts/shot.mjs --scenario`.

## Tech Stack

React 18 + TypeScript, Zustand sliced store (`src/state/store.ts`, `window.__store`), Vite, Vitest + @testing-library/react (jsdom), Biome (2-space / 100-col / single-quote / no-semicolons). Pure OKLch CSS token system across 5 themes × light/dark. Visual verification via `node scripts/shot.mjs --scenario <file.json>` (see `docs/visual-verification-playbook.md`).

## Global Constraints

- **No hardcoded colours anywhere** — CSS token vocabulary only (`--accent`, `--surface-*`, `--text-*`, `--border`/`--border-2`, `--shadow-*`, `--danger*`, `color-mix(… var(--accent) …)`). Never a colour literal or Tailwind colour utility. Every surface must work in light + dark across all 5 themes.
- **Reduced motion:** every new keyframe/transition/animation-delay MUST be covered by the global `@media (prefers-reduced-motion: reduce)` block in `app.css`, which already zeroes `animation-duration`/`animation-delay`/`animation-iteration-count`/`transition-duration`/`transition-delay`/`scroll-behavior` on `*`. New animations using `animation`/`transition` shorthand inherit those resets; extend the block only if a new property needs explicit zeroing. The skeleton shimmer must fall back to a static fill under reduce-motion (verify no frozen off-screen gradient — use a reduce-motion override to a plain `--surface-3` fill if so). NOTE (from the 2a fix): stagger/entrance keyframes use fill-mode `backwards`, never `both`.
- **Feature flags — judged per item:** P10 (tokens), P9 (px purge + guard), P15/P16 (primitive), P17 (skeleton), P3/P5 (pure motion polish) ship **without a flag**. P28 wires **existing** handlers into existing empty states = no new flag; where a wired CTA's handler is pro-tier (its panel only renders in Pro), the CTA rides that panel's existing gating — assert both modes in the CTA test. P35 documents/enforces an existing policy = no flag.
- **Simple/Pro:** the `<Button>` primitive is mode-neutral. P28 CTA targets that live in pro-gated panels (Versions, Budget, …) must be tested in **both** modes (panel/CTA hidden in Simple, present in Pro). Mode-neutral empty states need no per-mode test.
- **Tests:** TDD. CSS-only work gets a `src/styles/*.test.ts` grep test. Component work gets an `@testing-library/react` test. The inline-px guard is itself a vitest test (`src/ui/inlinePxGuard.test.ts`) so the pre-commit hook blocks regressions. Targeted vitest while iterating; the hook runs the full suite per commit. Never run the full suite and the screenshot harness simultaneously.
- **Versioning (amended):** every commit bumps `APP_VERSION` sequentially from `'0.10.0.15'` (Task 1 → `.15` … Task 11 → `.25`) and adds a `CHANGELOG.md` entry at the top. `package.json` stays `0.10.0`. Biome style.
- **ONE COMMIT PER TASK.** `TYPE: summary (vX)`; body ends with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer. Each task that ships a P-item **deletes that item's bullet from TODO.md** in the same commit.
- **Docs:** any new primitive/convention updates `src/ui/CLAUDE.md` (P15 Button rule, P35 policy) in the same commit — extend the existing sections, don't duplicate.
- **Visual verification:** one final task (Task 11) covers the batch.

**Parallel-dispatch file map** (files each task *modifies* — disjoint groups can run concurrently):
- **T1 (P10):** `tokens.css`, `parts.css`, `flows.css`, `responsive.css`, new `panelWidth.test.ts`.
- **T2 (P9):** `ElevationPanel.tsx`, `RenderCompareModal.tsx`, `LocationPrompt.tsx`, `FinishPicker.tsx`, new `inlinePxGuard.test.ts`.
- **T3 (P15):** new `controls/Button.tsx` + `Button.test.tsx`, `components.css` (spinner rule), `src/ui/CLAUDE.md`, ~10 call-site files (choose files NOT touched by T2/T4/T8/T9).
- **T4 (P16):** `controls/Button.tsx` (loading prop — **sequential after T3**), `HqRenderModal.tsx`, `Button.test.tsx`.
- **T5 (P17):** new `.skeleton` in `parts.css`, `CatalogCard.tsx`, `RemoteCard.tsx`, new `skeleton.test.ts` + `CatalogCard.skeleton.test.tsx`.
- **T6 (P3):** `components.css`/`responsive.css` (panel entrance + rail transition), new `panelSlide.test.ts`.
- **T7 (P5):** `features.css` (toast pop), `parts.css` (edit-confirm exit), `NotificationContainer.tsx`, `EditConfirmBar.tsx`, new `confirmAnim.test.ts` + `EditConfirmBar.dismiss.test.tsx`.
- **T8 (P28):** the EmptyState consumer files, panel tests.
- **T9 (P35):** `VersionsPanel.tsx`, `SavedViewsSection.tsx`, `src/ui/CLAUDE.md`, tests.
- **T10 (P34):** `TODO.md`, `src/ui/CLAUDE.md`, `CHANGELOG.md` (docs-only ruling).
- **T11:** new `scripts/scenarios/ui-polish-batch2b.json`.

T1, T5, T6, T7 are fully CSS/independent and can run in one group. T2/T3/T4 share `components.css`+call sites — sequence or partition carefully. T8/T9 touch panel components — keep disjoint from T3's chosen call sites.

---

### Task 1: P10 — Panel width tokens

**Files:**
- Modify `src/styles/tokens.css` — add `--panel-w`/`--panel-w-compact` inside `:root` (after the spacing scale).
- Modify `src/styles/parts.css` — `.catalog` `width:326px` → token; `.inspector` `width:300px` → token.
- Modify `src/styles/flows.css` — `.er-finish` `width:312px` → token.
- Modify `src/styles/responsive.css` — tablet ≤1024 `.catalog`/`.inspector`/`.er-finish` widths → `--panel-w-compact`.
- Test: create `src/styles/panelWidth.test.ts`.

**Interfaces:** Produces `--panel-w: 320px` (canonical side-panel width — matches the docked rail's fixed `320px`, so a panel is the same width floating or docked) and `--panel-w-compact: 288px` (tablet ≤1024). Replaces the three hand-tuned floating widths (326/300/312 → 320; deltas −6/+20/+8 — the inspector +20 is intentional normalization to its docked width) and their tablet variants (300/284/296 → 288). Non-scoped side panels (`.er-list`, `.plan-props`) are left as-is (out of scope; noted in changelog).

**Steps:**

- [ ] Write `src/styles/panelWidth.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'

  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P10 panel width tokens', () => {
    it('defines --panel-w 320px and --panel-w-compact 288px', () => {
      const tokens = read('./tokens.css')
      expect(tokens).toMatch(/--panel-w:\s*320px/)
      expect(tokens).toMatch(/--panel-w-compact:\s*288px/)
    })
    it('drives the floating catalog/inspector/finish widths off --panel-w', () => {
      expect(read('./parts.css')).toMatch(/\.catalog\s*\{[^}]*width:\s*var\(--panel-w\)/s)
      expect(read('./parts.css')).toMatch(/\.inspector\s*\{[^}]*width:\s*var\(--panel-w\)/s)
      expect(read('./flows.css')).toMatch(/\.er-finish\s*\{[^}]*width:\s*var\(--panel-w\)/s)
    })
    it('drives the tablet variants off --panel-w-compact and leaves no bare 326/312px', () => {
      const r = read('./responsive.css')
      expect(r).toMatch(/\.catalog\s*\{\s*width:\s*var\(--panel-w-compact\)/)
      expect(read('./parts.css')).not.toMatch(/\.catalog\s*\{[^}]*width:\s*326px/s)
      expect(read('./flows.css')).not.toMatch(/\.er-finish\s*\{[^}]*width:\s*312px/s)
    })
  })
  ```
- [ ] Run it, expect failure: `npx vitest --run src/styles/panelWidth.test.ts`.
- [ ] Implement `src/styles/tokens.css`, inside `:root` after `--s-7: 28px;`:
  ```css
  /* Side-panel widths (P10). --panel-w matches the docked rail (320px) so a
     floating panel keeps its width when it docks; --panel-w-compact is the
     tablet (≤1024) width. Replaces the hand-tuned 326/300/312 + 300/284/296. */
  --panel-w: 320px;
  --panel-w-compact: 288px;
  ```
- [ ] Implement `src/styles/parts.css`: `.catalog` `width: 326px` → `width: var(--panel-w)`; `.inspector` `width: 300px` → `width: var(--panel-w)` (preserve `left`/`right`/`top`/`max-height`).
- [ ] Implement `src/styles/flows.css`: `.er-finish` `width: 312px` → `width: var(--panel-w)`.
- [ ] Implement `src/styles/responsive.css` (≤1024 block): `.catalog`/`.inspector`/`.er-finish` widths → `var(--panel-w-compact)`. Leave `.er-list`/`.plan-props` untouched.
- [ ] Bump `src/version.ts` to `'0.10.0.14'`.
- [ ] Add `CHANGELOG.md` entry: `## REFACTOR: --panel-w/--panel-w-compact panel-width tokens (v0.10.0.14)` — floating catalog/inspector/finish widths normalized to `--panel-w` (320px, matching the docked rail) with `--panel-w-compact` (288px) on tablet; `.er-list`/`.plan-props` left as follow-up.
- [ ] Delete the P10 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/styles/panelWidth.test.ts` → passes.
- [ ] Commit: `git commit -am "REFACTOR: --panel-w/--panel-w-compact tokens replace hand-tuned panel widths (v0.10.0.14)"`.

---

### Task 2: P9 — Purge hardcoded px from inline styles + regression guard

**Files:**
- Modify `src/ui/ElevationPanel.tsx`, `src/ui/RenderCompareModal.tsx`, `src/ui/LocationPrompt.tsx`, `src/ui/FinishPicker.tsx` — map literal px/bare-number `padding`/`margin`/`fontSize`/`gap` onto `--s-N`/`--t-N` tokens (locate by grep, line numbers have shifted).
- Create `src/ui/inlinePxGuard.test.ts` — the regression blocker (runs in the suite → hook blocks NEW literals).

**Interfaces:** The guard scans every `src/ui/**/*.tsx` (excluding `*.test.tsx`), extracts inline-style layout-text props, and flags a literal px string or bare number on `padding*`, `margin*`, `fontSize`, `gap`, `rowGap`, `columnGap`. **Exemptions (allowlist):** values containing `var(--`, the value `0`, template strings (`${…}` — computed); the flagged prop set never includes width/height/min*/max*/inset/top/left/right/bottom/size (canvas/computed dims always allowed). Remaining pre-existing offenders are grandfathered in an explicit `GRANDFATHERED` set (populated from a fresh audit) so the guard fails only on NEW literals. The four named files are fixed and removed from the grandfather set. Token map: `4→--s-1`, `6→--s-2`, `8→--s-3`, `12→--s-4`, `16→--s-5`, `20→--s-6`; fonts `10→--t-2xs`, `11→--t-xs`, `12→--t-sm`, `13→--t-base`, `14→--t-md`, `16→--t-lg`. For odd values (`'2px 6px'`, `'2px 7px'`, `'3px 0'`) map to the nearest scale composition (`var(--s-1) var(--s-2)` etc.) preserving density within ≤1px.

**Steps:**

- [ ] Write `src/ui/inlinePxGuard.test.ts` (real implementation — reads the tree, flags NEW px):
  ```ts
  import { readdirSync, readFileSync, statSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { dirname, join, relative } from 'node:path'
  import { describe, expect, it } from 'vitest'

  const uiRoot = dirname(fileURLToPath(import.meta.url))
  const FLAGGED = /\b(padding|paddingTop|paddingBottom|paddingLeft|paddingRight|margin|marginTop|marginBottom|marginLeft|marginRight|fontSize|gap|rowGap|columnGap)\s*:\s*('[^']*\d[^']*'|"[^"]*\d[^"]*"|\d[\d.]*)/g
  // Files with pre-existing literals, grandfathered as follow-up (NEW files must be clean).
  const GRANDFATHERED = new Set<string>([
    /* populate from the audit: every current offender EXCEPT the four fixed files */
  ])

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) return walk(p)
      return n.endsWith('.tsx') && !n.endsWith('.test.tsx') ? [p] : []
    })

  const offenders = (src: string): string[] => {
    const hits: string[] = []
    for (const m of src.matchAll(FLAGGED)) {
      const val = m[2]
      if (val.includes('var(--') || val.includes('${') || val === '0') continue
      hits.push(m[0])
    }
    return hits
  }

  describe('P9 inline-px guard', () => {
    it('no NEW literal px/number padding/margin/fontSize/gap in inline styles', () => {
      const bad: string[] = []
      for (const file of walk(uiRoot)) {
        const rel = relative(uiRoot, file)
        if (GRANDFATHERED.has(rel)) continue
        const hits = offenders(readFileSync(file, 'utf8'))
        if (hits.length) bad.push(`${rel}: ${hits.join(', ')}`)
      }
      expect(bad, `Use --s-N/--t-N tokens (or add to GRANDFATHERED with a reason):\n${bad.join('\n')}`).toEqual([])
    })
    it('the four re-audited files are clean (removed from the grandfather set)', () => {
      for (const f of ['ElevationPanel.tsx', 'RenderCompareModal.tsx', 'LocationPrompt.tsx', 'FinishPicker.tsx']) {
        expect(GRANDFATHERED.has(f)).toBe(false)
        expect(offenders(readFileSync(join(uiRoot, f), 'utf8'))).toEqual([])
      }
    })
  })
  ```
  (Populate `GRANDFATHERED` from a fresh audit — `grep -rnE "(padding|margin|fontSize|gap):\s*('[0-9]|[0-9])" src/ui --include='*.tsx' | grep -v 'var(--'` — listing every current offender file EXCEPT the four being fixed. Refine `FLAGGED` while iterating so it does not false-positive on `width`/`height`/`minWidth`/`inset`.)
- [ ] Run it, expect failure: `npx vitest --run src/ui/inlinePxGuard.test.ts` (the four files still have literals).
- [ ] Fix `ElevationPanel.tsx`: `gap: 4` → `gap: 'var(--s-1)'`; `padding: '2px 6px'` → `'var(--s-1) var(--s-2)'`; `padding: '2px 0'`/`'3px 0'` → `'var(--s-1) 0'`.
- [ ] Fix `RenderCompareModal.tsx`: `gap: 8` → `'var(--s-3)'`; `gap: 6` → `'var(--s-2)'`; `padding: '4px 8px'` → `'var(--s-1) var(--s-3)'`; `fontSize: 16` → `'var(--t-lg)'`; `fontSize: 14` → `'var(--t-md)'`; `fontSize: 11` → `'var(--t-xs)'`; `padding: '2px 7px'` → `'var(--s-1) var(--s-2)'`; `padding: 24` → `'var(--s-6)'` (nearest, preserving roominess); `marginTop: 8` → `'var(--s-3)'`; `minHeight: 16` stays (height exempt); `letterSpacing: 0` stays (0 exempt).
- [ ] Fix `LocationPrompt.tsx`: `marginTop: 6` (×4) → `'var(--s-2)'`; `margin: '8px 0 0'` → `'var(--s-3) 0 0'`; `padding: 0` stays.
- [ ] Fix `FinishPicker.tsx`: `gap: 8` → `'var(--s-3)'`; `margin: '2px 0 0'` → `'var(--s-1) 0 0'`; `margin: '6px 0 0'` → `'var(--s-2) 0 0'`.
- [ ] Remove the four filenames from `GRANDFATHERED` in the test.
- [ ] Bump `src/version.ts` to `'0.10.0.15'`.
- [ ] Add `CHANGELOG.md` entry: `## REFACTOR: purge hardcoded px from inline styles + regression guard (v0.10.0.15)` — the four files tokenized; new `inlinePxGuard.test.ts` fails on NEW literal px/number in `padding`/`margin`/`fontSize`/`gap` inline styles (widths/heights/computed allowed; remaining files grandfathered as follow-up).
- [ ] Delete the P9 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/ui/inlinePxGuard.test.ts` → passes.
- [ ] Commit: `git commit -am "REFACTOR: tokenize inline px in Elevation/RenderCompare/Location/Finish + add inline-px guard (v0.10.0.15)"`.

---

### Task 3: P15 — `<Button>` primitive

**Files:**
- Create `src/ui/controls/Button.tsx` + `src/ui/controls/Button.test.tsx`.
- Modify `src/styles/components.css` — add the button spinner rule (near the `.btn` block).
- Modify `src/ui/CLAUDE.md` — add a "Button primitive" convention line (controls area).
- Convert a REPRESENTATIVE ~10 call sites across panels/modals (choose files NOT touched by Task 2/4/8/9 — e.g. `SwapModal.tsx`, `CommentsPanel.tsx`, `DaylightPanel.tsx`, `AccessibilityPanel.tsx`, `catalog/CatalogDrawer.tsx` footer, `EmptyState.tsx`'s CTA button, `NotificationDetailsModal` Close). Leave a follow-up note for the rest.

**Interfaces:** `Button` is a thin typed composer over the existing classes — **the classes stay the source of truth**. Props: `variant?: 'default' | 'accent' | 'soft' | 'danger'` (→ `''`/`btn-accent`/`btn-soft`/`btn-danger`), `size?: 'default' | 'sm'` (→ `btn-sm`), `block?: boolean` (→ `btn-block`), `icon?: ReactNode` (rendered before children), plus all native `<button>` attributes via `ButtonHTMLAttributes`. `loading` is added in Task 4 (do not implement here). Composes `className` so callers may still append classes.

**Steps:**

- [ ] Write `src/ui/controls/Button.test.tsx`:
  ```tsx
  import { render } from '@testing-library/react'
  import { describe, expect, it } from 'vitest'
  import { Button } from './Button'

  describe('P15 Button primitive', () => {
    it('composes the .btn vocabulary from variant/size/block', () => {
      const { getByRole } = render(<Button variant="accent" size="sm" block>Go</Button>)
      const cls = getByRole('button').className
      expect(cls).toContain('btn')
      expect(cls).toContain('btn-accent')
      expect(cls).toContain('btn-sm')
      expect(cls).toContain('btn-block')
    })
    it('defaults to a plain .btn and appends caller className', () => {
      const { getByRole } = render(<Button className="foo">Hi</Button>)
      const cls = getByRole('button').className
      expect(cls).toContain('btn')
      expect(cls).not.toContain('btn-accent')
      expect(cls).toContain('foo')
    })
    it('renders an icon before the label and forwards native props', () => {
      const { getByRole } = render(<Button icon={<svg data-testid="ic" />} type="submit">Save</Button>)
      const btn = getByRole('button')
      expect(btn.getAttribute('type')).toBe('submit')
      expect(btn.querySelector('[data-testid="ic"]')).not.toBeNull()
    })
  })
  ```
- [ ] Run it, expect failure (no `Button`).
- [ ] Implement `src/ui/controls/Button.tsx`:
  ```tsx
  import type { ButtonHTMLAttributes, ReactNode } from 'react'

  const VARIANT: Record<'default' | 'accent' | 'soft' | 'danger', string> = {
    default: '',
    accent: 'btn-accent',
    soft: 'btn-soft',
    danger: 'btn-danger',
  }

  export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Maps to the .btn-* vocabulary (the classes stay the source of truth). */
    variant?: 'default' | 'accent' | 'soft' | 'danger'
    size?: 'default' | 'sm'
    block?: boolean
    icon?: ReactNode
  }

  /**
   * Typed composer over the .btn / .btn-accent|soft|danger / .btn-sm / .btn-block
   * classes (components.css). It owns no colours or sizes — it only assembles the
   * existing vocabulary so call sites stop drifting on padding/variant strings.
   * `loading` (Task P16) adds an inline spinner + aria-busy on top of this.
   */
  export function Button({
    variant = 'default',
    size = 'default',
    block = false,
    icon,
    className = '',
    type = 'button',
    children,
    ...rest
  }: ButtonProps) {
    const cls = ['btn', VARIANT[variant], size === 'sm' ? 'btn-sm' : '', block ? 'btn-block' : '', className]
      .filter(Boolean)
      .join(' ')
    return (
      <button type={type} className={cls} {...rest}>
        {icon}
        {children}
      </button>
    )
  }
  ```
- [ ] Add to `src/styles/components.css` (near the `.btn` block):
  ```css
  /* Inline button spinner (P16). Reuses @keyframes toastspin (features.css). */
  .btn .btn-spin { animation: toastspin 0.9s linear infinite; transform-origin: 50% 50%; flex: none; }
  ```
- [ ] Convert ~10 representative call sites to `<Button …>` — mechanical swap keeping identical classes/behaviour (`className="btn btn-accent btn-block"` → `<Button variant="accent" block>`, etc.). Include `EmptyState.tsx`'s CTA button. Do NOT touch delete/destructive buttons owned by Task 9, the HQ render button owned by Task 4, or Task 2's files.
- [ ] Add a follow-up note in the commit body listing the remaining un-converted `.btn` call-site count.
- [ ] Add to `src/ui/CLAUDE.md` (controls area, after the Select/ColorPicker rule):
  ```md
  - **Buttons use the `<Button>` primitive** (`controls/Button.tsx`): pass
    `variant`/`size`/`block`/`icon`/`loading` instead of hand-writing `.btn-*`
    class strings. The `.btn-*` classes stay the source of truth — `Button` only
    composes them. New buttons use it; the raw classes remain valid for legacy
    call sites being migrated.
  ```
- [ ] Bump `src/version.ts` to `'0.10.0.16'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: typed <Button> primitive over the .btn-* vocabulary (v0.10.0.16)`.
- [ ] Delete the P15 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/ui/controls/Button.test.tsx` → passes.
- [ ] Commit: `git commit -am "FEAT: <Button> primitive composing the .btn-* classes + migrate representative call sites (v0.10.0.16)"`.

---

### Task 4: P16 — Button pending (`loading`) state

**Files:**
- Modify `src/ui/controls/Button.tsx` — add `loading?: boolean` (**sequential after Task 3**).
- Modify `src/ui/controls/Button.test.tsx` — loading-state assertions.
- Modify `src/styles/components.css` — `.btn.is-loading` rule.
- Modify `src/ui/HqRenderModal.tsx` — wire `loading` to the real async render start.

**Interfaces:** `loading?: boolean` — when true: inline spinner (`<Icon.Versions className="btn-spin" width={14} height={14} aria-hidden />` — reusing `.btn-spin`/`toastspin`) replaces `icon`, `aria-busy`, `is-loading` class (`pointer-events: none; opacity: 0.7`), and `disabled = disabled || loading`. Real wiring: HqRenderModal's "Start render" (`start` async setup, `phase === 'building'`).

**Steps:**

- [ ] Extend `src/ui/controls/Button.test.tsx`:
  ```tsx
  it('loading sets aria-busy, disables, and swaps in a spinner', () => {
    const onClick = vi.fn()
    const { getByRole } = render(<Button loading onClick={onClick}>Start</Button>)
    const btn = getByRole('button') as HTMLButtonElement
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(btn.disabled).toBe(true)
    expect(btn.querySelector('.btn-spin')).not.toBeNull()
  })
  ```
  (import `vi` from `vitest`.)
- [ ] Run it, expect failure.
- [ ] Extend `Button.tsx`: `loading = false` prop; `aria-busy={loading || undefined}`, `disabled={disabled || loading}`, `is-loading` in the class list while loading, spinner in place of `icon` while loading (`import { Icon } from '../toolbar/icons'`). Add `.btn.is-loading { pointer-events: none; opacity: 0.7; }` to `components.css`.
- [ ] Wire `HqRenderModal.tsx`: the plain start `<button>` → `<Button loading={phase === 'building'} onClick={start}>{…}</Button>` (import Button; keep sibling buttons as-is).
- [ ] Bump `src/version.ts` to `'0.10.0.17'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: Button loading state — inline spinner + aria-busy (v0.10.0.17)`.
- [ ] Delete the P16 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/ui/controls/Button.test.tsx` → passes.
- [ ] Commit: `git commit -am "FEAT: Button loading prop (spinner + aria-busy) wired to HQ render start (v0.10.0.17)"`.

---

### Task 5: P17 — Skeleton loader primitive

**Files:**
- Modify `src/styles/parts.css` — add `.skeleton` (near `.card-thumb`).
- Modify `src/styles/app.css` — reduced-motion override for `.skeleton` (only if the shimmer freezes off-screen; verify).
- Modify `src/ui/catalog/CatalogCard.tsx` — `.skeleton` fill in `.card-thumb` while a thumbnail is genuinely pending.
- Modify `src/ui/catalog/RemoteCard.tsx` — same while `visible && !thumb && status !== 'error'`.
- Test: create `src/styles/skeleton.test.ts` + `src/ui/catalog/CatalogCard.skeleton.test.tsx`.

**Interfaces:** `.skeleton` — token-only shimmer: `background: linear-gradient(100deg, var(--surface-3) 30%, var(--surface-2) 50%, var(--surface-3) 70%)`, `background-size: 200% 100%`, `animation: skeletonShimmer var(--dur-3) linear infinite`. Reduced-motion: duration zeroed by the global block → static fill; add an explicit `.skeleton { background: var(--surface-3) !important }` override in the reduce-motion block if a frozen off-band gradient shows. Applied only where a thumbnail is **genuinely loading**: CatalogCard when `!thumb` AND the def expects a rendered thumb (reuse the `useBuiltinThumbnail` null-while-pending signal; defs that never render a thumb keep the `CategoryIcon`); RemoteCard when `visible && !thumb && status !== 'error'` (keep the "Downloading…" pill on top). The inspector `.insp-thumb` is synchronous — P17 does not apply (documented).

**Steps:**

- [ ] Write `src/styles/skeleton.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P17 skeleton loader', () => {
    it('defines a token-only shimmer with a background-position keyframe', () => {
      const p = read('./parts.css')
      expect(p).toMatch(/\.skeleton\s*\{[^}]*animation:\s*skeletonShimmer/s)
      expect(p).toMatch(/@keyframes skeletonShimmer/)
      expect(p).toMatch(/\.skeleton\s*\{[^}]*var\(--surface-3\)/s)
    })
    it('uses no colour literal in the skeleton rule', () => {
      const block = read('./parts.css').match(/\.skeleton\s*\{[^}]*\}/s)?.[0] ?? ''
      expect(block).not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl|oklch/i)
    })
  })
  ```
- [ ] Write `src/ui/catalog/CatalogCard.skeleton.test.tsx` — render a card whose thumbnail is pending (read `CatalogCard.tsx` + `thumbnails.tsx` for real props/seeding), assert `.card-thumb .skeleton` present. (If seeding is heavy, substitute a RemoteCard skeleton test. One TSX test suffices.)
- [ ] Run both, expect failure.
- [ ] Implement `src/styles/parts.css`:
  ```css
  /* Skeleton loader (P17). Token-only shimmer over a loading media box. The
     shimmer keyframe's duration is zeroed under reduced-motion (app.css) so it
     settles to a static --surface-3 fill. */
  .skeleton {
    position: absolute; inset: 0;
    background: linear-gradient(100deg, var(--surface-3) 30%, var(--surface-2) 50%, var(--surface-3) 70%);
    background-size: 200% 100%;
    animation: skeletonShimmer var(--dur-3) linear infinite;
  }
  @keyframes skeletonShimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }
  ```
- [ ] Implement `CatalogCard.tsx`/`RemoteCard.tsx` per the Interfaces block (`<span className="skeleton" aria-hidden />` in `.card-thumb` while pending).
- [ ] Verify reduced-motion (quick eval or defer to Task 11): static fill, not a frozen off-band; add the app.css override if needed.
- [ ] Bump `src/version.ts` to `'0.10.0.18'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: .skeleton shimmer loader for catalog thumbnails (v0.10.0.18)` — token-only shimmer (reduced-motion → static) on CatalogCard/RemoteCard while pending; inspector thumb synchronous, untouched.
- [ ] Delete the P17 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/styles/skeleton.test.ts src/ui/catalog/CatalogCard.skeleton.test.tsx` → passes.
- [ ] Commit: `git commit -am "FEAT: .skeleton shimmer on catalog/remote card thumbnails while loading (v0.10.0.18)"`.

---

### Task 6: P3 — Desktop panel slide/fade entrance

**Files:**
- Modify `src/styles/components.css` — mount entrance keyframes on `.dock-panel`/`.dock-panel-left` + a transition on `.stage-area`'s rail-driven `left`/`right`.
- Test: create `src/styles/panelSlide.test.ts`.

**Interfaces:** No new tokens (uses `--dur-2` + `--ease-out`). Panels mount on open → a CSS mount animation fires once per open: `@keyframes dockPanelIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }` (right panel) and `dockPanelInLeft` (`translateX(-12px)`), gated inside the existing `@media (min-width: 641px)` dock block so mobile `sheetUp` sheets are untouched. **Fill-mode `backwards`, not `both`** (see the 2a fix — `both` locks transform/opacity). Rail transition: `.stage-area { transition: left var(--dur-2) var(--ease-out), right var(--dur-2) var(--ease-out); }` so the canvas eases as the rail opens/closes. **Verify in Task 11**; if the canvas reflow janks, keep only the panel entrance and drop the `.stage-area` transition (note it). Reduced-motion: both zeroed by the global block.

**Steps:**

- [ ] Write `src/styles/panelSlide.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P3 desktop panel slide', () => {
    it('defines a dock-panel mount entrance using --dur-2 + --ease-out with backwards fill', () => {
      const c = read('./components.css')
      expect(c).toMatch(/@keyframes dockPanelIn\b/)
      expect(c).toMatch(/\.dock-panel[^{]*\{[^}]*animation:\s*dockPanelIn var\(--dur-2\) var\(--ease-out\) backwards/s)
      expect(c).not.toMatch(/dockPanelIn var\(--dur-2\) var\(--ease-out\) both/)
    })
    it('eases the canvas reflow via a transition on the rail widths', () => {
      expect(read('./components.css')).toMatch(/\.stage-area\s*\{[^}]*transition:[^}]*(left|right)[^}]*var\(--dur-2\)/s)
    })
    it('scopes the entrance to desktop (≥641px)', () => {
      expect(read('./components.css')).toMatch(/min-width:\s*641px/)
    })
  })
  ```
- [ ] Run it, expect failure.
- [ ] Implement per the Interfaces block (extend the existing `.stage-area` rule; entrance rules inside the ≥641px media block; keyframes adjacent).
- [ ] Confirm mobile bottom-sheets unaffected (≥641px gating); verify in Task 11.
- [ ] Bump `src/version.ts` to `'0.10.0.19'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: desktop dock-panel slide+fade entrance (v0.10.0.19)`.
- [ ] Delete the P3 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/styles/panelSlide.test.ts` → passes.
- [ ] Commit: `git commit -am "FEAT: dock-panel slide+fade entrance + eased canvas reflow (v0.10.0.19)"`.

---

### Task 7: P5 — Success / confirm micro-animations

**Files:**
- Modify `src/styles/features.css` — success toast checkmark pop.
- Modify `src/styles/parts.css` — `.edit-confirm.leaving` / `.edit-confirm.rejecting` keyframes (preserve `translateX(-50%)`).
- Modify `src/ui/notifications/NotificationContainer.tsx` — `pop` class on the success glyph.
- Modify `src/ui/EditConfirmBar.tsx` — transient exit class before resolving.
- Test: create `src/styles/confirmAnim.test.ts` + `src/ui/EditConfirmBar.dismiss.test.tsx`.

**Interfaces:** Toast: `.toast .icn.pop { animation: checkPop var(--dur-2) var(--ease-out) backwards }` (backwards, not both), `@keyframes checkPop { 0% { transform: scale(0.4); opacity: 0 } 60% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }`; success glyph gets `' pop'`. EditConfirmBar: transient exit state — on confirm add `.leaving` (`@keyframes editConfirmLeave { to { opacity: 0; transform: translateX(-50%) translateY(12px) } }` with `forwards` fill — the element unmounts right after), on cancel `.rejecting` (`editConfirmShake`: ±3px wobble around `translateX(-50%)`), then call the store action after ~150ms via `setTimeout`/`animationend`; skip the delay when `matchMedia('(prefers-reduced-motion: reduce)').matches`. Keyboard Enter/Escape route through the same wrapped handlers. Reset the exit state when a fresh `pending` arrives.

**Steps:**

- [ ] Write `src/styles/confirmAnim.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P5 success/confirm micro-animations', () => {
    it('pops the success toast checkmark via a scale keyframe', () => {
      const f = read('./features.css')
      expect(f).toMatch(/@keyframes checkPop/)
      expect(f).toMatch(/\.toast .icn\.pop\s*\{[^}]*animation:\s*checkPop/s)
    })
    it('gives EditConfirmBar a slide-down leave and a shake reject (translateX preserved)', () => {
      const p = read('./parts.css')
      expect(p).toMatch(/@keyframes editConfirmLeave/)
      expect(p).toMatch(/@keyframes editConfirmShake/)
      expect(p).toMatch(/editConfirmLeave\s*\{[^}]*translateX\(-50%\)/s)
    })
  })
  ```
- [ ] Write `src/ui/EditConfirmBar.dismiss.test.tsx` — seed a `pendingEdit` (read `placementSlice.ts` for the shape; reuse existing seeding idioms), click Confirm → assert `.edit-confirm.leaving` synchronously; fresh pending, click Cancel → assert `.rejecting`. Use fake timers so the store action resolves after the transient class.
- [ ] Run both, expect failure.
- [ ] Implement the CSS (features.css checkPop; parts.css leave/shake keyframes + classes).
- [ ] Implement `NotificationContainer.tsx`: append `' pop'` to the success glyph className.
- [ ] Implement `EditConfirmBar.tsx`: `const [exit, setExit] = useState<'leaving' | 'rejecting' | null>(null)`; wrapped confirm/cancel handlers (used by clicks AND Enter/Escape); ~150ms delay via setTimeout unless reduced-motion; reset on new pending.
- [ ] Bump `src/version.ts` to `'0.10.0.20'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: success/confirm micro-animations (v0.10.0.20)`.
- [ ] Delete the P5 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/styles/confirmAnim.test.ts src/ui/EditConfirmBar.dismiss.test.tsx` → passes.
- [ ] Commit: `git commit -am "FEAT: toast checkmark pop + EditConfirmBar dismiss slide/shake (v0.10.0.20)"`.

---

### Task 8: P28 — Empty-state CTA sweep

**Files:**
- Modify the EmptyState consumers where a real handler exists: `src/ui/VersionsPanel.tsx`, `src/ui/BudgetPanel.tsx` (saved + placed), `src/ui/catalog/CatalogDrawer.tsx` (favourites, recent, "no items here"), `src/ui/catalog/LayersPanel.tsx` ("nothing placed"). Others documented as intentionally CTA-less.
- Test: extend/create the relevant panel tests to assert the CTA renders + fires the handler; **both modes** for pro-gated panels.

**Interfaces:** Each empty state gets a CTA **only when a real existing handler exists** (per `src/ui/CLAUDE.md` — never invent an action). Wiring:
- **VersionsPanel "No saved versions yet"** → `"Save current version"` calling the panel's existing `save()`. *(Pro — both modes.)*
- **BudgetPanel "No saved items"** and **"No furniture placed yet"** → `"Browse catalog"` via the existing catalog-open lever (verify the exact store action). *(Pro — both modes.)*
- **CatalogDrawer "No favourites yet"/"Nothing placed yet" (recent)/"No items here yet"** → `"Browse all"` switching to the browse/all tab (verify the tab setter). *(Mode-neutral.)*
- **LayersPanel "Nothing placed yet"** → `"Open catalog"` (wire the real tab switch the description already references).
- **Stay CTA-less (documented):** CommentsPanel (has one), RemoteBrowseTab (has "Clear search"; initial state is search-driven), CatalogDrawer no-matches/nothing-in-budget (have CTAs), AccessibilityPanel/DaylightPanel (analysis panels — the fix lives in the plan editor; a CTA would be a misleading dead-end), SwapModal no-alternatives (nothing to do; modal chrome closes), LayersPanel "No objects match" (search field is the affordance — add a "Clear filter" CTA only if a trivial setter exists).

**Steps:**

- [ ] Re-verify each handler by reading each consumer (tab setter, catalog-open lever, VersionsPanel `save`). Wire a CTA **only** where confirmed.
- [ ] Add `cta={{ label: '…', onClick: () => <realHandler>() }}` per the map above (match `EmptyState`'s real cta prop shape).
- [ ] Write/extend tests: CTA renders + calls handler; pro-gated panels tested in **both** modes (hidden in Simple, present+firing in Pro via `uiMode` + `reresolveFeatureFlags()` or `resolveFlags`).
- [ ] Run, expect failure → implement → green.
- [ ] Bump `src/version.ts` to `'0.10.0.21'`.
- [ ] Add `CHANGELOG.md` entry: `## FEAT: empty-state CTA sweep — no dead ends (v0.10.0.21)` + the intentionally-CTA-less list with rationale.
- [ ] Delete the P28 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run <touched panel tests>` → passes.
- [ ] Commit: `git commit -am "FEAT: wire empty-state CTAs to real handlers across panels (v0.10.0.21)"`.

---

### Task 9: P35 — Destructive confirmation policy (document + enforce)

**Files:**
- Modify `src/ui/CLAUDE.md` — the destructive-confirmation policy.
- Modify `src/ui/VersionsPanel.tsx` — gate `remove(slot)` behind `confirmAction`.
- Modify `src/ui/toolbar/menus/SavedViewsSection.tsx` — gate `deleteView(v.id)` behind `confirmAction`.
- Test: extend `VersionsPanel` / `SavedViewsSection` tests to assert the confirm gate.

**Interfaces:** Policy: **reversible destructive → Undo-toast** (item delete — already conforms); **irreversible destructive → confirm modal** (`confirmAction({...}) → Promise<boolean>`). Sweep: VersionsPanel `remove(slot)` and SavedViewsSection `deleteView` gain `confirmAction` gates (match the real option shape from the prompt slice / `FinishPicker.clearRoom` usage — title/body/confirmLabel/danger); `FinishPicker.clearRoom` + `itemsSlice` deletes already conform. Keep `e.stopPropagation()` in the menu so it stays open.

**Steps:**

- [ ] Read the exact `confirmAction` option shape (prompt slice + existing callers).
- [ ] Extend tests: delete click opens confirm; false → item stays; true → deleted. Both files.
- [ ] Run, expect failure → implement the gates (async handlers) → green.
- [ ] Add to `src/ui/CLAUDE.md` (near the EditConfirmBar / empty-state rules):
  ```md
  - **Destructive-action policy.** Reversible destructive actions (delete a placed
    item, clear the room's furniture) show an **Undo toast** (the action runs
    immediately, `notify` offers Undo — see `itemsSlice`). Irreversible actions
    (delete a saved version/slot, delete a saved view, reset/replace the whole
    design) MUST gate on `confirmAction({ title, body, confirmLabel, danger })`
    (`ConfirmModal`) and bail on `false`. Never a blocking `window.confirm`; never
    silent irreversible deletion.
  ```
- [ ] Bump `src/version.ts` to `'0.10.0.22'`.
- [ ] Add `CHANGELOG.md` entry: `## FIX: enforce destructive-confirmation policy (v0.10.0.22)`.
- [ ] Delete the P35 bullet from TODO.md.
- [ ] Run tests: `npx vitest --run src/ui/VersionsPanel*.test.tsx src/ui/toolbar/menus/SavedViewsSection*.test.tsx` → passes.
- [ ] Commit: `git commit -am "FIX: confirm-modal gate on saved-version + saved-view deletes; document policy (v0.10.0.22)"`.

---

### Task 10: P34 — Optimistic placement feedback (SCOPE RULING: DROP)

**Ruling: DROP P34 — the existing confirm-bar flow already gives immediate placement feedback; "optimistic ghost + reconcile" would be redundant work.**

**Rationale (verified against the worktree):** drag arms placement on `dragStart` (`CatalogCard.tsx`); `dragover` drives the live `PlacementGhost` at the cursor; `drop` commits via the shared path to a `pendingEdit` → `EditConfirmBar` ✓/✗ (`usePlacementController.ts`). The item is visible immediately on drop; confirm keeps it, cancel removes it — this IS optimistic-apply + reconcile. Placement is synchronous and local (no latency to hide). AI auto-arrange commits into `items` and is undoable via history. No gap; do not invent work.

**Files:** `TODO.md` (delete P34 bullet), `src/ui/CLAUDE.md` (one line so nobody re-opens this), `CHANGELOG.md` + `src/version.ts`.

**Steps:**

- [ ] Add to `src/ui/CLAUDE.md` (near the EditConfirmBar rule): *"Placement already gives immediate optimistic feedback: drag arms the live `PlacementGhost` (follows the cursor during `dragover`) and drop applies the item instantly into a `pendingEdit` reconciled by the ✓/✗ `EditConfirmBar` — there is no separate optimistic/reconcile layer to add."*
- [ ] Delete the P34 bullet from TODO.md.
- [ ] Bump `src/version.ts` to `'0.10.0.23'`.
- [ ] Add `CHANGELOG.md` entry: `## DOCS: drop P34 (optimistic placement already covered by ghost + confirm-bar) (v0.10.0.23)`.
- [ ] Run the doc-adjacent guard: `npx vitest --run src/styles src/ui/inlinePxGuard.test.ts` → passes.
- [ ] Commit: `git commit -am "DOCS: drop P34 — placement already gives immediate feedback via ghost + confirm bar (v0.10.0.23)"`.

---

### Task 11: Batch visual verification

**Files:**
- Create `scripts/scenarios/ui-polish-batch2b.json`.
- Reference `docs/visual-verification-playbook.md` + `scripts/scenarios/ui-polish-batch2a.json` for the step schema.

**Interfaces:** consumes `window.__store` levers; produces screenshots reviewed by eye. Covers: dock-panel slide entrance, Button loading spinner, skeleton shimmer, toast checkmark pop, EditConfirmBar dismiss, and one empty-state CTA.

**Steps:**

- [ ] Read the playbook + the 2a scenario for the step schema.
- [ ] Author `scripts/scenarios/ui-polish-batch2b.json`:
  - `panel-slide`: open a dock panel → `screenshot` immediately (mid slide-in + canvas easing) and after `--dur-2` (settled).
  - `button-loading`: open the HQ render modal, click "Start render", `screenshot` during `phase==='building'` (spinner + dimmed + aria-busy).
  - `skeleton-shimmer`: open the catalog on a category with pending thumbnails, `screenshot` before resolve (`.card-thumb .skeleton`), then after.
  - `toast-checkmark`: fire a success toast via `store` → `screenshot` right after (checkmark popped).
  - `editconfirm-dismiss`: seed a `pendingEdit`, click ✓ → `screenshot` mid-leave; repeat with ✗ → mid-shake.
  - `empty-cta`: drive an empty state with a new CTA (Versions/Layers) → `screenshot` (CTA present); optionally click it.
- [ ] Run once (never alongside the full suite): `node scripts/shot.mjs --scenario scripts/scenarios/ui-polish-batch2b.json --out-dir <scratchpad>/shots`.
- [ ] **Visually review every screenshot**; if the canvas reflow janks, revisit Task 6's `.stage-area` transition. Re-check reduced-motion (playbook technique): panels/skeleton/toast/confirm settle statically. Fix any artifact before finalising.
- [ ] Run the full suite once: `npm test`, then `npx tsc --noEmit` and `npm run check`.
- [ ] Bump `src/version.ts` to `'0.10.0.24'`.
- [ ] Add `CHANGELOG.md` entry: `## CHORE: visual-verification scenario for UI polish batch 2b (v0.10.0.24)`.
- [ ] Commit: `git commit -am "CHORE: ui-polish-batch2b visual-verification scenario (v0.10.0.24)"`.

---

### Critical Files for Implementation
- src/styles/tokens.css
- src/styles/components.css
- src/ui/controls/Button.tsx
- src/ui/EditConfirmBar.tsx
- src/ui/CLAUDE.md
