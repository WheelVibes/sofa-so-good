> **Orchestrator amendment (2026-07-02):** This plan doc itself ships as the **v0.10.0.29** DOCS
> commit, so all task version bumps shift by one: Task 1 → **0.10.0.30**, Task 2 → **0.10.0.31**,
> Task 3 → **0.10.0.32**, Task 4 → **0.10.0.33**, Task 5 → **0.10.0.34**, Task 6 → **0.10.0.35**
> (remap every version/changelog reference accordingly).

> **Orchestrator context (2026-07-02):** This plan targets the integration worktree at `/home/cwlroda/projects/sofa-so-good/.claude/worktrees/ui-polish-program` (branch `worktree-ui-polish-program`). Batches 1 + 2a + 2b are already merged here: the full OKLch token system incl. the `--dur-1/-2/-3`/`--ease-out` motion scale + `--panel-w`/`--panel-w-compact`, `.liftable`, `.stagger-in` (fill-mode `backwards` convention), `.skeleton`, the `<Button>` primitive (with `loading`), dock-panel slide entrance, `EditConfirmBar` dismiss animations, empty-state CTAs, the destructive-confirm policy, and the inline-px guard (`src/ui/inlinePxGuard.test.ts`, with a `GRANDFATHERED` set). Do **not** read the primary checkout at `/home/cwlroda/projects/sofa-so-good` — it is a different branch. All line numbers below were read from this worktree on 2026-07-02; **re-locate every edit target by content before editing** (each commit shifts line numbers).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **TODO.md convention (user, 2026-07-02):** shipped items are removed from TODO.md entirely — never left as checked/"SHIPPED" lines. Each task that ships a P-item deletes that item's bullet from `TODO.md` in the same commit.

# Batch 3a — UI/UX polish program (screen transitions / disclosure / discoverability / persistence)

## Goal

Ship five items from `TODO.md`'s "Batch 3 — larger" list: **P6** a screen-transition crossfade between the 3D view / floor-plan editor / walk mode, **P29** in-panel search (History panel — Layers already shipped in 2b, so this is only the History gap), **P39** persisted panel state (open catalog + left-dock tab + collapsed layer groups survive reload), **P25** progressive-disclosure info callouts (a shared flag-gated `<InfoCallout>`), and **P27** "New" feature badges (a flag-gated pulsing `.new-dot` dismissed on first use). One final visual-verification task covers the batch. Everything builds on the existing OKLch token system + the motion scale + the localStorage-prefs + feature-flag infrastructure; no framework changes.

## Architecture (real findings from the worktree)

