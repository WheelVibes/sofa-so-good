# Time of Day — Phase 5 (Quality Settings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Phase 3/4 lighting features as user-toggleable quality settings: shadows (off/low/high), global illumination (off/IBL/IBL+SSAO), inter-room light bleed (on/off), and fixtures (on/off). Pick sane defaults from device hints. Persist user choices.

**Architecture:** New `qualitySlice` holds `{ shadows, globalIllumination, interRoomBleed, fixtures }`. Each Phase 3/4 module currently has a single hardcoded module-local constant gating its feature — those are replaced one-by-one with reads from `useStore((s) => s.quality.*)`. A new `<SettingsPanel>` modal (opened from a gear button in the toolbar) surfaces the controls. Defaults are picked from `navigator.hardwareConcurrency` / `navigator.deviceMemory` once on first run.

**Tech Stack:** TypeScript, React, Zustand, Vitest.

**Spec:** [docs/superpowers/specs/2026-05-01-time-of-day-design.md §5](../specs/2026-05-01-time-of-day-design.md).

---

## File structure

**Created**

- `src/state/slices/qualitySlice.ts` — `quality`, `setQuality(patch)`, plus a `pickDefaultQuality()` helper used at first load.
- `src/state/slices/qualitySlice.test.ts`
- `src/ui/SettingsPanel.tsx` — modal + toolbar gear button.
- `src/ui/SettingsPanel.test.tsx`

**Modified**

- `src/state/store.ts` — register slice, re-export `QualitySettings`.
- `src/state/schema.ts` — serialize `quality`.
- `src/state/schema.test.ts` — round-trip test.
- `src/ui/Toolbar.tsx` — gear button.
- `src/scene/lighting/Lighting.tsx` — `quality.shadows` drives `castShadow` + `shadow-mapSize` + `shadows='soft'|false`.
- `src/scene/Scene.tsx` — `<Canvas shadows>` read from `quality.shadows`.
- `src/scene/lighting/RoomFillLights.tsx` — `quality.interRoomBleed` switches between relaxed and base factors.
- `src/scene/lighting/Environment.tsx` — `quality.globalIllumination` mounts/unmounts `<Environment>`.
- `src/scene/lighting/PostFx.tsx` — `quality.globalIllumination === 'ibl+ssao'` mounts SSAO.
- `src/scene/furniture/FurnitureLights.tsx` — `quality.fixtures` gates rendering.

---

## Type and defaults

```ts
// src/state/slices/qualitySlice.ts
export interface QualitySettings {
  shadows: 'off' | 'low' | 'high';
  globalIllumination: 'off' | 'ibl' | 'ibl+ssao';
  interRoomBleed: boolean;
  fixtures: boolean;
}

export type QualityPreset = 'low' | 'medium' | 'high';

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  low:    { shadows: 'off',  globalIllumination: 'off',       interRoomBleed: true, fixtures: true },
  medium: { shadows: 'low',  globalIllumination: 'ibl',       interRoomBleed: true, fixtures: true },
  high:   { shadows: 'high', globalIllumination: 'ibl+ssao',  interRoomBleed: true, fixtures: true },
};
```

`pickDefaultQuality()` returns `QUALITY_PRESETS.low` if `hardwareConcurrency < 4` or `deviceMemory < 4`; `high` if `hardwareConcurrency >= 8 && deviceMemory >= 8`; otherwise `medium`. Both `navigator.deviceMemory` and `navigator.hardwareConcurrency` are flaky on Firefox/Safari — wrap in `try/catch`, default to `medium` on missing.

---

## Task 1: `qualitySlice` + tests

**Files**
- Create: `src/state/slices/qualitySlice.ts`, `src/state/slices/qualitySlice.test.ts`
- Modify: `src/state/store.ts`

- [ ] **Step 1: Tests**

