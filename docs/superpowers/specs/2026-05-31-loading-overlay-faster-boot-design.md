# Loading overlay + faster initial boot — design

## Problem

Initial load is slow and shows a blank screen. Two distinct issues:

1. **Blank-screen gap (real perf bug).** `src/main.tsx`'s `boot()` `await`s
   `hydrate()` — IndexedDB user-asset reads, pack reads, IKEA blob
   re-resolution, and the localStorage layout parse — *before*
   `createRoot().render()` ever runs. Until all of that resolves the page is
   blank HTML. Then the `<Canvas>` mounts and 66 default items + procedural
   materials + IBL initialise on the first frame with no feedback.
2. **No transition masking.** Switching orbit↔walk and entering/exiting the
   per-room editor (which swaps to a separate `<Canvas>`, pins tiers, and
   reframes the camera) happen with no overlay, so the user sees a half-built
   or popping scene.

## Goals

- Eliminate the blank-screen gap on first load by rendering React immediately
  and hydrating concurrently.
- Add an aesthetic, reusable loading overlay (soft warm gradient + a looping
  SVG line-art "room furnishing itself" animation) used for: initial boot,
  orbit↔walk switch, and per-room editor enter/exit.
- Verify the improvement with the screenshot/perf harness, not just assert it.

Non-goal: scoped progress UI for individual heavy GLB/pack asset loads (the
existing PacksTab SSE bar already covers pack installs).

## Part A — Faster boot

Render React immediately; hydrate after first paint.

- `main.tsx`: keep `registerGltfDecoders()` (cheap, synchronous, must precede
  any GLB load). Then `createRoot().render(<App/>)` *without* awaiting
  `hydrate()`. Move `hydrate()` + the pref loaders/watchers + `startAutosave()`
  + the dev `window.__store` exposure into an async bootstrap the app kicks off
  on mount.
- New store flag `bootPhase: 'hydrating' | 'ready'` (uiSlice). A
  `<BootHydrator>` effect (mounted in `App`) runs the async bootstrap once and
  sets `bootPhase = 'ready'` in a `finally`. The existing first-mount
  `resetToDefault()` seed in `App` must run *after* hydration resolves (else it
  seeds defaults before the autosave loads and clobbers it) — so it moves into
  the same bootstrap, gated on `items.length === 0`.
- The dev-only dynamic `import()`s (arrangeRoom etc.) stay lazy and off the
  critical path; they run inside the bootstrap after hydration.

Risk: ordering. Today `hydrate()` finishes before render, so the store is
populated before `App`'s seed effect. We preserve that ordering by moving the
seed into the post-hydration bootstrap. `clearHistory()` still runs after seed.

## Part B — `<LoadingOverlay>`

`src/ui/loading/LoadingOverlay.tsx` — a fixed, full-viewport DOM overlay above
all other UI (`z-index` above toolbar/panels).

- **Background:** soft warm gradient (off-white → pale warm sand), matching the
  flat IKEA-clean palette.
- **Animation:** a hand-built SVG line-art room that furnishes itself on a
  loop — wall/floor lines draw in via `stroke-dashoffset`, then sofa → table →
  lamp → plant fade/pop in on a staggered cycle, then the cycle repeats. Pure
  CSS `@keyframes` + inline SVG, no new dependency.
- **Wordmark + phase label:** "HDB Sandbox" + a contextual line passed by the
  caller (`label`).
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` renders the room
  fully drawn (no draw-in / pop loop) with only a faint shimmer.
- **Lifecycle (min-time + fade):** props `active: boolean`, `label: string`.
  Internal state machine:
  - When `active` goes true: record show time, render at full opacity.
  - When `active` goes false: keep mounted until `max(0, MIN_MS - elapsed)`
    has passed (MIN_MS ≈ 600), then play a ~250ms opacity fade, then unmount.
  This prevents flicker on sub-100ms loads. Implemented as a small hook
  `useOverlayLifecycle(active)` returning `{ mounted, fading }` so it's unit
  testable without a DOM renderer.

## Part C — Triggers

Add to `uiSlice`:

```
loading: { active: boolean; label: string }
showLoading(label: string): void
hideLoading(): void
```

Wiring:
1. **Initial boot:** `bootPhase !== 'ready'` ⇒ overlay active, label
   "Furnishing your flat…". (Derived in `App`; no need to also toggle
   `loading` for boot — boot uses `bootPhase`, transitions use `loading`. A
   single `<LoadingOverlay active={bootPhase!=='ready' || loading.active} .../>`
   in `App` consumes both, with boot label taking precedence while hydrating.)
2. **Orbit↔walk:** `setCameraMode` (uiSlice/cameraSlice) calls
   `showLoading('Switching view…')` then schedules `hideLoading()` — the
   overlay's own MIN_MS handles the brief crossfade. Because mode-switch is
   near-instant, we call `hideLoading()` on the next tick and let the lifecycle
   hook hold it for MIN_MS.
3. **Per-room editor:** entering (`enterRoomEditor`) →
   `showLoading('Entering room…')`; exiting (`exitRoomEditor`) →
   `showLoading('Exiting room…')`; each schedules `hideLoading()` after the
   Canvas swap commits (next tick / rAF). This masks the teardown + tier pin +
   camera reframe.

Keeping boot on `bootPhase` and transitions on `loading` avoids a single
overloaded flag and keeps each trigger independently testable.

## Testing

- Unit (Vitest):
  - `useOverlayLifecycle` min-time/fade state machine (fake timers): stays
    mounted ≥ MIN_MS, fades, then unmounts; rapid active→false→true cancels a
    pending hide.
  - uiSlice `showLoading`/`hideLoading` set/clear `loading`.
- Visual verification (CLAUDE.md REQUIRED): run app; screenshot (a) boot
  overlay, (b) orbit→walk overlay, (c) room-editor enter overlay; review each
  for gradient/animation/label correctness and absence of flicker; report what
  was seen.

## Files

- `src/main.tsx` — render-first, hydrate-after.
- `src/App.tsx` — `<BootHydrator>`, derive overlay `active`/`label`, mount
  `<LoadingOverlay>`.
- `src/ui/loading/LoadingOverlay.tsx` (+ `useOverlayLifecycle.ts`,
  `RoomScene.tsx` SVG, `loading.css` or inline styled).
- `src/state/slices/uiSlice.ts` — `bootPhase`, `loading`, actions.
- camera + roomEditor actions — `showLoading`/`hideLoading` calls.
- `README.md` + `CLAUDE.md` — document the loading overlay system.
- tests under the relevant dirs.