- **Mode switching (P6).** `App.tsx` (lines 872–1064) renders one persistent `.stage-area` holding either `<RoomEditorScene />` or `<Scene />` (line 882, keyed on `roomEditorActive`), plus the floor-plan editor as a full-screen sibling overlay: `{floorPlanEditing ? <Suspense><FloorPlanEditor /></Suspense> : null}` (lines 1053–1057). Mode flags: `cameraMode` (`orbit`/`firstPerson`, `cameraSlice`), `roomEditor.active` (`uiSlice`), `floorPlanEditing` (`floorPlanSlice.ts:117`, toggled by `setFloorPlanEditing`/`toggleFloorPlanEditing` at lines 427–434).
- **Existing transition masking.** `showLoading(label)` sets `loading:{active:true,label}` (`uiSlice.ts:282`). It is already fired for **orbit↔walk** (`cameraSlice.ts:114`) and **room-editor enter/exit** (`uiSlice.ts:294,310`). `<LoadingOverlay active={booting||loading.active}>` (`App.tsx:1058`) fades over these via `useOverlayLifecycle`. `App.tsx:386–390` clears `loading.active` on the next frame. **The floor-plan editor open/close does NOT call `showLoading`** — `.plan-screen` just mounts/unmounts with no transition. So P6's real gap is a crossfade for the floor-plan-editor mount; orbit↔walk + room enter/exit are already crossfaded (don't double-animate them).
- **Floor-plan editor root.** `FloorPlanEditor.tsx:1919-1920` returns `<div className="plan-screen absolute inset-0 z-30 flex flex-col">`. `.plan-screen` is styled in `screens.css:104,108` (background only — **no entrance animation currently**).
- **Reduced-motion.** Global block in `app.css:223` zeroes `animation-duration`/`-delay`/`-iteration-count` + `transition-*` on `*` (0.01ms, keeps `animationend` firing), with a `.skeleton` static-fill override. New keyframes/transitions inherit the resets automatically; use fill-mode `backwards` (never `both`).
- **Catalog search idiom (P29).** `CatalogDrawer.tsx:281-321` = `<div className="cat-search"><div className="field"><Icon.Search className="icn"/><input type="search" className={q?'input has-clear':'input'} .../>{q?<button className="icon-btn field-clear">…}</div></div>`. `.cat-search`/`.field`/`.input`/`.field-clear` in `parts.css:8-11`.
- **Layers search — ALREADY SHIPPED (2b).** `LayersPanel.tsx:48-49,87-98` has `filter` state, a `.cat-search` input, `visibleGroups` filtering, a match count, a no-results `EmptyState` with "Clear filter", and force-expand-while-filtering. **P29-Layers is complete — do not touch it.** P29's remaining gap is the **History panel**.
- **History panel (P29 gap).** `HistoryPanel.tsx` renders `<aside className="panel mini aux" style={{width:300}}>` (line 66) with `AuxPanelHead` + undo/redo `<Button>` row + a reversed list of timeline entries (`buildHistoryTimeline`, each `{index,label,isCurrent}`, mapped at `:109-154`). **No search field.** NOTE: this file carries pre-existing inline-px literals in the inline-px guard's `GRANDFATHERED` set — the new search field MUST reuse the `.cat-search`/`.field`/`.input` **classes** (zero new inline px) so the guard stays green.
- **Persistence (P39).** Per-device UI prefs persist through `storage/editorPrefs.ts`: `loadEditorPrefs()` (`:15-56`) reads key `sofa.editor.v1` and `useStore.setState({...})`; `watchEditorPrefs()` (`:58-80`) writes a fixed field set on every store change. Current persisted fields: `snapEnabled`, `gridSize`, `units`, `backdrop`, `hdriId`, `uiMode`, `walkFov`, `walkEyeHeight`, `planLabels`. **NOT persisted (ephemeral):** `catalogOpen` (`uiSlice.ts:29`), `leftMode` (`featuresSlice.ts:56`, `'catalog'|'layers'`), and LayersPanel group-collapse (component-local `useState<Record<string,boolean>>` at `LayersPanel.tsx:47`). **There is no dock-side state** — inspector always right, catalog always left; nothing to persist there (scope note). Mobile is `body.mobile` ≤640px (`App.tsx:320-326`); catalog is a bottom-sheet there.
- **Self-persisting slice idiom (P25/P27).** `recentSlice.ts` is the template: module-level `loadRecent()`/`persistRecent()` around a `localStorage` key (`hdb_recent_items`), a `Pick<>` `_INITIAL` seeded from `load…()`, setters that compute→persist→`set()`. `favouritesSlice` follows the same shape.
- **Feature flags.** `FEATURE_FLAGS` registry in `flags/registry.ts` (each `{label,description,default,tier,devOnly?}`); `FeatureFlag` union in `flags/types.ts:8-128`; `resolveFlags(isDev,overrides,isAdmin,uiMode)` in `flags/resolve.ts:39` forces `pro`-tier off in Simple. React reads via `useFeature('flag')`; store mirror + `reresolveFeatureFlags()`/`setFeatureFlag` in `featureFlagsSlice.ts`. Flag tests in `featureFlags.test.ts` — both-mode idiom is `resolveFlags(true,{},false,'simple')` vs `'pro'` + tier/default assertions.
- **Badge/dot primitives (P27).** `.nub` is an accent count dot `absolute top:4px right:4px` on `.tool-btn` (`features.css:25-31`). `IconButton.tsx:10,42,58` already renders `{hasBadge ? <span className="nub">{badge}</span> : null}` from a `badge?:string|number` prop; `MenuItem` renders a menu row. `.empty-mini`/`.em-ic` in `features.css:34-46`.
- **Callout mount points.** In `App.tsx`'s `.stage-area`: `<RoomEditorCaption />` (line 887) in the room editor; `<WalkHud />` (line 899) in walk mode; the floor-plan editor's `.plan-screen` (`FloorPlanEditor.tsx:1920`).
- **Test precedent.** `src/styles/*.test.ts` grep tests; TSX via @testing-library; slice/pref tests seed `useStore.setState` and assert `localStorage`; `scripts/scenarios/*.json` drive `node scripts/shot.mjs --scenario`.