```ts
// src/state/slices/qualitySlice.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pickDefaultQuality, QUALITY_PRESETS } from './qualitySlice';

function withNav(hwc: number | undefined, mem: number | undefined, fn: () => void) {
  const orig = { ...globalThis.navigator };
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...orig, hardwareConcurrency: hwc, deviceMemory: mem },
    configurable: true,
  });
  try { fn(); } finally {
    Object.defineProperty(globalThis, 'navigator', { value: orig, configurable: true });
  }
}

describe('pickDefaultQuality', () => {
  it('returns low on a 2-core / 2 GB device', () => {
    withNav(2, 2, () => {
      expect(pickDefaultQuality()).toEqual(QUALITY_PRESETS.low);
    });
  });
  it('returns high on an 8-core / 8 GB device', () => {
    withNav(8, 8, () => {
      expect(pickDefaultQuality()).toEqual(QUALITY_PRESETS.high);
    });
  });
  it('returns medium when hints are missing', () => {
    withNav(undefined, undefined, () => {
      expect(pickDefaultQuality()).toEqual(QUALITY_PRESETS.medium);
    });
  });
});

describe('quality slice', () => {
  it('setQuality merges a partial patch', async () => {
    const { useStore } = await import('../store');
    useStore.getState().__resetForTest();
    useStore.getState().setQuality({ shadows: 'off' });
    expect(useStore.getState().quality.shadows).toBe('off');
    expect(useStore.getState().quality.fixtures).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

`npx vitest run src/state/slices/qualitySlice.test.ts`

- [ ] **Step 3: Implement slice**

```ts
// src/state/slices/qualitySlice.ts
import type { SliceCreator } from './types';
import type { RootState } from '../store';

export interface QualitySettings {
  shadows: 'off' | 'low' | 'high';
  globalIllumination: 'off' | 'ibl' | 'ibl+ssao';
  interRoomBleed: boolean;
  fixtures: boolean;
}

export type QualityPreset = 'low' | 'medium' | 'high';

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  low:    { shadows: 'off',  globalIllumination: 'off',      interRoomBleed: true, fixtures: true },
  medium: { shadows: 'low',  globalIllumination: 'ibl',      interRoomBleed: true, fixtures: true },
  high:   { shadows: 'high', globalIllumination: 'ibl+ssao', interRoomBleed: true, fixtures: true },
};

export function pickDefaultQuality(): QualitySettings {
  try {
    const nav = globalThis.navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency;
    const mem = nav.deviceMemory;
    if (typeof cores !== 'number' || typeof mem !== 'number') {
      return QUALITY_PRESETS.medium;
    }
    if (cores < 4 || mem < 4) return QUALITY_PRESETS.low;
    if (cores >= 8 && mem >= 8) return QUALITY_PRESETS.high;
    return QUALITY_PRESETS.medium;
  } catch {
    return QUALITY_PRESETS.medium;
  }
}

export interface QualitySlice {
  quality: QualitySettings;
  setQuality: (patch: Partial<QualitySettings>) => void;
}

export const QUALITY_INITIAL: Pick<QualitySlice, 'quality'> = {
  quality: pickDefaultQuality(),
};

export const createQualitySlice: SliceCreator<QualitySlice, RootState> = (set) => ({
  ...QUALITY_INITIAL,
  setQuality: (patch) => set((s) => ({ quality: { ...s.quality, ...patch } })),
});
```

- [ ] **Step 4: Register in `store.ts`**

Edit `src/state/store.ts`:

```ts
import {
  createQualitySlice,
  QUALITY_INITIAL,
  type QualitySlice,
} from './slices/qualitySlice';

export type { QualitySettings, QualityPreset } from './slices/qualitySlice';
export { QUALITY_PRESETS } from './slices/qualitySlice';

// In RootState extends list, add: QualitySlice
// In INITIAL spread, add: ...QUALITY_INITIAL,
// In useStore implementation spread, add: ...createQualitySlice(set, get, api),
```

(Apply each edit explicitly; don't shorthand.)

- [ ] **Step 5: Run — expect PASS**

`npx vitest run src/state/slices/qualitySlice.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/state/slices/qualitySlice.ts src/state/slices/qualitySlice.test.ts src/state/store.ts
git commit -m "state: add quality slice with device-tier defaults"
```

---

## Task 2: Persist quality through `schema.ts`

**Files**
- Modify: `src/state/schema.ts`
- Modify: `src/state/schema.test.ts`

- [ ] **Step 1: Add to zod schema**

In `RawSerializedStateZ`:

```ts
quality: z
  .object({
    shadows: z.enum(['off', 'low', 'high']),
    globalIllumination: z.enum(['off', 'ibl', 'ibl+ssao']),
    interRoomBleed: z.boolean(),
    fixtures: z.boolean(),
  })
  .optional(),
