> **Orchestrator context (2026-07-02):** This plan targets the integration worktree at `/home/cwlroda/projects/sofa-so-good/.claude/worktrees/ui-polish-program` (branch `worktree-ui-polish-program`, v0.10.0.38). Batches 1 + 2a + 2b + 3a are merged here: the full OKLch token system incl. the `--dur-1/-2/-3`/`--ease-out` motion scale + `--panel-w`, `.liftable`, `.stagger-in` (fill-mode `backwards`), `.skeleton`, `<Button loading>`, dock-panel slide, `EditConfirmBar` dismiss anims, empty-state CTAs, the destructive-confirm policy, the inline-px guard (`src/ui/inlinePxGuard.test.ts` with a `GRANDFATHERED` set), `screenFadeIn`, History/Layers in-panel search, `editorPrefs` panel persistence (`leftMode`/`layersCollapsed`/`catalogOpen`), `InfoCallout` + the `infoCallouts` flag, `newBadges` + `.new-dot` + `MenuItem.newFlag`/`useNewBadge` (P27), and the `calloutsSlice`/`badgesSlice` self-persisting slices. Do **not** read the primary checkout at `/home/cwlroda/projects/sofa-so-good` — it is a different branch. All line numbers below were read from this worktree on 2026-07-02; **re-locate every edit target by content before editing** (each commit shifts line numbers).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **TODO.md convention (user, 2026-07-02):** shipped items are removed from `TODO.md` entirely — never left as checked/"SHIPPED" lines. Each task that ships a P-item deletes that item's bullet from `TODO.md` in the same commit. An item that is *ruled a deferral* (P37) is **not** deleted — it is reworded to capture the ruling.

> **Versioning (orchestrator):** This plan doc lands as the **v0.10.0.39** DOCS commit. Agent task commits are authored **without** a version suffix — the landing orchestrator assigns sequential versions **`0.10.0.40` … `0.10.0.46`** (Task 1 → `.40`, Task 2 → `.41`, Task 3 → `.42`, Task 4 → `.43`, Task 5 → `.44`, Task 6 → `.45`, Task 7 → `.46`) and prepends the CHANGELOG entry + bumps `src/version.ts` at landing. `package.json` stays `0.10.0`.

# Batch 3b — UI/UX polish program (primitives / live feedback / density / ambient flair)

## Goal

Ship the remaining "Batch 3 — larger" items from `TODO.md`, scoped honestly against what already exists: **P18** two high-value UI primitives (a `SliderField` value-readout wrapper + a `Disclosure` around the native-`<details>` idiom) with the three lower-value candidates explicitly dropped; **P32** live notification cards (a body-level "jump to result" affordance + a standard error→Retry transition, extending the existing un-flagged toast infra); **P38** a Pro-tier density mode (`data-density` comfortable/compact over `--row-pad-*` tokens, persisted via `editorPrefs`); **P26** a Simple→Pro upsell affordance (a single flag-gated hint in the ⌘K palette — the one discovery surface visible in Simple); **P7** token-based magicui adaptations (a flag- + GPU-tier- + reduced-motion-gated border-beam on the in-progress HQ-render card and a mouse-follow radial gradient on catalog/preset cards — with the multi-circle hotspot pulse and dock magnification dropped for cause); a **P37** deferral ruling (list virtualization is not justified now — argued with real row counts); and one final visual-verification task. Everything builds on the existing token/motion/flag/prefs infrastructure; no framework or dependency changes.

## Architecture (real findings from the worktree)