## Tech Stack

React 18 + TypeScript, Zustand sliced store (`src/state/store.ts`, `window.__store`), Vite, Vitest + @testing-library/react (jsdom), Biome (2-space / 100-col / single-quote / no-semicolons). Pure OKLch CSS token system across 5 themes × light/dark. Feature-flag registry + `resolveFlags`. Per-device prefs via `localStorage`. Visual verification via `node scripts/shot.mjs --scenario <file.json>`.

## Global Constraints

- **Feature flags — judged per item.**
  - **P25 (info callouts):** NEW user-facing surface → **flagged**. `infoCallouts` in `FEATURE_FLAGS`, **tier `'simple'`** (aids beginners, must appear in the default Simple experience → shown in both modes). No ⌘K command. Both-mode tests assert present in Simple AND Pro.
  - **P27 ("New" badges):** NEW user-facing surface → **flagged**. `newBadges`, **tier `'simple'`** (a `pro` tier would wrongly hide badges in Simple). Both-mode tests assert `newBadges` present in both modes AND that a badge on a **pro-target** feature is hidden in Simple (rides the target flag).
  - **P6 (crossfade):** pure CSS motion polish → **un-flagged** (matches P3/P5 precedent).
  - **P29 (History search):** filter field inside the already-flag-gated History panel → **no new flag** (catalog search has none either); rides the existing `history` flag.
  - **P39 (persisted panel state):** behavioural persistence of ephemeral UI prefs → **un-flagged** (matches the `editorPrefs` precedent).