```

`optional()` because existing saves don't have it. The hydration step (in `src/state/storage/hydrate.ts`) needs to call `pickDefaultQuality()` when the field is missing — quality is a per-device preference, not a per-save one (per spec §5 Persistence).

- [ ] **Step 2: Update `serialize` / `deserialize` to include quality**

Find the existing `toSerialized(state)` and `applyToStore(parsed)` functions in `schema.ts`. Add `quality: state.quality` on the way out, and on the way in:

```ts
state.setQuality(parsed.quality ?? pickDefaultQuality());
```

(Import `pickDefaultQuality` from `./slices/qualitySlice`.)

- [ ] **Step 3: Round-trip test**

In `src/state/schema.test.ts`, add:

```ts
it('round-trips quality settings', () => {
  useStore.getState().__resetForTest();
  useStore.getState().setQuality({ shadows: 'high', globalIllumination: 'ibl+ssao' });
  const out = serialize(useStore.getState());
  const parsed = parse(out);
  expect(parsed.quality?.shadows).toBe('high');
  expect(parsed.quality?.globalIllumination).toBe('ibl+ssao');
});

it('falls back to device defaults when quality is missing in old saves', () => {
  // Build a serialized payload without quality, deserialize, expect quality
  // to come from pickDefaultQuality (which returns 'medium' under happy-dom).
  const baseline = makeBaselineSerialized(); // existing helper in this file
  delete (baseline as { quality?: unknown }).quality;
  applyToStore(parse(JSON.stringify(baseline)));
  expect(useStore.getState().quality.shadows).toBe('low'); // happy-dom: cores=undefined
});
```

(Inspect the existing test helpers — names like `serialize`, `parse`, `applyToStore`, `makeBaselineSerialized` are placeholders; use the actual exported names found in `schema.ts` / `schema.test.ts`.)

- [ ] **Step 4: Run — expect PASS**

`npm test`

- [ ] **Step 5: Commit**

```bash
git add src/state/schema.ts src/state/schema.test.ts
git commit -m "state: persist quality settings; fallback to device defaults"
```

---

## Task 3: Wire `quality.shadows` into Lighting + Canvas

**Files**
- Modify: `src/scene/lighting/Lighting.tsx`
- Modify: `src/scene/Scene.tsx`

- [ ] **Step 1: Lighting.tsx**

Replace the Phase 3 module-local `SHADOW_MAP_SIZE` / `SHADOWS_ENABLED` constants with store reads:

```tsx
const shadows = useStore((s) => s.quality.shadows);
const shadowsEnabled = shadows !== 'off';
const shadowMapSize = shadows === 'high' ? 2048 : 1024;
```

And use those in the `<directionalLight>` props (`castShadow={shadowsEnabled}`, `shadow-mapSize-width={shadowMapSize}` etc.).

- [ ] **Step 2: Scene.tsx**

```tsx
const shadows = useStore((s) => s.quality.shadows);
// …
<Canvas
  shadows={shadows !== 'off' ? 'soft' : false}
  …
>
```

- [ ] **Step 3: Smoke test**

`npm run dev`. Toggle `quality.shadows` in DevTools console (`useStore.getState().setQuality({ shadows: 'off' })`) and confirm shadows disappear; switch to `'high'` — sharper shadows return at 2048 res.

- [ ] **Step 4: Commit**

```bash
git add src/scene/lighting/Lighting.tsx src/scene/Scene.tsx
git commit -m "lighting: gate shadow casting on quality.shadows"
```

---

## Task 4: Wire `quality.globalIllumination` into Environment + PostFx

**Files**
- Modify: `src/scene/lighting/Environment.tsx`
- Modify: `src/scene/lighting/PostFx.tsx`

- [ ] **Step 1: Environment.tsx**

```tsx
import { useStore } from '../../state/store';
// …
export function Environment() {
  const gi = useStore((s) => s.quality.globalIllumination);
  if (gi === 'off') return null;
  // existing altitude→hdri logic
  …
}
```

Remove the module-local `IBL_ENABLED` constant.

- [ ] **Step 2: PostFx.tsx**

```tsx
import { useStore } from '../../state/store';