- **Feature flags.** `FEATURE_FLAGS` registry in `src/features/flags/registry.ts` (each `{label,description,default,tier,devOnly?}`); `FeatureFlag` union in `src/features/flags/types.ts`; `resolveFlags(isDev,overrides,isAdmin,uiMode)` in `src/features/flags/resolve.ts:39` forces `pro`-tier flags **off** in Simple (`def.tier === 'pro' && uiMode === 'simple' → false`). React reads via `useFeature('flag')` (`src/features/useFeature.ts`); non-React via `isFeatureEnabled`. Both-mode test idiom in `src/features/featureFlags.test.ts`: `resolveFlags(true,{},false,'simple')` vs `'pro'` + tier/default assertions.
- **GPU / quality tier (the P7 + P38 lever).** `uiSlice.ts` holds `qualityTier: RenderTier` (`'performance'|'medium'|'high'|'maximum'`), initial `'performance'` (`uiSlice.ts:233`); `src/scene/quality.ts:230` `detectDefaultTier` returns `'performance'` unconditionally — so **Performance is the default tier for every device**, and `performance` is a deliberately *flat* renderer (quality.ts:6-11). Read reactively via `useStore((s) => s.qualityTier)`. This is the "actual quality/tier lever" the mandate requires P7 to respect.
- **Reduced-motion (JS).** Precedent `src/ui/EditConfirmBar.tsx:14` — `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. The global CSS block (`app.css:223`) zeroes `animation-*`/`transition-*` on `*` (0.01ms, keeps `animationend`), with a `.skeleton` static override. New keyframes inherit the resets; use fill-mode **`backwards`, never `both`**.
- **Notification infra (P32).** `src/state/slices/notificationsSlice.ts`: `Notification` carries `kind` (`info|progress|success|error`), `progress?`, `details?` (makes the body clickable → details modal), `actionLabel?`+`onAction?` (a trailing button), `icon?`. `notify.start/update/success/error/dismiss`; `start` **de-dupes** non-progress toasts by `kind+title+message`; progress toasts are keyed by returned id + never de-dupe. `error(id, message, details?)` swaps kind→error + `autoDismissMs:null`. `src/ui/notifications/NotificationContainer.tsx`: the body is a `<button disabled={!hasDetails}>` (only clickable when `hasDetails`); it renders the determinate/indeterminate `.bud-bar`, a "View details →" hint, the optional `.toast-act` action button, and a dismiss. **Gaps:** (1) no body-level "jump to result" when there are no details; (2) no standard error→Retry helper (callers hand-wire `actionLabel`).
- **AppearancePopover (P38 toggle host + P26 pointer target).** `src/ui/toolbar/AppearancePopover.tsx` — `AppearanceControls()` renders Theme cards, a light/dark/auto `seg`, and an **Interface** `seg` with the Simple/Pro toggle (`uiMode`/`setUiMode`, lines 34-108) + a one-line explainer (117-120). Shared between the desktop popover and mobile modal. `setAppearanceOpen(true)` opens it.
- **ToolsMenu is Pro-only (decides P26's host).** `src/ui/toolbar/Toolbar.tsx:219` mounts `{proMode && <ToolsMenu />}` — the Tools menu **does not exist in Simple mode**, so it cannot host a Simple-mode upsell. The ⌘K CommandPalette (`src/ui/CommandPalette.tsx`) is core (un-gated by mode) and is the correct Simple-visible discovery surface; it already has a `.cmdk-foot` footer (`CommandPalette.tsx:871`) and a `.cmdk-empty` no-results row (`:793`).
- **Appearance/theme application pattern (P38 mirror).** `src/state/storage/appearancePrefs.ts` writes `[data-theme]`/`[data-mode]` on `<html>` via `applyAppearance` (load + `watchAppearancePrefs` subscribe), keyed off a pre-paint `index.html` script. Density mirrors this but persists through **`editorPrefs`** (per mandate), not `appearancePrefs`.
- **editorPrefs (P38 persistence).** `src/state/storage/editorPrefs.ts` reads key `sofa.editor.v1` (`loadEditorPrefs`) and writes a fixed field set on every change (`watchEditorPrefs`). Already persists `snapEnabled`/`gridSize`/`units`/`backdrop`/`hdriId`/`uiMode`/`walkFov`/`walkEyeHeight`/`planLabels`/`leftMode`/`layersCollapsed`/`catalogOpen` (the last desktop-gated via `matchMedia('(min-width:641px)')`). Back-compat: every field parses with a default.
- **Row-padding surfaces (P38 tokens).** `.menu-item` (`components.css:353`), `.lyr-row`/`.lyr-ghead` (layers), history rows, and catalog card padding carry the 2b-normalized paddings. There is **no** `--row-pad-*` indirection yet; add one in the token `:root` and refactor the highest-traffic list rows to consume it.
- **Primitives inventory (P18 — honest gaps).**
  - `.slider` (`components.css:452-454`) is **bare** (track + thumb only); many consumers hand-pair it with a label + a numeric readout (`GraphicsSettings`, `walk/WalkCameraControls` `WalkSettings`, `scene/TimeOfDaySlider`, `inspector/TiltControls`, `parametric/DimField`, `RenderCompareModal`, `CompassModal`, `ColorPicker`). **Real gap → `SliderField`.**
  - Native `<details className="compose"><summary className="compose-summary">` appears in **`FinishPicker.tsx:420`** and **`finish/MaterialComposer.tsx:129`** (identical idiom). `LayersPanel` group collapse is **store-driven** (`layersCollapsed` in `featuresSlice`, `.lyr-ghead` button, force-expand-while-filtering) — a *different* contract. **Real gap → `Disclosure`** (unify the two `<details>` call sites); **Layers stays bespoke** (persistence + filter-expand — documented, not force-fit).
  - `.badge` (`features.css:10-22`) already has **four tonal variants** (`.err/.warn/.ok/.neutral`); dot affordances are already `.nub`/`.new-dot`. **No real gap → DROP dot/tonal Badge.**
  - **No breadcrumb-like UI exists**; room switching is a `Select` (`toolbar/RoomSwitcher.tsx`), and there is no navigated Room→Wall→Surface hierarchy (the elevation editor is a render target, not a nav trail). **DROP Breadcrumb** (no consumer).
  - Modal footers use `Modal`'s `footer` prop with a per-modal flex row (`NotificationContainer.tsx:307`). **DROP ButtonGroup** (the abstraction saves ~nothing over the existing `footer` prop; YAGNI).
- **P7 mount points + orphan finding.**
  - **HQ render card (a).** `src/ui/HqRenderModal.tsx` — `phase: 'idle'|'building'|'rendering'|'done'|'error'` (`:73`), `busy = phase==='building'||'rendering'` (`:155`); the preview/progress area is where the border-beam mounts while in-progress.
  - **Catalog/preset cards (b).** `.cat-card` (`parts.css:51`) in `.card-grid.stagger-in` (`CatalogDrawer.tsx:436`); the grid already has a keyboard handler that queries `.cat-card` (`CatalogDrawer.tsx:222`). `.preset-card` (`flows.css:105`, `components.css:48`).
  - **"edit-room hotspot" (c) — ORPHANED.** `.er-ring`/`.er-hot`/`@keyframes erpulse` exist **only** in `flows.css:48-61` with **zero TSX consumers** (grepped whole `src/`). `RoomsLayer.tsx` vertex handles are inline `<circle>` with their own inline props (not `.er-hot`); `EmptyRoomHint` is a panel, not a hotspot. **There is no live hotspot to enrich → DROP (c)** (reviving orphaned CSS to build an unconsumed effect is YAGNI).
  - **Toolbar dock magnification (d).** No motion library is present; macOS-dock magnification needs per-neighbour JS pointer tracking + a spring integrator running a rAF loop on every `pointermove` over the toolbar — a continuously-running animation that directly contradicts the Performance-tier / IntersectionObserver-pause mandate, for low value on a productivity tool. **DROP (d)** (keep the existing `.tool-btn:hover` treatment).
- **P37 row counts (deferral evidence).** Catalog is **already paginated** — `PAGE_SIZE = 12`, `cards = allCards.slice(page*12, …)` (`CatalogDrawer.tsx:35,182`), so it never renders >12 rows. History (`buildHistoryTimeline`) and Layers (furniture per room) realistically sit well under 100 rows. The `.stagger-in --i` fallback already caps at 12 children (ui/CLAUDE.md). **A new `@tanstack/react-virtual` dependency is not justified now → DEFER with a measured threshold.**
- **Test precedent.** `src/styles/*.test.ts` grep tests; TSX via @testing-library/react (jsdom); slice/pref tests seed `useStore.setState` and assert `localStorage`; flag additions extend `featureFlags.test.ts` (both modes); `scripts/scenarios/*.json` drive `node scripts/shot.mjs --scenario`.

## Tech Stack

React 18 + TypeScript, Zustand sliced store (`src/state/store.ts`, `window.__store`), Vite, Vitest + @testing-library/react (jsdom), Biome (2-space / 100-col / single-quote / no-semicolons). Pure OKLch CSS token system across 5 themes × light/dark. Feature-flag registry + `resolveFlags`. Per-device prefs via `localStorage`. Visual verification via `node scripts/shot.mjs --scenario <file.json>`.

## Global Constraints

- **Feature flags — argued tiers + both-mode tests.**
  - **P7 (`ambientFx`):** NEW decorative surface → **flagged**, **tier `'simple'`**, **`default: true`**. Rationale: the effects benefit casual users most, so a `pro` tier (which would hide them in Simple) is wrong. The GPU cost is handled **not** by the tier but by a **runtime gate** — effects render only when `qualityTier !== 'performance'` **and** not reduced-motion. Since `performance` is every device's default tier, the effects are dormant by default (zero cost, mandate satisfied) and light up only when the user opts into a higher render tier. Both-mode tests: `ambientFx` present in Simple AND Pro; plus a `useAmbientFx` gate test (false under `'performance'` tier, false under reduced-motion, true otherwise).
  - **P38 (`densityMode`):** advanced layout affordance → **flagged**, **tier `'pro'`**, **`default: true`** (forced off in Simple by `resolveFlags`). Both-mode tests: the density toggle is present in Pro and **absent in Simple**.
  - **P26 (`proUpsell`):** the upsell **must be visible in Simple by definition**, so a `pro` tier is impossible → **tier `'simple'`**, **`default: true`**. The component *additionally* returns `null` when `uiMode === 'pro'` (nothing to upsell). Both-mode tests: visible in Simple (flag on), absent in Pro.
  - **P32 (live notification cards):** an enhancement of the **existing un-flagged toast system** (not a new user-facing surface) → **no new flag** (matches the un-flagged toast precedent). Not mode-dependent → no both-mode test required (slice + container unit tests only).
  - **P18 (primitives):** internal components, not user-facing features → **un-flagged** (they inherit the gating of whatever consumes them).
  - **P37:** a **deferral ruling**, ships no feature and no flag.
- **GPU / perf (P7).** Effects gate on `qualityTier !== 'performance'` (respect the default Performance tier). Anything **continuously animating** (the HQ border-beam offset-path loop) mounts only while in-progress **and** is IntersectionObserver-paused when off-screen. The radial gradient is **event-driven** (pointermove sets two CSS vars) with **no continuous animation** → no IO needed (documented). No hardcoded colours — accent via `color-mix(in oklch, var(--accent) …)`. Entrance/decorative keyframes use fill-mode **`backwards`, never `both`**. Reduced-motion inherits the global resets **and** the JS gate returns false.
- **No hardcoded colours anywhere** — token vocabulary only; every surface works light + dark across all 5 themes.
- **Inline-px guard must stay green.** New inline styles use `--s-N`/`--t-N` tokens or existing classes. Do **not** add new files to `GRANDFATHERED`. New primitives/components are token-clean from birth.
- **Tests:** TDD. CSS-only → `src/styles/*.test.ts` grep test; components → @testing-library; flag additions extend `featureFlags.test.ts` (both modes + tier/default). Targeted vitest while iterating; the pre-commit hook runs the **full suite exactly once** per commit. Never run the full suite and the screenshot harness simultaneously.
- **ONE COMMIT PER TASK.** `TYPE: summary` (no version suffix — assigned at landing); `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer. Each task that ships a P-item deletes that item's bullet from `TODO.md` in the same commit; the P37 task rewords its bullet instead.
- **Docs currency (same commit).** New systems → `docs/ARCHITECTURE.md`; UI/state conventions → `src/ui/CLAUDE.md` / `src/state/CLAUDE.md`; user-visible surfaces (density toggle, Pro upsell) → `docs/user/*` (verify labels against source). Each flag addition updates `src/ui/CLAUDE.md` + user docs.
- **Visual verification:** one final task (Task 7) covering each shipped surface + reduced-motion + Performance-tier degradation.

**Parallel-dispatch file map (disjointness):**
- **T1 (P18):** new `src/ui/controls/SliderField.tsx` + `SliderField.test.tsx`; new `src/ui/controls/Disclosure.tsx` + `Disclosure.test.tsx`; `src/styles/components.css` (`.fld`/`.slider` value-readout rule only), `src/ui/walk/WalkCameraControls.tsx` (WalkSettings adopt), `src/ui/scene/TimeOfDaySlider.tsx` (adopt), `src/ui/FinishPicker.tsx` (adopt `<Disclosure>`), `src/ui/finish/MaterialComposer.tsx` (adopt), `src/ui/CLAUDE.md`.
- **T2 (P32):** `src/state/slices/notificationsSlice.ts` + `notificationsSlice.test.ts`, `src/ui/notifications/NotificationContainer.tsx` + `NotificationContainer.test.tsx`, `src/ui/CLAUDE.md`.
- **T3 (P38):** `src/features/flags/types.ts`, `src/features/flags/registry.ts`, `src/state/slices/uiSlice.ts` (`density`+`setDensity`), `src/state/storage/editorPrefs.ts` (+`applyDensity`), `src/styles/tokens.css` (or the token root) + `src/styles/components.css` (row-pad indirection + compact block) + new `src/styles/density.test.ts`, `src/ui/toolbar/AppearancePopover.tsx`, `src/features/featureFlags.test.ts`, new `src/state/storage/editorPrefs.density.test.ts`, `src/state/CLAUDE.md`, `docs/user/*`, `docs/ARCHITECTURE.md`.
- **T4 (P26):** `src/features/flags/types.ts`, `src/features/flags/registry.ts`, new `src/ui/ProUpsellHint.tsx` + `ProUpsellHint.test.tsx`, `src/ui/CommandPalette.tsx` (mount in `.cmdk-foot`), `src/styles/components.css` (`.cmdk-upsell` row), `src/features/featureFlags.test.ts`, `src/ui/CLAUDE.md`, `docs/user/*`.
- **T5 (P7):** `src/features/flags/types.ts`, `src/features/flags/registry.ts`, new `src/ui/useAmbientFx.ts` + `useAmbientFx.test.tsx`, `src/ui/HqRenderModal.tsx`, `src/ui/catalog/CatalogDrawer.tsx`, `src/styles/flows.css` (+ `src/styles/parts.css` for the card gradient) + new `src/styles/ambientFx.test.ts`, `src/features/featureFlags.test.ts`, `src/ui/CLAUDE.md`, `docs/ARCHITECTURE.md`.
- **T6 (P37):** `TODO.md` (reword P37), `docs/ARCHITECTURE.md` (one perf note).
- **T7:** new `scripts/scenarios/ui-polish-batch3b.json`.

**Sequencing:** T1 (primitives) first — later tasks may consume `SliderField`/`Disclosure`. **T3 → T4 → T5 must run in order** (they all extend the shared flag files: `flags/types.ts`, `flags/registry.ts`, `featureFlags.test.ts`, `src/ui/CLAUDE.md` — extend, never overwrite). T2 is independent (no flag files). T6 is docs-only. T7 last.

---

### Task 1: P18 — UI primitives (`SliderField` + `Disclosure`; drop the other three)

**Files:**
- Create `src/ui/controls/SliderField.tsx` + `src/ui/controls/SliderField.test.tsx`.
- Create `src/ui/controls/Disclosure.tsx` + `src/ui/controls/Disclosure.test.tsx`.
- Modify `src/styles/components.css` — a `.fld .slider` value-readout layout rule if needed (token-only; the `.slider` visual is already styled).
- Adopt `SliderField` in `src/ui/walk/WalkCameraControls.tsx` (WalkSettings fov + eye-height) and `src/ui/scene/TimeOfDaySlider.tsx`.
- Adopt `Disclosure` in `src/ui/FinishPicker.tsx` (`:420`) and `src/ui/finish/MaterialComposer.tsx` (`:129`).
- Modify `src/ui/CLAUDE.md` — two "primitives" convention lines + the drop rationale.

**Interfaces:**
- `SliderField` — a labelled slider with a live numeric readout over the existing `.slider`:
  ```tsx
  export interface SliderFieldProps {
    label: string
    value: number
    min: number
    max: number
    step?: number
    onChange: (v: number) => void
    /** Format the readout (default: String(value)); e.g. (v) => `${v}°`. */
    format?: (v: number) => string
    disabled?: boolean
    id?: string
  }
  ```
  Markup reuses the `.fld` field wrapper + `.slider` input; the readout is a `<span>` with `font-variant-numeric: tabular-nums` (type-ladder numeric rule) and `color: var(--text-3)`. `<input type="range" className="slider" aria-label={label}>`; wire `value`/`min`/`max`/`step`/`disabled`; `onChange={(e)=>onChange(Number(e.target.value))}`. **Zero inline px** — spacing via `var(--s-*)` or existing `.fld` classes. Do **not** migrate every `.slider` call site (YAGNI, mirrors the `<Button>` migration precedent — raw `.slider` stays valid); adopt in the two representative consumers to prove the contract.
- `Disclosure` — a thin wrapper over the native `<details className="compose">` idiom:
  ```tsx
  export interface DisclosureProps {
    summary: React.ReactNode
    defaultOpen?: boolean
    children: React.ReactNode
    className?: string
  }
  ```
  Renders `<details className={`compose${className ? ' ' + className : ''}`} open={defaultOpen}><summary className="compose-summary">{summary}</summary>{children}</details>`. Reuses the existing `.compose`/`.compose-summary` styles (no new CSS). **Layers group-collapse is intentionally NOT migrated** — it is store-persisted (`layersCollapsed`) and force-expands while a filter is active, a different contract than a self-managed `<details>`; document this.
- **DROP rulings (record in `src/ui/CLAUDE.md` + the commit body):**
  - **Badge dot/tonal variants — DROP.** `.badge` already ships `.err/.warn/.ok/.neutral` tonal variants; dot affordances are already `.nub` (count) and `.new-dot` (P27). A new variant has no consumer.
  - **Breadcrumb — DROP.** No navigated Room→Wall→Surface trail exists; room switching is `RoomSwitcher`'s `Select`, and the elevation view is a render target, not a nav surface. Building a breadcrumb for an un-navigated hierarchy is an unconsumed abstraction.
  - **ButtonGroup — DROP.** `Modal` already exposes a `footer` prop; footers are 1–3 buttons in a flex row that differ per modal — a `ButtonGroup` over `<div style={{display:'flex',justifyContent:'flex-end'}}>` saves nothing.

**Steps:**

- [ ] Write `SliderField.test.tsx`: renders the label + `.slider` input; moving the range calls `onChange` with the numeric value; the readout reflects `value` and honours `format`; `disabled` disables the input. Write `Disclosure.test.tsx`: renders `<summary>` text; children hidden until toggled open (assert via the `<details open>` attribute after a summary click); `defaultOpen` starts expanded.
- [ ] Run both, expect failure: `npx vitest --run src/ui/controls/SliderField.test.tsx src/ui/controls/Disclosure.test.tsx`.
- [ ] Implement `SliderField.tsx` + `Disclosure.tsx` per the Interfaces (token-only, no inline px). Add the `.fld .slider` readout layout rule to `components.css` only if the readout needs alignment beyond the existing `.fld` gap.
- [ ] Adopt `SliderField` in `WalkCameraControls.tsx` (WalkSettings fov + eye-height sliders) and `TimeOfDaySlider.tsx`; adopt `Disclosure` in `FinishPicker.tsx:420` and `MaterialComposer.tsx:129` (replace the raw `<details className="compose">`/`<summary className="compose-summary">` with `<Disclosure summary=…>`).
- [ ] Add to `src/ui/CLAUDE.md`: a `SliderField` line (*"Labelled sliders use `controls/SliderField` (label + `.slider` + a `tabular-nums` readout) — don't hand-pair a bare `.slider` with a separate value span; raw `.slider` stays valid for legacy call sites being migrated."*), a `Disclosure` line (*"Self-managed collapsible sections use `controls/Disclosure` over the `.compose` `<details>` idiom (FinishPicker/MaterialComposer). Layers group-collapse stays bespoke — it is store-persisted (`layersCollapsed`) and force-expands under an active filter."*), and the three DROP rulings with rationale.
- [ ] Run: `npx vitest --run src/ui/controls/SliderField.test.tsx src/ui/controls/Disclosure.test.tsx` and the adopting components' existing tests (e.g. `npx vitest --run src/ui/FinishPicker` if present) → green.
- [ ] Delete the **P18** bullet from `TODO.md`.
- [ ] Commit: `git commit -am "FEAT: SliderField + Disclosure primitives (P18); drop Badge-dot/Breadcrumb/ButtonGroup as unconsumed"`.

---

### Task 2: P32 — Live notification cards (body "jump to result" + error→Retry)

**Files:**
- Modify `src/state/slices/notificationsSlice.ts` — add `onActivate?` to `Notification` + `NotificationStartOpts`; extend `error` with an optional `retry` callback.
- Modify `src/state/slices/notificationsSlice.test.ts`.
- Modify `src/ui/notifications/NotificationContainer.tsx` — enable the body button when `onActivate` is set; render an error→Retry action; add a "jump" hint.
- Modify `src/ui/notifications/NotificationContainer.test.tsx`.
- Modify `src/ui/CLAUDE.md` — one "live notification cards" convention line.

**Interfaces:**
- `Notification` gains `onActivate?: () => void` — a body-level click handler ("jump to the result"), distinct from the trailing `actionLabel`/`onAction` button. `NotificationStartOpts` gains `onActivate?`; `start()` copies it into the built notification. Because `success()`/`error()` spread `...n`, an `onActivate` set on a progress toast survives its resolution to success (so a "Rendering…" toast stays clickable to jump once it becomes "Render ready").
- `error(id, message, details?, retry?)` — **back-compatible** 4th positional arg. When `retry` is provided, the errored toast also gets `actionLabel: 'Retry'` + `onAction: retry` (the standard error→Retry transition helper). Existing 2/3-arg callers are unaffected.
- `NotificationContainer`: `const canActivate = hasDetails || !!n.onActivate`; the body button is `disabled={!canActivate}` with `cursor: canActivate ? 'pointer' : 'default'`; on click → `if (hasDetails) setOpenDetails(n.id); else n.onActivate?.()`. Keep the "View details →" hint for `hasDetails`; add a "Jump to result →" hint (same `.toast`-token styling as the existing details hint — `var(--t-2xs)`/`var(--accent-soft-text)`) when `onActivate && !hasDetails`. The Retry button rides the existing `.toast-act` path (no new markup). Progress→error swap already re-announces via `useToastAnnouncer` (kind change) — no a11y change needed.

**Steps:**

- [ ] Extend `notificationsSlice.test.ts`: (a) `start({ …, onActivate })` stores `onActivate`; (b) after `success(id)` the `onActivate` persists; (c) `error(id, msg, undefined, retry)` sets `kind:'error'`, `actionLabel:'Retry'`, `onAction === retry`, `autoDismissMs:null`; (d) `error(id, msg)` (no retry) leaves `actionLabel` unset (back-compat).
- [ ] Extend `NotificationContainer.test.tsx`: (a) a toast with `onActivate` (no details) renders an enabled body button that calls `onActivate` on click; (b) a toast with neither details nor `onActivate` has a disabled body; (c) an error toast with a Retry action renders the `.toast-act` button and calls its handler.
- [ ] Run both, expect failure: `npx vitest --run src/state/slices/notificationsSlice.test.ts src/ui/notifications/NotificationContainer.test.tsx`.
- [ ] Implement the slice + container changes per the Interfaces.
- [ ] Add to `src/ui/CLAUDE.md`: *"Live notification cards (P32): a progress/success toast can carry `onActivate` (a body click that jumps to the result — the whole card body is the affordance, distinct from the trailing `actionLabel`/`onAction` button); a failed job uses `notify.error(id, msg, undefined, retry)` to swap in the standard 'Retry' action. Toasts update in place via `notify.update` and de-dupe on `kind+title+message` (progress toasts never de-dupe)."*
- [ ] Run: `npx vitest --run src/state/slices/notificationsSlice.test.ts src/ui/notifications/NotificationContainer.test.tsx` → green.
- [ ] Delete the **P32** bullet from `TODO.md`.
- [ ] Commit: `git commit -am "FEAT: live notification cards — body jump-to-result + standard error→Retry (P32)"`.

---

### Task 3: P38 — Density mode (Pro-tier, `data-density` over `--row-pad-*`)

**Files:**
- Modify `src/features/flags/types.ts` (+`'densityMode'`), `src/features/flags/registry.ts` (entry below).
- Modify `src/state/slices/uiSlice.ts` — add `density: 'comfortable' | 'compact'` + `setDensity`; add to the persisted-keys type list if one exists.
- Modify `src/state/storage/editorPrefs.ts` — persist + restore `density`; add + call `applyDensity(density)` (writes `[data-density]` on `<html>`) in `loadEditorPrefs` and `watchEditorPrefs`.
- Modify the token root (`src/styles/tokens.css` or the `:root` block that defines spacing) — add `--row-pad-y`/`--row-pad-x` seeded from the current row paddings + a `[data-density='compact']` override; refactor the high-traffic row rules in `src/styles/components.css` (`.menu-item`, layer rows, history rows) to consume them.
- Create `src/styles/density.test.ts` (grep test).
- Modify `src/ui/toolbar/AppearancePopover.tsx` — a Density `seg` in the Interface section, gated `useFeature('densityMode')`.
- Modify `src/features/featureFlags.test.ts`; create `src/state/storage/editorPrefs.density.test.ts`; update `src/state/CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/user/*`.

**Interfaces:**
- Store: `density: 'comfortable' | 'compact'` (initial `'comfortable'`); `setDensity(d)`.
- `applyDensity(d)` in `editorPrefs.ts` mirrors `appearancePrefs.applyAppearance`: `document.documentElement.setAttribute('data-density', d)`. Called on load + on every store change in `watchEditorPrefs` (jsdom-safe — guard `document`). `loadEditorPrefs` parses `density: p.density === 'compact' ? 'compact' : 'comfortable'` (back-compat default); `watchEditorPrefs`'s snapshot adds `density`.
- Tokens (values read from source at implementation — do not fabricate): in the `:root` token block, `--row-pad-y: <current .menu-item vertical padding>; --row-pad-x: <current horizontal padding>;` and refactor `.menu-item`/`.lyr-row`/history-row `padding` to `var(--row-pad-y) var(--row-pad-x)`. Then:
  ```css
  [data-density='compact'] { --row-pad-y: <y minus ~2px, in the existing token scale>; }
  ```
  Compact reduces the **vertical** rhythm only (keeps horizontal hit-targets). No colour literals; use the spacing token scale, not raw px.
- Registry entry:
  ```ts
  // Comfortable/compact row density via [data-density] over --row-pad-* tokens
  // (P38). Advanced layout control → pro tier (hidden in Simple). Prod-safe,
  // pure CSS + a persisted per-device pref.
  densityMode: {
    label: 'Density mode',
    description: 'Comfortable/compact row spacing',
    default: true,
    tier: 'pro',
  },
  ```
- AppearancePopover: below the Interface (Simple/Pro) `seg`, when `useFeature('densityMode')`, a "Density" `pop-label` + a `seg accent` with Comfortable/Compact buttons (`className={density === 'compact' ? 'on' : ''}`, `onClick={() => setDensity(…)}`), mirroring the existing `appe-mode` seg markup (no inline px).

**Steps:**

- [ ] Extend `featureFlags.test.ts` with a `densityMode` block: `default true`, `tier 'pro'`, `devOnly` undefined; **present in Pro, absent (false) in Simple** (`resolveFlags(true,{},false,'pro')` vs `'simple'`).
- [ ] Write `editorPrefs.density.test.ts`: `density` round-trips through `sofa.editor.v1`; old JSON without `density` loads as `'comfortable'`; after `setDensity('compact')` + the watcher fires, `document.documentElement.getAttribute('data-density') === 'compact'`.
- [ ] Write `density.test.ts` (grep): the token root defines `--row-pad-y`/`--row-pad-x`; `.menu-item` consumes `var(--row-pad-y)`; a `[data-density='compact']` block overrides `--row-pad-y`; no colour literal in the compact block.
- [ ] Run all three, expect failure: `npx vitest --run src/features/featureFlags.test.ts src/state/storage/editorPrefs.density.test.ts src/styles/density.test.ts`.
- [ ] Implement: flag types + registry entry; `uiSlice` `density`/`setDensity`; `editorPrefs` `applyDensity` + load/watch; the token indirection + compact block + row-rule refactor; the AppearancePopover Density seg.
- [ ] Docs: `src/state/CLAUDE.md` (editorPrefs now also persists `density`; `applyDensity` writes `[data-density]`); `docs/ARCHITECTURE.md` (density system, one line); `docs/user/*` (Appearance → Density, Pro-only — verify the label against the popover source).
- [ ] Run: `npx vitest --run src/features/featureFlags.test.ts src/state/storage/editorPrefs.density.test.ts src/styles/density.test.ts` → green (existing `editorPrefs.test.ts` must not regress).
- [ ] Delete the **P38** bullet from `TODO.md`.
- [ ] Commit: `git commit -am "FEAT: density mode — [data-density] compact/comfortable over --row-pad tokens, Pro-tier flag, persisted (P38)"`.

---

### Task 4: P26 — Simple→Pro upsell affordance (⌘K hint; SEQUENCED AFTER Task 3)

**Files:**
- Modify `src/features/flags/types.ts` (+`'proUpsell'`), `src/features/flags/registry.ts` (entry below).
- Create `src/ui/ProUpsellHint.tsx` + `src/ui/ProUpsellHint.test.tsx`.
- Modify `src/ui/CommandPalette.tsx` — mount `<ProUpsellHint />` in the `.cmdk-foot` footer (`:871`).
- Modify `src/styles/components.css` — a `.cmdk-upsell` footer row (token-only).
- Modify `src/features/featureFlags.test.ts`; update `src/ui/CLAUDE.md`, `docs/user/*`.

**Interfaces:**
- **Host decision:** `ToolsMenu` is Pro-only (`Toolbar.tsx:219`), so the Simple-mode upsell lives in the ⌘K CommandPalette footer — the one discovery surface visible in Simple. This is the "single hint row" the mandate asks for, not a resurrection of every hidden entry.
- `ProUpsellHint`:
  ```tsx
  export function ProUpsellHint() {
    const on = useFeature('proUpsell')
    const uiMode = useStore((s) => s.uiMode)
    const setAppearanceOpen = useStore((s) => s.setAppearanceOpen)
    if (!on || uiMode === 'pro') return null // nothing to upsell in Pro
    return (
      <button type="button" className="cmdk-upsell" onClick={() => setAppearanceOpen(true)}>
        <Icon.Star width={14} height={14} />
        <span>More tools in <b>Pro</b> — measure, drawings, analysis &amp; more</span>
        <span className="badge neutral">Pro</span>
      </button>
    )
  }
  ```
  Clicking opens the Appearance popover, where the Simple↔Pro toggle + its explainer live (honest "points to the toggle" — it does not silently flip the mode). The "Pro" chip reuses the existing `.badge.neutral` tonal variant (no new colour). `.cmdk-upsell` styling reuses the `.cmdk-foot`/`.menu-item` token vocabulary.
- Registry entry:
  ```ts
  // A single Simple-mode hint (in the ⌘K footer) that Pro tools exist, pointing
  // to the Simple↔Pro toggle (P26). Must show IN Simple → simple tier; the
  // component itself renders null in Pro. Prod-safe, pure UI.
  proUpsell: {
    label: 'Pro upsell hint',
    description: 'A ⌘K hint (Simple mode) that Pro tools exist',
    default: true,
    tier: 'simple',
  },
  ```

**Steps:**

- [ ] Extend `featureFlags.test.ts` with a `proUpsell` block: `default true`, `tier 'simple'`, present in **both** modes (a `simple`-tier flag stays on in Simple AND Pro).
- [ ] Write `ProUpsellHint.test.tsx`: renders (with the Pro chip) when `proUpsell` on **and** `uiMode==='simple'`; clicking calls `setAppearanceOpen(true)`; returns `null` when `uiMode==='pro'`; returns `null` when the flag is off. (Seed mode via `useStore.setState({ uiMode })` + `reresolveFeatureFlags()`.)
- [ ] Run both, expect failure: `npx vitest --run src/features/featureFlags.test.ts src/ui/ProUpsellHint.test.tsx`.
- [ ] Implement: flag types + registry entry; `ProUpsellHint.tsx`; mount it in the CommandPalette `.cmdk-foot`; `.cmdk-upsell` CSS.
- [ ] Docs: `src/ui/CLAUDE.md` (*"The Simple→Pro upsell is a single ⌘K-footer hint (`ProUpsellHint`, flag `proUpsell`, `simple` tier) — the Tools menu is Pro-only so it can't host a Simple affordance; the hint opens the Appearance popover where the Simple↔Pro toggle lives, and renders null in Pro."*); `docs/user/*` (a short "Discovering Pro tools" note — verify the ⌘K + Appearance labels).
- [ ] Run: `npx vitest --run src/features/featureFlags.test.ts src/ui/ProUpsellHint.test.tsx` → green.
- [ ] Delete the **P26** bullet from `TODO.md`.
- [ ] Commit: `git commit -am "FEAT: Simple→Pro upsell hint in the ⌘K footer, flag-gated + Simple-only (P26)"`.

---

### Task 5: P7 — Token-based magicui adaptations (ambient FX; drop (c) + (d); SEQUENCED AFTER Task 4)

**Files:**
- Modify `src/features/flags/types.ts` (+`'ambientFx'`), `src/features/flags/registry.ts` (entry below).
- Create `src/ui/useAmbientFx.ts` (the flag + GPU-tier + reduced-motion gate) + `src/ui/useAmbientFx.test.tsx`.
- Modify `src/ui/HqRenderModal.tsx` — a border-beam element on the in-progress card, gated + IntersectionObserver-paused.
- Modify `src/ui/catalog/CatalogDrawer.tsx` — a pointermove handler on the card grid setting `--mx`/`--my`, gated.
- Modify `src/styles/flows.css` (border-beam keyframe/rule + `.preset-card` gradient) + `src/styles/parts.css` (`.cat-card` gradient). Create `src/styles/ambientFx.test.ts` (grep).
- Modify `src/features/featureFlags.test.ts`; update `src/ui/CLAUDE.md`, `docs/ARCHITECTURE.md`.

**Interfaces:**
- `useAmbientFx(): boolean`:
  ```ts
  export function useAmbientFx(): boolean {
    const on = useFeature('ambientFx')
    const tier = useStore((s) => s.qualityTier)
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    return on && tier !== 'performance' && !reduce
  }
  ```
  This is the single gate: dormant in the default Performance tier and under reduced-motion (mandate). Every effect consumes it and renders nothing when it returns false.
- **(a) Border-beam on the in-progress HQ render card.** In `HqRenderModal`, while `busy` (`phase==='building'||'rendering'`) **and** `useAmbientFx()`, render a decorative `<span className="beam" aria-hidden />` over the preview card. CSS: a pseudo-element travelling the border via `offset-path` with a `color-mix(in oklch, var(--accent) …, transparent)` gradient dash; `@keyframes beamTravel` animates `offset-distance` 0→100% (continuous). **Continuously animating → IntersectionObserver-pause:** a small `useEffect` observes the beam element and toggles a `.paused` class (`animation-play-state: paused`) when `!isIntersecting`; the beam also unmounts when `!busy`. Reduced-motion is covered by the global reset **and** `useAmbientFx` returning false.
- **(b) Mouse-follow radial gradient on catalog/preset cards.** `.cat-card`/`.preset-card` gain a `background` layer `radial-gradient(160px circle at var(--mx, 50%) var(--my, 50%), color-mix(in oklch, var(--accent) 12%, transparent), transparent 60%)` composited under the existing surface fill. A `onPointerMove` on `.card-grid` (extend the existing grid handler at `CatalogDrawer.tsx:222`) — gated by `useAmbientFx()` — sets `--mx`/`--my` on the hovered `.cat-card` from `getBoundingClientRect`. **Event-driven, no continuous animation → no IntersectionObserver needed** (documented). When the gate is false the vars are never set → the gradient stays at its inert default. No inline px beyond the var writes (which are computed values, not literals; the guard checks style *literals*, not runtime `setProperty`).
- **(c) Multi-circle hotspot pulse — DROPPED.** `.er-ring`/`.er-hot`/`@keyframes erpulse` (`flows.css:48-61`) have **zero TSX consumers** — there is no live edit-room hotspot to enrich. Reviving orphaned CSS to build an unconsumed effect violates YAGNI. Record the finding; leave the orphaned CSS untouched (out of scope to delete here).
- **(d) Toolbar dock magnification — DROPPED.** No motion library is present; a faithful spring-magnified dock needs a rAF spring integrator driven by every `pointermove` over the toolbar — a continuously-running JS animation that contradicts the Performance-tier/IO-pause mandate, for low value on a productivity tool. The existing `.tool-btn:hover` treatment stays. Record the rationale.
- Registry entry:
  ```ts
  // Decorative, GPU-tier- + reduced-motion-gated ambient effects: a border-beam
  // on the in-progress HQ-render card + a mouse-follow radial gradient on
  // catalog/preset cards (P7). simple tier (polish for all users); the real GPU
  // guard is runtime — useAmbientFx() renders nothing under the default
  // Performance tier or reduced-motion, so it's dormant by default. Prod-safe.
  ambientFx: {
    label: 'Ambient effects',
    description: 'Subtle motion accents on higher render tiers',
    default: true,
    tier: 'simple',
  },
  ```

**Steps:**

- [ ] Extend `featureFlags.test.ts` with an `ambientFx` block: `default true`, `tier 'simple'`, present in **both** modes.
- [ ] Write `useAmbientFx.test.tsx`: true when flag on + `qualityTier` non-performance + no reduced-motion; false when `qualityTier==='performance'`; false when the reduced-motion media query matches (mock `matchMedia`); false when the flag is off. (Seed tier via `useStore.setState({ qualityTier })`.)
- [ ] Write `ambientFx.test.ts` (grep): a `@keyframes beamTravel` using `offset-distance` exists; the beam rule uses `color-mix(in oklch, var(--accent)` (no colour literal) and fill/animation without `both`; `.cat-card` (parts.css) and `.preset-card` (flows.css) reference `var(--mx` in a `radial-gradient` with `color-mix(in oklch, var(--accent)`; a `.paused { animation-play-state: paused }` rule exists for the beam.
- [ ] Run all, expect failure: `npx vitest --run src/features/featureFlags.test.ts src/ui/useAmbientFx.test.tsx src/styles/ambientFx.test.ts`.
- [ ] Implement: flag types + registry; `useAmbientFx.ts`; the HQ border-beam element + IntersectionObserver pause (mount only while `busy && useAmbientFx()`); the CatalogDrawer pointermove var-writer (gated); the `flows.css`/`parts.css` gradient + beam rules.
- [ ] Docs: `src/ui/CLAUDE.md` (*"Ambient effects (P7) go through `useAmbientFx()` — flag `ambientFx` AND `qualityTier !== 'performance'` AND not reduced-motion; dormant in the default Performance tier. Continuously-animating effects (the HQ border-beam) mount only while active and IntersectionObserver-pause off-screen; the catalog radial gradient is pointermove-driven (no continuous animation). The orphaned `.er-ring`/`.erpulse` hotspot pulse and a spring dock magnification were dropped — see the P7 ruling."*); `docs/ARCHITECTURE.md` (one line on the ambient-fx gate).
- [ ] Run: `npx vitest --run src/features/featureFlags.test.ts src/ui/useAmbientFx.test.tsx src/styles/ambientFx.test.ts` → green.
- [ ] Delete the **P7** bullet from `TODO.md`.
- [ ] Commit: `git commit -am "FEAT: ambient FX — HQ border-beam + catalog radial gradient, flag/GPU-tier/reduced-motion gated; drop hotspot-pulse + dock-magnify (P7)"`.

---

### Task 6: P37 — List virtualization ruling (DEFER with a measured threshold)

**Files:**
- Modify `TODO.md` — reword the P37 bullet into a measured deferral (do **not** delete it — it is not shipped).
- Modify `docs/ARCHITECTURE.md` — one perf note recording the ruling.

**Interfaces:** No code. **Ruling:** a `@tanstack/react-virtual` dependency is **not justified now**. Evidence: the catalog is already paginated (`PAGE_SIZE = 12`, `CatalogDrawer.tsx:35,182` — it never renders >12 rows); History and Layers realistically render well under 100 rows; the `.stagger-in --i` fallback already caps at 12 children. Adding a windowing dependency for lists that don't exceed a few dozen rows is premature and adds bundle + maintenance cost. **Threshold to revisit:** if any single rendered list (history timeline, a room's layer list, or an un-paginated catalog view) is observed to exceed **~200 live DOM rows**, introduce a lightweight slice-on-scroll window *before* reaching for `@tanstack/react-virtual`.

**Steps:**

- [ ] Reword the `TODO.md` P37 bullet to: *"**P37 List virtualization — DEFERRED (2026-07-02 ruling).** Not justified now: the catalog is already paginated (`PAGE_SIZE=12`); history/layers realistically render <100 rows. Revisit with a lightweight slice-on-scroll window (not a new dependency) only if a single list is observed to exceed ~200 live DOM rows."*
- [ ] Add a one-line perf note to `docs/ARCHITECTURE.md` under the list/panel section recording the same ruling + threshold.
- [ ] Full gate once: `npm test`, `npx tsc --noEmit`, `npm run check` (docs-only change, but the hook runs the suite per commit).
- [ ] Commit: `git commit -am "CHORE: P37 ruling — defer list virtualization (paginated catalog, <100-row lists); ~200-row revisit threshold"`.

---

### Task 7: Batch visual verification

**Files:**
- Create `scripts/scenarios/ui-polish-batch3b.json` (schema per `docs/visual-verification-playbook.md` + `scripts/scenarios/ui-polish-batch3a.json`).

**Interfaces:** `window.__store` levers; screenshots reviewed by eye. Covers each shipped surface + reduced-motion + Performance-tier degradation:
- **P18** — open FinishPicker/MaterialComposer, screenshot the `Disclosure` collapsed→expanded; open walk settings, screenshot a `SliderField` readout updating.
- **P32** — `notify.start({ kind:'progress', title:'Rendering…', onActivate })`, `update` the progress, screenshot the clickable body + "Jump to result →" hint; `notify.error(id, 'Render failed', undefined, retry)`, screenshot the Retry action.
- **P38** — `setUiMode('pro')` + `setFeatureFlag('densityMode', true)`, open Appearance, screenshot the Density seg; `setDensity('compact')`, screenshot a denser menu/layer list; probe `document.documentElement.dataset.density`; then `setUiMode('simple')` and assert the Density seg is **absent**.
- **P26** — `setUiMode('simple')`, open ⌘K, screenshot the `ProUpsellHint` row with the Pro chip; `setUiMode('pro')`, open ⌘K, confirm it is **absent**.
- **P7** — `setFeatureFlag('ambientFx', true)`; at `qualityTier:'high'` screenshot the catalog radial gradient (drive a pointermove) + the HQ border-beam mid-render; then **degradation check** at `qualityTier:'performance'` — screenshot showing **no** beam/gradient; **reduced-motion re-check** (emulate reduce) — beam/gradient absent, and the Batch-3a `.new-dot`/`screenFadeIn` settle statically.
- **P37** — no visual (ruling only).

**Steps:**

- [ ] Author `scripts/scenarios/ui-polish-batch3b.json` with the standard preamble then the named steps above (eval/store/viewport/click/screenshot), including the Performance-tier degradation frame and a reduced-motion pass.
- [ ] Run once (never alongside the full suite): `node scripts/shot.mjs --scenario scripts/scenarios/ui-polish-batch3b.json --out-dir <scratchpad>/shots`.
- [ ] **Visually review every screenshot** (Disclosure toggles cleanly; SliderField readout tracks; toast body/Retry legible; compact rows denser but not cramped; upsell chip legible light+dark; beam/gradient present at High and **absent** at Performance + under reduced-motion). Fix artifacts before finalising.
- [ ] Full gate once: `npm test`, `npx tsc --noEmit`, `npm run check`.
- [ ] Commit: `git commit -am "CHORE: ui-polish-batch3b visual-verification scenario"`.

---

### Critical Files for Implementation
- /home/cwlroda/projects/sofa-so-good/.claude/worktrees/ui-polish-program/src/features/flags/registry.ts
- /home/cwlroda/projects/sofa-so-good/.claude/worktrees/ui-polish-program/src/state/slices/notificationsSlice.ts
- /home/cwlroda/projects/sofa-so-good/.claude/worktrees/ui-polish-program/src/state/storage/editorPrefs.ts
- /home/cwlroda/projects/sofa-so-good/.claude/worktrees/ui-polish-program/src/ui/toolbar/AppearancePopover.tsx
- /home/cwlroda/projects/sofa-so-good/.claude/worktrees/ui-polish-program/src/ui/CommandPalette.tsx