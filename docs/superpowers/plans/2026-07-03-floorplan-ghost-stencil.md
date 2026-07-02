# Ghost Stencil (Trace Backdrop) Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing trace-backdrop ("Reference photo") feature match the ghost-stencil spec: centered fit-to-plan on load, calibration that keeps the measured feature anchored, a re-center action, upload guardrails, a `SliderField` opacity control, and a feature flag.

**Architecture:** The feature already exists (`usePlanBackdrop` hook + `backdropPersist` IDB store + SVG `<image>` underlay + `scale` tool). All new geometry goes in a **pure module** `src/ui/floorplan/editor/backdropPlacement.ts` (per `src/ui/floorplan/editor/CLAUDE.md`: pure, no React/DOM/store, unit-tested); `FloorPlanEditor.tsx` stays a thin dispatcher.

**Tech Stack:** React + TypeScript, SVG plan canvas, Zustand store, Vitest, IndexedDB (`backdropPersist.ts`).

**Design spec:** `docs/superpowers/specs/2026-07-03-floorplan-ghost-stencil-design.md`

## Global Constraints

- Every user-facing feature gated via `FEATURE_FLAGS` (`src/features/flags/registry.ts`) with `tier: 'simple' | 'pro'`; pro features must be unit-tested hidden-in-Simple AND present-in-Pro.
- No hardcoded colour; use token classes (`.btn`, `.seg`, …).
- Labelled sliders use `ui/controls/SliderField`.
- Pure editor logic lives in `src/ui/floorplan/editor/` pure modules with `*.test.ts`; never grow `FloorPlanEditor.tsx` with math.
- Backdrop stays **outside** `FloorPlan`, undo history, the save schema, and autosave (existing invariant — do not add it).
- `exportPlanPng.ts` must keep stripping the backdrop (don't touch its strip logic).
- **Every commit bumps `build`** in `src/version.ts` (currently `0.11.0.1`); the final task sets the PR version `0.11.1.0` (patch bump — single feature) and mirrors `package.json` (`0.11.1`).
- While iterating run targeted tests only (`npx vitest --run <paths>`); full `npm test` + `tsc` + biome once, right before the last commit. Never run the full suite and the screenshot harness simultaneously.
- Biome style: 2-space, 100-col, single quotes, no semicolons.
- Visual verification after app changes: scenario harness + screenshot review (Task 6).

---

### Task 1: Pure placement/rescale module

**Files:**
- Create: `src/ui/floorplan/editor/backdropPlacement.ts`
- Test: `src/ui/floorplan/editor/backdropPlacement.test.ts`

**Interfaces:**
- Consumes: `Backdrop` type from `./planConstants` (uses only `mPerPx`, `ox`, `oz`).
- Produces (used by Tasks 2, 3, 5):
  - `MAX_PLAN_BACKDROP_BYTES: number` (25 MB)
  - `initialBackdropPlacement(imgW: number, imgH: number, ew: number, ed: number): { mPerPx: number; ox: number; oz: number }`
  - `rescaleBackdropAnchored(b: Pick<Backdrop, 'mPerPx' | 'ox' | 'oz'>, newMPerPx: number, anchorX: number, anchorZ: number): { mPerPx: number; ox: number; oz: number }`
  - `centerBackdrop(b: Pick<Backdrop, 'w' | 'h' | 'mPerPx'>, ew: number, ed: number): { ox: number; oz: number }`

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/floorplan/editor/backdropPlacement.test.ts
import { describe, expect, it } from 'vitest'
import {
  centerBackdrop,
  initialBackdropPlacement,
  rescaleBackdropAnchored,
} from './backdropPlacement'

describe('initialBackdropPlacement', () => {
  it('uniform-fits a wide image to 90% of the plan and centres it', () => {
    // image 1000x500 px, plan 10x8 m → limiting axis is width: 10/1000*0.9
    const p = initialBackdropPlacement(1000, 500, 10, 8)
    expect(p.mPerPx).toBeCloseTo(0.009)
    // metric size 9 x 4.5 → top-left at centre minus half-size
    expect(p.ox).toBeCloseTo(10 / 2 - 9 / 2)
    expect(p.oz).toBeCloseTo(8 / 2 - 4.5 / 2)
  })

  it('uniform-fits a tall image on the depth axis', () => {
    // image 500x1000 px, plan 10x8 m → limiting axis is depth: 8/1000*0.9
    const p = initialBackdropPlacement(500, 1000, 10, 8)
    expect(p.mPerPx).toBeCloseTo(0.0072)
    expect(p.oz).toBeCloseTo(8 / 2 - (1000 * 0.0072) / 2)
  })

  it('survives degenerate inputs (zero-size image / empty plan)', () => {
    const p = initialBackdropPlacement(0, 0, 0, 0)
    expect(p.mPerPx).toBeGreaterThan(0)
    expect(Number.isFinite(p.ox)).toBe(true)
    expect(Number.isFinite(p.oz)).toBe(true)
  })
})

describe('rescaleBackdropAnchored', () => {
  it('keeps the image point under the anchor fixed across the rescale', () => {
    const b = { mPerPx: 0.01, ox: 1, oz: 2 }
    // anchor world (3, 4) → image px (200, 200)
    const r = rescaleBackdropAnchored(b, 0.02, 3, 4)
    expect(r.mPerPx).toBe(0.02)
    // same image px must map back to the anchor: ox + 200*0.02 === 3
    expect(r.ox + 200 * r.mPerPx).toBeCloseTo(3)
    expect(r.oz + 200 * r.mPerPx).toBeCloseTo(4)
  })

  it('is identity when the scale is unchanged', () => {
    const b = { mPerPx: 0.01, ox: 1, oz: 2 }
    const r = rescaleBackdropAnchored(b, 0.01, 5, 5)
    expect(r).toEqual({ mPerPx: 0.01, ox: 1, oz: 2 })
  })

  it('rejects non-finite / non-positive scales (returns input placement)', () => {
    const b = { mPerPx: 0.01, ox: 1, oz: 2 }
    expect(rescaleBackdropAnchored(b, 0, 3, 4)).toEqual(b)
    expect(rescaleBackdropAnchored(b, Number.NaN, 3, 4)).toEqual(b)
  })
})

describe('centerBackdrop', () => {
  it('centres at the current scale', () => {
    // 1000x500 px at 0.005 m/px → 5 x 2.5 m, plan 10x8
    const r = centerBackdrop({ w: 1000, h: 500, mPerPx: 0.005 }, 10, 8)
    expect(r.ox).toBeCloseTo(2.5)
    expect(r.oz).toBeCloseTo(2.75)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/ui/floorplan/editor/backdropPlacement.test.ts`
Expected: FAIL — cannot resolve `./backdropPlacement`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ui/floorplan/editor/backdropPlacement.ts
/**
 * Pure placement/scale math for the plan trace backdrop (ghost stencil).
 * World units are metres; the image is positioned by its top-left corner
 * (`ox`/`oz`) and scaled by `mPerPx` (metres per image pixel). Pure module —
 * no React/DOM/store (see editor/CLAUDE.md).
 */
import type { Backdrop } from './planConstants'

/** Upload size cap for the trace image (mirrors walkBackdrop's 25 MB cap). */
export const MAX_PLAN_BACKDROP_BYTES = 25 * 1024 * 1024

/** Fraction of the plan bounds the freshly-loaded image fits inside. */
const FIT_FRACTION = 0.9

/**
 * Initial placement for a newly-loaded backdrop: uniform-fit inside the plan
 * bounds (90% of the tighter axis) and centre on the plan centre. The canvas
 * grid margin is symmetric, so plan centre == canvas centre.
 */
export function initialBackdropPlacement(
  imgW: number,
  imgH: number,
  ew: number,
  ed: number,
): { mPerPx: number; ox: number; oz: number } {
  const w = Math.max(1, imgW)
  const h = Math.max(1, imgH)
  const spanX = Math.max(1, ew)
  const spanZ = Math.max(1, ed)
  const mPerPx = Math.min(spanX / w, spanZ / h) * FIT_FRACTION
  return {
    mPerPx,
    ox: ew / 2 - (w * mPerPx) / 2,
    oz: ed / 2 - (h * mPerPx) / 2,
  }
}

/**
 * Rescale about a world-space anchor so the image feature under the anchor
 * stays put — used by the Scale tool with the midpoint of the drawn reference
 * segment, so the wall the user just measured doesn't slide away.
 */
export function rescaleBackdropAnchored(
  b: Pick<Backdrop, 'mPerPx' | 'ox' | 'oz'>,
  newMPerPx: number,
  anchorX: number,
  anchorZ: number,
): { mPerPx: number; ox: number; oz: number } {
  if (!Number.isFinite(newMPerPx) || newMPerPx <= 0) {
    return { mPerPx: b.mPerPx, ox: b.ox, oz: b.oz }
  }
  const px = (anchorX - b.ox) / b.mPerPx
  const pz = (anchorZ - b.oz) / b.mPerPx
  return {
    mPerPx: newMPerPx,
    ox: anchorX - px * newMPerPx,
    oz: anchorZ - pz * newMPerPx,
  }
}

/** Re-centre the image on the plan centre at its current scale. */
export function centerBackdrop(
  b: Pick<Backdrop, 'w' | 'h' | 'mPerPx'>,
  ew: number,
  ed: number,
): { ox: number; oz: number } {
  return {
    ox: ew / 2 - (b.w * b.mPerPx) / 2,
    oz: ed / 2 - (b.h * b.mPerPx) / 2,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/ui/floorplan/editor/backdropPlacement.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Bump build + commit**

Edit `src/version.ts`: `APP_VERSION = '0.11.0.2'`.

```bash
git add src/ui/floorplan/editor/backdropPlacement.ts src/ui/floorplan/editor/backdropPlacement.test.ts src/version.ts
git commit -m "FEAT: pure backdrop placement math — centered fit + anchored rescale (v0.11.0.2)"
```

---

### Task 2: Centered load + upload guardrails in `usePlanBackdrop`

**Files:**
- Modify: `src/ui/floorplan/editor/usePlanBackdrop.ts`
- Modify: `src/ui/floorplan/FloorPlanEditor.tsx:284` (hook call site)
- Test: `src/ui/floorplan/editor/usePlanBackdrop.test.tsx` (extend)

**Interfaces:**
- Consumes: `initialBackdropPlacement`, `MAX_PLAN_BACKDROP_BYTES` (Task 1); `planBounds` from `src/floorplan/types.ts` (`planBounds(plan: FloorPlan): PlanVec2`); `useStore.getState().notify.start({ kind: 'error', title, message })`.
- Produces: `usePlanBackdrop(editing: boolean, setTool: (t: Tool) => void, plan: FloorPlan)` — signature gains the third `plan` param; return shape unchanged (`{ backdrop, setBackdrop, loadBackdrop, removeBackdrop }`).

- [ ] **Step 1: Write the failing tests**

Extend `src/ui/floorplan/editor/usePlanBackdrop.test.tsx`. Follow the file's existing harness (it already renders the hook and stubs `Image`/object URLs — reuse those helpers; pass a minimal `FloorPlan` whose `planBounds` is 10×8 m as the new third argument, and update every existing call site in the test to pass it). Add:

```tsx
it('centres and fits a loaded image to the plan bounds', async () => {
  // plan bounds 10x8; stubbed Image reports naturalWidth 1000, naturalHeight 500
  // (see existing Image stub in this file)
  const { result } = renderBackdropHook({ planSize: [10, 8] })
  act(() => result.current.loadBackdrop(makeImageFile('plan.png', 1024)))
  await act(flushImageLoad)
  const b = result.current.backdrop
  expect(b?.mPerPx).toBeCloseTo(0.009) // min(10/1000, 8/500) * 0.9
  expect(b?.ox).toBeCloseTo(0.5) // 10/2 - (1000*0.009)/2
  expect(b?.oz).toBeCloseTo(1.75) // 8/2 - (500*0.009)/2
})

it('rejects an oversize file with an error toast and no state change', () => {
  const { result } = renderBackdropHook({ planSize: [10, 8] })
  act(() => result.current.loadBackdrop(makeImageFile('huge.png', 26 * 1024 * 1024)))
  expect(result.current.backdrop).toBeNull()
  expect(useStore.getState().notifications.some((n) => n.kind === 'error')).toBe(true)
})

it('rejects a non-image file with an error toast', () => {
  const { result } = renderBackdropHook({ planSize: [10, 8] })
  act(() => result.current.loadBackdrop(new File(['x'], 'plan.pdf', { type: 'application/pdf' })))
  expect(result.current.backdrop).toBeNull()
  expect(useStore.getState().notifications.some((n) => n.kind === 'error')).toBe(true)
})
```

(`makeImageFile(name, size)` = `new File([new Uint8Array(size)], name, { type: 'image/png' })`; if the existing file has an equivalent helper, use it. `renderBackdropHook` is whatever render helper the file already uses, extended to build a `FloorPlan` with the given bounds — e.g. one wall from `[0,0]` to `[10,0]` plus one from `[0,0]` to `[0,8]`, or reuse the file's existing plan fixture.)

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest --run src/ui/floorplan/editor/usePlanBackdrop.test.tsx`
Expected: new tests FAIL (hook takes 2 args; `ox/oz` are 0; oversize file loads silently).

- [ ] **Step 3: Implement**

In `usePlanBackdrop.ts`:

```ts
import { type FloorPlan, planBounds } from '../../../floorplan/types'
import { useStore } from '../../../state/store'
import { initialBackdropPlacement, MAX_PLAN_BACKDROP_BYTES } from './backdropPlacement'
```

Signature: `export function usePlanBackdrop(editing: boolean, setTool: (t: Tool) => void, plan: FloorPlan)`.

Replace the body of `loadBackdrop`:

```ts
const loadBackdrop = (file: File) => {
  const fail = (message: string) =>
    useStore.getState().notify.start({ kind: 'error', title: 'Trace image', message })
  if (!file.type.startsWith('image/')) {
    fail('That file is not an image — drop a floor-plan photo or scan (PNG/JPG/WebP).')
    return
  }
  if (file.size > MAX_PLAN_BACKDROP_BYTES) {
    fail('That image is too large (max 25 MB).')
    return
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const [ew, ed] = planBounds(plan)
    const meta: BackdropMeta = {
      w: img.naturalWidth,
      h: img.naturalHeight,
      opacity: 0.5,
      ...initialBackdropPlacement(img.naturalWidth, img.naturalHeight, ew, ed),
    }
    // …rest identical to the current onload body (setBackdrop swap, urlRef,
    // persistBackdrop(file, meta), setTool('select'))…
  }
  img.src = url
}
```

Update the call site `FloorPlanEditor.tsx:284`:

```ts
const { backdrop, setBackdrop, loadBackdrop, removeBackdrop } = usePlanBackdrop(
  editing,
  setTool,
  plan,
)
```

(`plan` is already in scope in the editor — it's the store's `floorPlan`, the same value later passed to `usePlanViewport(plan, …)` at `:336`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/ui/floorplan/editor/usePlanBackdrop.test.tsx src/ui/floorplan/editor/backdropPlacement.test.ts`
Expected: PASS, including all pre-existing cases (update them for the new signature, nothing else).

- [ ] **Step 5: Bump build + commit**

Edit `src/version.ts`: `APP_VERSION = '0.11.0.3'`.

```bash
git add src/ui/floorplan/editor/usePlanBackdrop.ts src/ui/floorplan/editor/usePlanBackdrop.test.tsx src/ui/floorplan/FloorPlanEditor.tsx src/version.ts
git commit -m "FEAT: trace backdrop loads centered + fit-to-plan, rejects oversize/non-image uploads (v0.11.0.3)"
```

---

### Task 3: Anchored recalibration (Scale tool)

**Files:**
- Modify: `src/ui/floorplan/FloorPlanEditor.tsx:1229-1250` (the `tool === 'scale'` branch of `onUp`)

**Interfaces:**
- Consumes: `rescaleBackdropAnchored` (Task 1); existing `draft {x0,z0,x,z}`, `scaleCommits(draft)`, `promptText`, `setBackdrop`.
- Produces: no new API — behaviour change only (backdrop no longer slides on calibration).

- [ ] **Step 1: Modify the scale-commit branch**

The pure math is already tested (Task 1); this is dispatcher wiring, which the editor's unit tests don't cover — verified by the Task 6 scenario. Replace the `setBackdrop` line inside the prompt callback:

```ts
if (tool === 'scale') {
  const worldDist = Math.hypot(draft.x - draft.x0, draft.z - draft.z0)
  // Anchor the rescale on the midpoint of the drawn segment so the image
  // feature the user just measured stays under their line.
  const anchorX = (draft.x0 + draft.x) / 2
  const anchorZ = (draft.z0 + draft.z) / 2
  if (backdrop && scaleCommits(draft)) {
    void (async () => {
      const input = await useStore.getState().promptText({
        title: 'Calibrate scale',
        label: 'Real length of the line you drew (metres)',
        defaultValue: '1',
        numeric: true,
        submitLabel: 'Set scale',
      })
      const meters = input ? Number.parseFloat(input) : NaN
      if (Number.isFinite(meters) && meters > 0) {
        setBackdrop((b) =>
          b
            ? { ...b, ...rescaleBackdropAnchored(b, (b.mPerPx * meters) / worldDist, anchorX, anchorZ) }
            : b,
        )
      }
    })()
  }
  setDraft(null)
  return
}
```

Add the import at the top of `FloorPlanEditor.tsx`:

```ts
import { centerBackdrop, rescaleBackdropAnchored } from './editor/backdropPlacement'
```

(`centerBackdrop` is used in Task 5; importing both here avoids an import-churn commit.)

- [ ] **Step 2: Typecheck + targeted tests**

Run: `npx tsc --noEmit && npx vitest --run src/ui/floorplan/editor/`
Expected: clean tsc; editor module tests PASS.

- [ ] **Step 3: Bump build + commit**

Edit `src/version.ts`: `APP_VERSION = '0.11.0.4'`.

```bash
git add src/ui/floorplan/FloorPlanEditor.tsx src/version.ts
git commit -m "FIX: scale calibration anchors the backdrop on the measured segment (v0.11.0.4)"
```

---

### Task 4: Feature flag `planTraceBackdrop`

**Files:**
- Modify: `src/features/flags/registry.ts` (append before the closing `}` of `FEATURE_FLAGS`)
- Modify: `src/ui/floorplan/FloorPlanEditor.tsx` (gate button/segment at `:1641-1705`, canvas `onDrop` at `:2259`, `<image>` render at `:2286`)
- Test: `src/features/flags/planTraceBackdrop.test.ts` (create)

**Interfaces:**
- Consumes: `resolveFlags(isDev, overrides, isAdmin, uiMode)` from `src/features/flags/resolve.ts`; `useFeature` (`src/features/useFeature.ts`).
- Produces: flag key `planTraceBackdrop` (used by any future ⌘K entry).

- [ ] **Step 1: Write the failing both-modes test**

```ts
// src/features/flags/planTraceBackdrop.test.ts
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

describe('planTraceBackdrop flag', () => {
  it('is registered as a pro-tier, prod-default-on flag', () => {
    expect(FEATURE_FLAGS.planTraceBackdrop).toMatchObject({ default: true, tier: 'pro' })
  })

  it('is forced off in Simple mode and on in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').planTraceBackdrop).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').planTraceBackdrop).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/features/flags/planTraceBackdrop.test.ts`
Expected: FAIL — `planTraceBackdrop` not in registry (also a TS error on the key).

- [ ] **Step 3: Implement**

Registry entry (in `src/features/flags/registry.ts`, alongside the other plan-editor flags; the `FeatureFlag` union in `types.ts` is derived from the registry keys — if it's a hand-written union, add `'planTraceBackdrop'` there too):

```ts
// Trace backdrop (ghost stencil): upload a floor-plan photo/scan as a
// translucent, calibratable underlay to trace walls over. Plan-authoring aid
// beyond the Simple core loop → pro tier (matches planScale/planPolyline).
planTraceBackdrop: {
  label: 'Plan trace image',
  description: 'Upload a floor-plan image as a translucent underlay to trace over',
  default: true,
  tier: 'pro',
},
```

In `FloorPlanEditor.tsx`, next to the other flag reads (`fPlanScale` etc., around `:112-286`):

```ts
const fTraceBackdrop = useFeature('planTraceBackdrop')
```

Gate the three surfaces:
1. Wrap the whole reference-photo block in `fileActions` (`:1641` hidden input through `:1705` closing of the seg/ternary) in `{fTraceBackdrop ? (<>…existing input + button/segment…</>) : null}`.
2. Canvas `onDrop` (`:2259`): first line becomes `if (!fTraceBackdrop) return` before reading the file.
3. `<image>` render (`:2286`): `{fTraceBackdrop && backdrop && (<image …/>)}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsc --noEmit && npx vitest --run src/features/flags/ src/features/featureFlags.test.ts`
Expected: PASS (any registry-wide invariant tests pick up the new key automatically).

- [ ] **Step 5: Bump build + commit**

Edit `src/version.ts`: `APP_VERSION = '0.11.0.5'`.

```bash
git add src/features/flags/registry.ts src/features/flags/planTraceBackdrop.test.ts src/ui/floorplan/FloorPlanEditor.tsx src/version.ts
git commit -m "FEAT: planTraceBackdrop flag gates the trace backdrop (pro tier, default on) (v0.11.0.5)"
```

---

### Task 5: Toolbar polish — SliderField opacity + Center button

**Files:**
- Modify: `src/ui/floorplan/FloorPlanEditor.tsx:1663-1704` (backdrop segment in `fileActions`)

**Interfaces:**
- Consumes: `SliderField` (`src/ui/controls/SliderField.tsx`, props `{ label, value, min, max, step?, onChange, format?, ariaLabel? }`); `centerBackdrop` (imported in Task 3); `planBounds(plan)`.
- Produces: no new API.

- [ ] **Step 1: Replace the raw range input and add Center**

Inside the backdrop `<div className="seg" …>` replace the `<input type="range" …>` (`:1672-1683`) with:

```tsx
<SliderField
  label="Trace opacity"
  ariaLabel="Trace image opacity"
  value={backdrop.opacity}
  min={0.05}
  max={1}
  step={0.05}
  format={(v) => `${Math.round(v * 100)}%`}
  onChange={(v) => setBackdrop((b) => (b ? { ...b, opacity: v } : b))}
/>
```

and add, after the "Set scale" button:

```tsx
<button
  type="button"
  onClick={() =>
    setBackdrop((b) => {
      if (!b) return b
      const [ew, ed] = planBounds(plan)
      return { ...b, ...centerBackdrop(b, ew, ed) }
    })
  }
  title="Center the trace image on the plan"
>
  Center
</button>
```

Add imports: `import { SliderField } from '../controls/SliderField'` and `planBounds` (extend the existing `../../floorplan/types` import if `planBounds` isn't already imported).

Note: `min` is `0.05`, not `0` — a fully-invisible stencil with live controls is a confusing state. The min floor keeps it faintly visible. If `SliderField`'s layout is too wide for the toolbar segment (visual check in Task 6), constrain via a wrapper `style={{ width: 160 }}` on a plain `<div>` — do not fork the component.

- [ ] **Step 2: Typecheck + targeted tests**

Run: `npx tsc --noEmit && npx vitest --run src/ui/controls/SliderField.test.tsx src/ui/floorplan/editor/`
Expected: PASS.

- [ ] **Step 3: Bump build + commit**

Edit `src/version.ts`: `APP_VERSION = '0.11.0.6'`.

```bash
git add src/ui/floorplan/FloorPlanEditor.tsx src/version.ts
git commit -m "UX: trace backdrop gets a labelled opacity SliderField + Center action (v0.11.0.6)"
```

---

### Task 6: Visual verification scenario

**Files:**
- Create: `scripts/scenarios/plan-trace-stencil.mjs`

**Interfaces:**
- Consumes: the scenario harness (`node scripts/shot.mjs --scenario <file> --out-dir <dir>`; read `docs/visual-verification-playbook.md` first — it documents `window.__store`, step shapes, and gotchas). Store API: `setUiMode('pro')` + `reresolveFeatureFlags()`, `setFloorPlanEditing(true)`.
- Produces: screenshots proving centered load, opacity change, and Simple-mode hiding.

- [ ] **Step 1: Write the scenario**

```js
// scripts/scenarios/plan-trace-stencil.mjs
// Ghost stencil: load a synthetic floor-plan image via the canvas drop path,
// verify it renders centered + translucent, tweak opacity, then confirm the
// whole surface hides in Simple mode.
export default {
  steps: [
    {
      name: 'pro-mode-open-editor',
      eval: () => {
        const s = window.__store.getState()
        s.setUiMode('pro')
        s.reresolveFeatureFlags?.()
        s.setFloorPlanEditing(true)
      },
    },
    { name: 'wait-editor', waitFor: () => !!document.querySelector('.plan-paper') },
    {
      name: 'drop-image',
      eval: async () => {
        // Synthetic 800x400 "floor plan": white sheet + dark outline.
        const c = document.createElement('canvas')
        c.width = 800
        c.height = 400
        const g = c.getContext('2d')
        g.fillStyle = '#fff'
        g.fillRect(0, 0, 800, 400)
        g.strokeStyle = '#333'
        g.lineWidth = 8
        g.strokeRect(40, 40, 720, 320)
        g.strokeRect(40, 40, 360, 160)
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
        const file = new File([blob], 'plan.png', { type: 'image/png' })
        const dt = new DataTransfer()
        dt.items.add(file)
        const target = document.querySelector('.plan-canvas')
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
      },
    },
    { name: 'wait-image', waitFor: () => !!document.querySelector('.plan-paper image') },
    { name: 'shot-centered', screenshot: 'stencil-centered.png' },
    {
      name: 'opacity-low',
      eval: () => {
        const input = [...document.querySelectorAll('input[type=range]')].find((i) =>
          (i.getAttribute('aria-label') || '').includes('Trace'),
        )
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        set.call(input, '0.15')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      },
    },
    { name: 'shot-faint', screenshot: 'stencil-faint.png' },
    {
      name: 'simple-mode',
      eval: () => {
        const s = window.__store.getState()
        s.setUiMode('simple')
        s.reresolveFeatureFlags?.()
      },
    },
    {
      name: 'wait-hidden',
      waitFor: () => !document.querySelector('.plan-paper image'),
    },
    { name: 'shot-simple-hidden', screenshot: 'stencil-simple-hidden.png' },
  ],
}
```

(Adjust step-shape details to whatever `docs/visual-verification-playbook.md` prescribes — e.g. if `reresolveFeatureFlags` has a different name in the store, or scenario `eval` steps take strings; the playbook is the source of truth. `plan-pinch-zoom.mjs` is the nearest existing `.mjs` scenario to copy conventions from.)

- [ ] **Step 2: Run it and visually review**

```bash
npm run dev &   # if not already running
node scripts/shot.mjs --scenario scripts/scenarios/plan-trace-stencil.mjs --out-dir /tmp/stencil-shots
```

Review each PNG (Read tool): `stencil-centered.png` — image visible, translucent, centred on the plan (not pinned off at the grid corner); `stencil-faint.png` — clearly fainter; `stencil-simple-hidden.png` — no trace image, no Reference photo button. Fix + re-run until right; add any new harness gotchas to `docs/visual-verification-playbook.md`.

- [ ] **Step 3: Bump build + commit**

Edit `src/version.ts`: `APP_VERSION = '0.11.0.7'`.

```bash
git add scripts/scenarios/plan-trace-stencil.mjs src/version.ts
git commit -m "TEST: plan trace stencil visual scenario — centered load, opacity, Simple hiding (v0.11.0.7)"
```

---

### Task 7: Docs, changelog, version, full-suite gate

**Files:**
- Modify: `docs/user/floor-plan-editor.md` (Reference photo section, ~line 232)
- Modify: `docs/ARCHITECTURE.md` (plan-editor line: mention `backdropPlacement.ts` + flag)
- Modify: `src/ui/floorplan/editor/CLAUDE.md` (pure-module list gains `backdropPlacement.ts`)
- Modify: `CHANGELOG.md`, `TODO.md`, `src/version.ts`, `package.json`

**Interfaces:** none — documentation of Tasks 1–6.

- [ ] **Step 1: Update user docs**

In `docs/user/floor-plan-editor.md` (verify exact UI labels against the source before writing): the Reference photo section documents — the image loads **centered on your plan and sized to fit**; **Set scale**: drag along a wall of known length, type the real length (the image rescales around the line you drew); **Trace opacity** slider (5–100%); **Center** re-centres the image; 25 MB / image-files-only limit; Pro-mode only (mention the Simple/Pro toggle); the trace image is never included in plan PNG exports.

- [ ] **Step 2: Update ARCHITECTURE.md + editor CLAUDE.md + CHANGELOG.md + TODO.md**

- `docs/ARCHITECTURE.md`: in the floor-plan-editor bullet, note the trace backdrop is flag-gated (`planTraceBackdrop`, pro) with placement math in `editor/backdropPlacement.ts`.
- `src/ui/floorplan/editor/CLAUDE.md`: add `backdropPlacement.ts` to the pure-modules list.
- `CHANGELOG.md`: one `## FEAT: …` entry at the top summarising Tasks 1–6 (centered fit-to-plan load, anchored calibration, Center button, SliderField opacity, 25 MB guard, `planTraceBackdrop` flag) with the PR version.
- `TODO.md`: remove/tick anything this ships; add deferred items (per-storey backdrops, stencil drag-to-move, `aiWalls` anchoring) if not already tracked.

- [ ] **Step 3: PR version bump**

`src/version.ts`: `APP_VERSION = '0.11.1.0'` (patch bump — single feature; zero the build). `package.json`: `"version": "0.11.1"`.

- [ ] **Step 4: Full gate — once, before the final commit**

```bash
npm test 2>&1 | tee /tmp/claude-1000/-home-cwlroda-projects-sofa-so-good/*/scratchpad/full-suite.log | tail -5 && npx tsc --noEmit && npm run check
```

(Full output goes to the log file — never truncate the suite output itself; filter the file if it fails.) Expected: all pass; fix anything red before committing.

- [ ] **Step 5: Commit**

```bash
git add docs/user/floor-plan-editor.md docs/ARCHITECTURE.md src/ui/floorplan/editor/CLAUDE.md CHANGELOG.md TODO.md src/version.ts package.json
git commit -m "DOCS: ghost-stencil trace backdrop — user guide, architecture, changelog (v0.11.1.0)"
```

---

## Self-review notes

- **Spec coverage:** upload/translucency/calibration already exist (spec §"What already exists"); centered load → Task 2; scale-by-true-length kept + anchored → Task 3; customizable opacity → Task 5; guardrails → Task 2; flag hard-rule → Task 4; both-modes test hard-rule → Task 4 Step 1; visual-verification hard-rule → Task 6; docs hard-rule → Task 7.
- **Type consistency:** `rescaleBackdropAnchored(b, newMPerPx, anchorX, anchorZ)` takes scalar anchor coords everywhere (Tasks 1, 3); `usePlanBackdrop(editing, setTool, plan)` in Tasks 2, and unchanged return shape consumed at `FloorPlanEditor.tsx:284`.
- **Known softness:** Task 2's test code sketches harness helpers (`renderBackdropHook`, `flushImageLoad`) whose exact names live in the existing `usePlanBackdrop.test.tsx` — the implementer must reuse that file's real helpers; assertions and values stand as written. Task 6's scenario step shape must follow the playbook.