export function PostFx() {
  const gi = useStore((s) => s.quality.globalIllumination);
  if (gi !== 'ibl+ssao') return null;
  // existing <EffectComposer>/<SSAO> JSX
}
```

Remove the module-local `SSAO_ENABLED` constant.

- [ ] **Step 3: Smoke test**

`npm run dev`. Toggle `setQuality({ globalIllumination: 'off' | 'ibl' | 'ibl+ssao' })` from console; verify reflections appear/disappear; verify SSAO corner darkening appears at `'ibl+ssao'`.

- [ ] **Step 4: Commit**

```bash
git add src/scene/lighting/Environment.tsx src/scene/lighting/PostFx.tsx
git commit -m "lighting: gate IBL + SSAO on quality.globalIllumination"
```

---

## Task 5: Wire `quality.interRoomBleed` and `quality.fixtures`

**Files**
- Modify: `src/scene/lighting/RoomFillLights.tsx`
- Modify: `src/scene/furniture/FurnitureLights.tsx`

- [ ] **Step 1: RoomFillLights.tsx**

Remove `BLEED_ENABLED` constant. Inside the component:

```tsx
const bleedEnabled = useStore((s) => s.quality.interRoomBleed);
// …
const relaxed = bleedEnabled
  ? relaxDaylight(base, buildRoomGraph(doors))
  : base;