- **No hardcoded colours anywhere** — token vocabulary only. Every surface works in light + dark across all 5 themes.
- **Reduced motion:** new keyframes/transitions inherit the global resets. Entrance keyframes use fill-mode **`backwards`, never `both`**. The `.new-dot` pulse is infinite → the global `animation-iteration-count:1` settles it; verify it lands visible (else add an explicit reduce-motion override, mirroring `.skeleton`).
- **Inline-px guard must stay green.** New inline styles use tokens or existing classes. Do NOT add new files to `GRANDFATHERED`. The History search field reuses `.cat-search` classes.
- **Tests:** TDD. CSS-only → `src/styles/*.test.ts` grep test; components → @testing-library; flag additions extend `featureFlags.test.ts` (both modes + tier/default). Targeted vitest while iterating; hook runs the full suite per commit. Never run the full suite and the screenshot harness simultaneously.
- **Versioning (amended):** sequential from `'0.10.0.30'` (Task 1 → `.30` … Task 6 → `.35`); CHANGELOG entry at top per commit; `package.json` stays `0.10.0`. Biome style.
- **ONE COMMIT PER TASK.** `TYPE: summary (vX)`; `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer. Each task deletes its shipped P-item bullet from `TODO.md` in the same commit.
- **Docs (docs-currency):** the two flag additions (P25, P27) update `src/ui/CLAUDE.md` AND user docs in the same commit (verify labels against source). P6/P29/P39 update `src/ui/CLAUDE.md` / `src/state/CLAUDE.md` where a convention is introduced.
- **Visual verification:** one final task (Task 6).

**Parallel-dispatch file map:**
- **T1 (P6):** `src/styles/screens.css`, `src/ui/CLAUDE.md`, new `src/styles/screenTransition.test.ts` (+version/changelog/TODO at landing).
- **T2 (P29):** `src/ui/HistoryPanel.tsx`, new `src/ui/HistoryPanel.test.tsx`.
- **T3 (P39):** `src/state/slices/featuresSlice.ts`, `src/state/storage/editorPrefs.ts`, `src/ui/catalog/LayersPanel.tsx`, `src/state/storage/editorPrefs.test.ts`, new `src/ui/catalog/LayersPanel.persist.test.tsx`, `src/state/CLAUDE.md`.
- **T4 (P25):** `flags/types.ts`, `flags/registry.ts`, new `calloutsSlice.ts`, `store.ts`, new `InfoCallout.tsx`, `features.css`, `App.tsx`, `FloorPlanEditor.tsx`, `WalkHud.tsx`, `featureFlags.test.ts`, new `InfoCallout.test.tsx`, `src/ui/CLAUDE.md`, `docs/user/*`.
- **T5 (P27):** `flags/types.ts`, `flags/registry.ts`, new `newBadges.ts`, new `badgesSlice.ts`, `store.ts`, `IconButton.tsx`, one toolbar call-site, `features.css`, `featureFlags.test.ts`, new `newBadges.test.ts`, new `IconButton.badge.test.tsx`, `src/ui/CLAUDE.md`, `docs/user/*`.
- **T6:** new `scripts/scenarios/ui-polish-batch3a.json`.

T1 CSS-only + independent. T2/T3 disjoint. **T4 before T5** (shared flag files: types/registry/test/store/features.css/CLAUDE.md — extend, never overwrite).

---

### Task 1: P6 — Screen-transition crossfade (floor-plan editor mount)

**Files:**
- Modify `src/styles/screens.css` — mount-entrance keyframe + animation on `.plan-screen` (near ~line 108).
- Modify `src/ui/CLAUDE.md` — one "screen transitions" convention line.
- Create `src/styles/screenTransition.test.ts`.

**Interfaces:** No new tokens (`--dur-2` + `--ease-out`). The floor-plan editor is the only mode entry not masked by `LoadingOverlay`. `.plan-screen` mounts on `floorPlanEditing` → once-per-open entrance: `@keyframes screenFadeIn { from { opacity: 0 } to { opacity: 1 } }` (pure opacity fade against the persistent 3D canvas; **fill `backwards`**). Exit = instant reveal of the painted scene beneath (no leaving-state machine — documented). Reduced-motion: zeroed globally.

**Steps:**

- [ ] Write `src/styles/screenTransition.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import { describe, expect, it } from 'vitest'
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  describe('P6 screen-transition crossfade', () => {
    it('fades the floor-plan editor in on mount using --dur-2 + --ease-out with backwards fill', () => {
      const c = read('./screens.css')
      expect(c).toMatch(/@keyframes screenFadeIn\b/)
      expect(c).toMatch(/\.plan-screen\s*\{[^}]*animation:\s*screenFadeIn var\(--dur-2\) var\(--ease-out\) backwards/s)
      expect(c).not.toMatch(/screenFadeIn var\(--dur-2\) var\(--ease-out\) both/)
    })
    it('uses no colour literal in the keyframe', () => {
      const kf = read('./screens.css').match(/@keyframes screenFadeIn\s*\{[^}]*\}/s)?.[0] ?? ''
      expect(kf).not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl|oklch/i)
    })
  })
  ```
- [ ] Run it, expect failure: `npx vitest --run src/styles/screenTransition.test.ts`.
- [ ] Implement in `src/styles/screens.css` (extend the existing `.plan-screen` rule; keyframe adjacent):
  ```css
  .plan-screen { background: var(--surface-2); animation: screenFadeIn var(--dur-2) var(--ease-out) backwards; }
  @keyframes screenFadeIn { from { opacity: 0; } to { opacity: 1; } }
  ```
- [ ] Add to `src/ui/CLAUDE.md`: *"Screen transitions (P6): orbit↔walk and room-editor enter/exit are already crossfaded by `LoadingOverlay` (they fire `showLoading`); the floor-plan editor (`.plan-screen`) crossfades on mount via `screenFadeIn` (`--dur-2`/`--ease-out`, fill `backwards`) against the persistent 3D canvas. Don't add a competing fade to walk/room transitions. Exit is an instant reveal — no leaving-state machine."*
- [ ] Bump version per amendment (`'0.10.0.30'`); CHANGELOG entry `## FEAT: floor-plan-editor crossfade entrance (v0.10.0.30)`; delete the P6 bullet from TODO.md.
- [ ] Run: `npx vitest --run src/styles/screenTransition.test.ts` → passes.
- [ ] Commit: `git commit -am "FEAT: floor-plan-editor crossfade entrance (screenFadeIn) (v0.10.0.30)"`.

---

### Task 2: P29 — In-panel search (History panel; Layers already shipped)

**Files:**
- Modify `src/ui/HistoryPanel.tsx` — `.cat-search` filter field + entry filtering (do NOT touch Layers).
- Create `src/ui/HistoryPanel.test.tsx`.

**Interfaces:** Reuse the catalog/Layers search idiom (`.cat-search`>`.field`>`Icon.Search`+`<input type="search" className="input">`), **class-based only, zero new inline px** (HistoryPanel is grandfathered — don't add literals). `const [filter,setFilter]=useState('')`; `const q=filter.trim().toLowerCase()`; filter reversed entries by `e.label.toLowerCase().includes(q)`. Field shown only when `stepCount > 0`. No matches → shared `EmptyState` with "Clear filter" CTA (mirrors LayersPanel). Undo/redo/Clear-history act on true history, unaffected by the filter. Keep the `isCurrent` marker on matching rows.

**Steps:**

- [ ] Check whether a HistoryPanel test exists; then write `src/ui/HistoryPanel.test.tsx` (seed ≥2 labelled steps via real store actions per `buildHistoryTimeline`'s shape; `setHistoryOpen(true)`): (a) search field renders when steps exist and filters rows by label; (b) no-results shows `EmptyState` with a "Clear filter" CTA that resets the input.
- [ ] Run it, expect failure: `npx vitest --run src/ui/HistoryPanel.test.tsx`.
- [ ] Implement per the Interfaces block (field between the undo/redo Button row and the list, placeholder `` `Filter ${stepCount} steps…` ``, spacing via `var(--s-2)` tokens only; `shown = [...entries].reverse().filter(...)`; `EmptyState` on `q && shown.length===0`).
- [ ] Run tests → green. Bump version (`'0.10.0.31'`); CHANGELOG `## FEAT: History panel in-panel search (v0.10.0.31)`; delete the P29 bullet from TODO.md.
- [ ] Commit: `git commit -am "FEAT: History panel search field (reuses .cat-search idiom); Layers already had one (v0.10.0.31)"`.

---

### Task 3: P39 — Persisted panel state

**Files:**
- Modify `src/state/slices/featuresSlice.ts` — add `layersCollapsed: Record<string,boolean>` + `setLayersCollapsed`.
- Modify `src/state/storage/editorPrefs.ts` — persist `leftMode`, `layersCollapsed`, `catalogOpen` (desktop-gated restore).
- Modify `src/ui/catalog/LayersPanel.tsx` — group-collapse from the store instead of local `useState` (`:47`; call sites `:132`, `:275`).
- Modify `src/state/storage/editorPrefs.test.ts`; create `src/ui/catalog/LayersPanel.persist.test.tsx`; modify `src/state/CLAUDE.md`.

**Interfaces:** Extends per-device prefs (key `sofa.editor.v1`), NOT the save schema. Persist: `leftMode` (always restored), `layersCollapsed` (lifted to `featuresSlice`), `catalogOpen` (restored **desktop-only** via `matchMedia('(min-width:641px)')`; mobile restores `false` — bottom-sheet shouldn't auto-reopen). No dock-side persistence (no such state exists — scope note). All read in `loadEditorPrefs` with back-compat defaults; added to `watchEditorPrefs`'s snapshot.

**Steps:**

- [ ] Extend `editorPrefs.test.ts`: round-trip `leftMode`/`layersCollapsed`; `catalogOpen` restores true only under a mocked desktop `matchMedia`, false under mobile even if stored true.
- [ ] Write `LayersPanel.persist.test.tsx`: click a `.lyr-ghead` group header → `useStore.getState().layersCollapsed[<roomId>] === true`.
- [ ] Run both, expect failure.
- [ ] `featuresSlice.ts`: add `layersCollapsed`/`setLayersCollapsed` (interface + `{}` initial + `set({ layersCollapsed })` setter).
- [ ] `LayersPanel.tsx`: replace the local `collapsed` state with store reads; rewrite both `setCollapsed` call sites to compute-next + `setLayersCollapsed(next)`.
- [ ] `editorPrefs.ts`: extend `loadEditorPrefs` (validated parses per the Interfaces block, incl. the `matchMedia` desktop gate) and `watchEditorPrefs`'s snapshot with the three fields.
- [ ] `src/state/CLAUDE.md`: extend the persistence note (editorPrefs now also persists leftMode/layersCollapsed/catalogOpen-desktop — per-device convenience, out of the save schema).
- [ ] Run: `npx vitest --run src/state/storage/editorPrefs.test.ts src/ui/catalog/LayersPanel.persist.test.tsx src/ui/catalog/LayersPanel.test.tsx` → passes (existing Layers tests must not regress).
- [ ] Bump version (`'0.10.0.32'`); CHANGELOG `## FEAT: persist panel state — left-dock tab, collapsed layer groups, desktop catalog-open (v0.10.0.32)`; delete the P39 bullet from TODO.md.
- [ ] Commit: `git commit -am "FEAT: persist leftMode + layersCollapsed + (desktop) catalogOpen via editorPrefs (v0.10.0.32)"`.

---

### Task 4: P25 — Progressive-disclosure info callouts (flag-gated)

**Files:**
- Modify `src/features/flags/types.ts` (+`'infoCallouts'`), `src/features/flags/registry.ts` (entry below).
- Create `src/state/slices/calloutsSlice.ts` (self-persisting, key `hdb_dismissed_callouts`, mirrors `recentSlice`); register in `src/state/store.ts`.
- Create `src/ui/InfoCallout.tsx`; add `.info-callout` CSS to `src/styles/features.css` (near `.empty-mini`).
- Mount in `src/App.tsx` (room editor, near `<RoomEditorCaption />`), `src/ui/floorplan/FloorPlanEditor.tsx` (inside `.plan-screen`, below the header), `src/ui/WalkHud.tsx`.
- Modify `src/features/featureFlags.test.ts`; create `src/ui/InfoCallout.test.tsx`; update `src/ui/CLAUDE.md` + `docs/user/*`.

**Interfaces:**
- `calloutsSlice`: `dismissedCallouts: string[]`; `dismissCallout(id)` (dedupe → persist → set).
- `<InfoCallout id label title children?>`: `null` unless `useFeature('infoCallouts')` AND not dismissed. Markup: `<div className="info-callout" role="note"><Icon.Info className="ic"/><div className="ic-body"><b>{title}</b><span>{children}</span></div><button className="ic-dismiss" aria-label="Don't show this again" onClick={()=>dismissCallout(id)}><Icon.Close/></button></div>` (verify icon names exist; nearest equivalents otherwise).
- Three callouts (ids `room-editor`, `floor-plan`, `walk-mode`) — copy verified against real controls before finalizing.
- `.info-callout` CSS: `background: var(--surface-2)`, `border: 1px solid var(--border)`, accent left edge `box-shadow: inset 3px 0 0 var(--accent)`, `border-radius: var(--r-2)`, padding `var(--s-3) var(--s-4)`, `--t-sm`/`--lh-body` body, `--t-xs`/`--text-3` span. No literals.
- Registry entry:
  ```ts
  // Dismissible, localStorage-persisted first-run hint banners for the room
  // editor / floor-plan editor / walk mode (P25). Pure UI, prod-safe. Aids
  // beginners in the default experience → simple tier (shown in both modes).
  infoCallouts: {
    label: 'Info callouts',
    description: 'Dismissible hint banners in the room, floor-plan and walk screens',
    default: true,
    tier: 'simple',
  },
  ```

**Steps:**

- [ ] Extend `featureFlags.test.ts` with the both-mode + tier/default describe block (resolveFlags simple/pro × dev/prod all `true`; `devOnly` undefined; tier `'simple'`).
- [ ] Write `InfoCallout.test.tsx`: renders when flag on + not dismissed; dismiss persists id + unmounts; `null` when flag off; `null` when already dismissed.
- [ ] Run both, expect failure.
- [ ] Implement: types union + registry entry + `calloutsSlice` + store registration + `InfoCallout.tsx` + `.info-callout` CSS + the three mounts (verify WalkHud only mounts in walk mode).
- [ ] Docs: `src/ui/CLAUDE.md` convention line (flag-gated, per-id persisted, one concise line, never a modal) + a short user-docs "Helpful hints" note (verify file/labels).
- [ ] Run: `npx vitest --run src/features/featureFlags.test.ts src/ui/InfoCallout.test.tsx` → passes.
- [ ] Bump version (`'0.10.0.33'`); CHANGELOG `## FEAT: progressive-disclosure info callouts (v0.10.0.33)`; delete the P25 bullet from TODO.md.
- [ ] Commit: `git commit -am "FEAT: <InfoCallout> progressive-disclosure hints, flag-gated + per-id persisted (v0.10.0.33)"`.

---

### Task 5: P27 — "New" feature badges (flag-gated; SEQUENCED AFTER Task 4)

**Files:**
- Modify `src/features/flags/types.ts` (+`'newBadges'`), `src/features/flags/registry.ts` (entry below).
- Create `src/ui/newBadges.ts` (NEW_BADGES registry + `isRecentlyIntroduced` + `useNewBadge`); create `src/state/slices/badgesSlice.ts` (key `hdb_seen_badges`); register in `store.ts`.
- Modify `src/ui/toolbar/IconButton.tsx` (`newFlag?: FeatureFlag` prop); wire ONE representative toolbar/menu entry.
- Add `.new-dot` + `newPulse` to `src/styles/features.css` (near `.nub`).
- Modify `featureFlags.test.ts`; create `src/ui/newBadges.test.ts` + `src/ui/toolbar/IconButton.badge.test.tsx`; update `src/ui/CLAUDE.md` + `docs/user/*`.

**Interfaces:**
- `NEW_BADGES: Partial<Record<FeatureFlag, string>>` (flag → introduced APP_VERSION; pick 1–2 flags genuinely shipped in the 0.10.0.x line with a real toolbar/menu entry, confirmed from CHANGELOG). `isRecentlyIntroduced(introduced, current = APP_VERSION, window = 25)`: same major.minor.patch AND `current.build - introduced.build <= window` (uses `parseVersion`). Retire = remove the entry.
- `badgesSlice`: `seenBadges: string[]`; `markBadgeSeen(flagId)`.
- `useNewBadge(flag)`: `{ show, markSeen }` — `show = newBadges on && target flag on && flag in NEW_BADGES && recent && unseen` (gate inside the hook with a sentinel so IconButton can call it unconditionally). Badge rides the **target** flag → hidden in Simple for pro targets (tested).
- `IconButton` renders `{show ? <span className="new-dot" aria-hidden /> : null}`; wrapped `onClick` also `markSeen()`.
- `.new-dot`: like `.nub` (absolute top/right, 8px, `border-radius:999px`, `background: var(--accent)`), `animation: newPulse 1.6s ease-in-out infinite`; `@keyframes newPulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--accent) 55%, transparent); } 70% { box-shadow: 0 0 0 6px transparent; } }`. Reduced-motion: settles via global iteration-count:1 — verify it parks visible.
- Registry entry:
  ```ts
  // Pulsing "New" dot on recently-shipped toolbar/menu entries, dismissed on
  // first use, persisted per-flag (P27). Pure UI, prod-safe. Discoverability
  // polish for all users (badges both simple- and pro-tier entries) → simple tier.
  newBadges: {
    label: 'New feature badges',
    description: 'Pulsing dot marking newly-shipped features until first use',
    default: true,
    tier: 'simple',
  },
  ```

**Steps:**

- [ ] Extend `featureFlags.test.ts` (both-mode + tier/default block for `newBadges`).
- [ ] Write `newBadges.test.ts`: recency math (within window / old version / different patch line); every NEW_BADGES key is a valid flag; every version parses.
- [ ] Write `IconButton.badge.test.tsx`: dot shows (flag on + recent + unseen); click marks seen + dot gone on re-render; `newBadges` off → no dot; target flag off (pro target in Simple) → no dot.
- [ ] Run all three, expect failure.
- [ ] Implement: types + registry + `newBadges.ts` + `badgesSlice` + store registration + IconButton prop (+ MenuItem instead if the chosen entry is a menu row — one integration point) + `.new-dot` CSS + wire the representative entry.
- [ ] Docs: `src/ui/CLAUDE.md` convention line + user-docs "New feature markers" note.
- [ ] Run: `npx vitest --run src/features/featureFlags.test.ts src/ui/newBadges.test.ts src/ui/toolbar/IconButton.badge.test.tsx` → passes.
- [ ] Bump version (`'0.10.0.34'`); CHANGELOG `## FEAT: "New" feature badges (v0.10.0.34)`; delete the P27 bullet from TODO.md.
- [ ] Commit: `git commit -am "FEAT: New-feature badges (.new-dot) — registry-driven, dismissed on first use, per-flag persisted (v0.10.0.34)"`.

---

### Task 6: Batch visual verification

**Files:**
- Create `scripts/scenarios/ui-polish-batch3a.json` (schema per `docs/visual-verification-playbook.md` + `scripts/scenarios/ui-polish-batch2b.json`).

**Interfaces:** window.__store levers; screenshots reviewed by eye. Covers: floor-plan crossfade (P6), info callout + dismiss (P25), New-badge dot + clear-on-click (P27), History search filtering (P29), and a P39 persistence probe (single-session harness → assert the prefs land in `localStorage['sofa.editor.v1']` rather than a true reload).

**Steps:**

- [ ] Author the scenario with the standard preamble then: `screen-crossfade` (setFloorPlanEditing(true) → shot mid-fade + settled → false), `info-callout` (clear `hdb_dismissed_callouts`, enter room editor, shot, dismiss, shot), `new-badge` (clear `hdb_seen_badges`, open the badged entry's toolbar/menu, shot, click, shot), `history-search` (seed steps, open History, type into the search input, shot), `persist-probe` (set leftMode/layersCollapsed via store, eval-read `sofa.editor.v1`, log probe).
- [ ] Run once (never alongside the full suite): `node scripts/shot.mjs --scenario scripts/scenarios/ui-polish-batch3a.json --out-dir <scratchpad>/shots`.
- [ ] **Visually review every screenshot** (fade clean, callout legible light+dark, dot pulses + clears, list filters); reduced-motion re-check (crossfade + pulse settle statically). Fix artifacts before finalising.
- [ ] Full gate once: `npm test`, `npx tsc --noEmit`, `npm run check`.
- [ ] Bump version (`'0.10.0.35'`); CHANGELOG `## CHORE: visual-verification scenario for UI polish batch 3a (v0.10.0.35)`.
- [ ] Commit: `git commit -am "CHORE: ui-polish-batch3a visual-verification scenario (v0.10.0.35)"`.

---

### Critical Files for Implementation
- src/features/flags/registry.ts
- src/state/storage/editorPrefs.ts
- src/ui/HistoryPanel.tsx
- src/ui/toolbar/IconButton.tsx
- src/state/slices/recentSlice.ts (self-persisting-slice template)