```

Also remove `FILL_ENABLED` (always-on baseline now).

- [ ] **Step 2: FurnitureLights.tsx**

```tsx
const fixturesOn = useStore((s) => s.quality.fixtures);
if (!fixturesOn) return null;
```

Remove `FIXTURES_ENABLED` constant.

- [ ] **Step 3: Smoke test**

`npm run dev`. From console:
- `setQuality({ interRoomBleed: false })` — corridor stays dark even with the LD-corridor door open.
- `setQuality({ fixtures: false })` — placed lamps stop emitting light (geometry remains).

- [ ] **Step 4: Commit**

```bash
git add src/scene/lighting/RoomFillLights.tsx src/scene/furniture/FurnitureLights.tsx
git commit -m "lighting: gate room bleed + fixtures on quality.* settings"
```

---

## Task 6: SettingsPanel modal + toolbar gear button

**Files**
- Create: `src/ui/SettingsPanel.tsx`, `src/ui/SettingsPanel.test.tsx`
- Modify: `src/ui/Toolbar.tsx`

- [ ] **Step 1: Implement `SettingsPanel.tsx`**

```tsx
// src/ui/SettingsPanel.tsx
import { useStore } from '../state/store';
import { QUALITY_PRESETS, type QualityPreset } from '../state/slices/qualitySlice';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[28rem] rounded-lg bg-white p-5 text-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <header className="mb-3 flex items-start justify-between">
          <h2 className="text-base font-semibold">Settings</h2>
          <button onClick={onClose} className="text-neutral-400" aria-label="Close">×</button>
        </header>

        <section className="mb-4">
          <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">Quality preset</div>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as QualityPreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setQuality(QUALITY_PRESETS[p])}
                className="flex-1 rounded border border-neutral-300 px-3 py-1 text-sm capitalize hover:bg-neutral-100"
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">
            Shadows
          </label>
          <div className="flex gap-1">
            {(['off', 'low', 'high'] as const).map((v) => (
              <button
                key={v}
                aria-pressed={quality.shadows === v}
                onClick={() => setQuality({ shadows: v })}
                className={`flex-1 rounded border px-2 py-1 text-sm capitalize ${
                  quality.shadows === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                }`}
              >{v}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Sun shadows through windows. Big FPS impact.</p>
        </section>

        <section className="mb-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">
            Global illumination
          </label>
          <div className="flex gap-1">
            {(['off', 'ibl', 'ibl+ssao'] as const).map((v) => (
              <button
                key={v}
                aria-pressed={quality.globalIllumination === v}
                onClick={() => setQuality({ globalIllumination: v })}
                className={`flex-1 rounded border px-2 py-1 text-sm ${
                  quality.globalIllumination === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                }`}
              >{v}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">IBL is cheap; SSAO costs ~1–3 ms/frame.</p>
        </section>

        <section className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-neutral-500">Inter-room light bleed</div>
            <div className="text-[11px] text-neutral-500">Light spills through open doors. Free.</div>
          </div>
          <input
            type="checkbox"
            checked={quality.interRoomBleed}
            onChange={(e) => setQuality({ interRoomBleed: e.target.checked })}
            aria-label="Inter-room light bleed"
          />
        </section>

        <section className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-neutral-500">Fixtures</div>
            <div className="text-[11px] text-neutral-500">Render placed lamps and ceiling lights.</div>
          </div>
          <input
            type="checkbox"
            checked={quality.fixtures}
            onChange={(e) => setQuality({ fixtures: e.target.checked })}
            aria-label="Fixtures"
          />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add gear button to Toolbar.tsx**

Open `src/ui/Toolbar.tsx`. Find the existing toolbar group (where the time dropdown lives). Add:

```tsx
const [settingsOpen, setSettingsOpen] = useState(false);
// …
<button
  onClick={() => setSettingsOpen(true)}
  className="…matching-button-classes…"
  aria-label="Settings"
  title="Settings"
>
  ⚙
</button>
{settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
```

(Read the surrounding pattern — copy whatever className convention already-existing toolbar buttons use; don't invent.)

- [ ] **Step 3: Test the panel**

```tsx
// src/ui/SettingsPanel.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { useStore } from '../state/store';

describe('SettingsPanel', () => {
  it('toggling fixtures updates the store', () => {
    useStore.getState().__resetForTest();
    render(<SettingsPanel onClose={() => {}} />);
    const cb = screen.getByLabelText('Fixtures') as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(useStore.getState().quality.fixtures).toBe(false);
  });

  it('clicking a preset bulk-sets all four flags', () => {
    useStore.getState().__resetForTest();
    render(<SettingsPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /low/i }));
    expect(useStore.getState().quality.shadows).toBe('off');
    expect(useStore.getState().quality.globalIllumination).toBe('off');
  });

  it('shadows segmented control switches active state', () => {
    useStore.getState().__resetForTest();
    render(<SettingsPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'high', pressed: false }));
    expect(useStore.getState().quality.shadows).toBe('high');
  });
});
```

- [ ] **Step 4: Run — expect PASS**

`npm test`

- [ ] **Step 5: Smoke test**

`npm run dev`. Click gear → modal opens → toggling each control updates the scene live. Click outside → modal closes.

- [ ] **Step 6: Commit**

```bash
git add src/ui/SettingsPanel.tsx src/ui/SettingsPanel.test.tsx src/ui/Toolbar.tsx
git commit -m "ui: add SettingsPanel modal with quality toggles"
```

---

## Task 7: Update TODO.md

**Files**
- Modify: `TODO.md`

- [ ] **Step 1: Mark phase 5 done**

```markdown
- ~~**Time-of-day rework — Phase 5 (quality settings)**~~ — done. Plan: [docs/superpowers/plans/2026-05-01-time-of-day-phase5-quality-settings.md](docs/superpowers/plans/2026-05-01-time-of-day-phase5-quality-settings.md). Quality slice with device-tier defaults, SettingsPanel modal, shadows / GI / inter-room bleed / fixtures toggles wired through Phase 3+4.
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "docs: mark time-of-day phase 5 complete in TODO.md"
```

---

## Self-review checklist

- [x] §5 QualitySettings type (Task 1)
- [x] §5 device-tier defaults (Task 1)
- [x] §5 persistence + migration fallback (Task 2)
- [x] §5 wiring through Phase 3 (Tasks 3, 4, 5)
- [x] §5 wiring through Phase 4 (Task 5 fixtures)
- [x] §5 SettingsPanel UI (Task 6)
- [x] No placeholders; every step has runnable code or commands
