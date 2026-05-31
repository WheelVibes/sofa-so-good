# Time of Day — Phase 1 (Time Model) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the discrete `'day' | 'dusk' | 'night'` state with a `system | manual` time mode + fractional `manualHour`, expose four named presets (Morning/Noon/Dusk/Night) and a Custom time input via a toolbar dropdown, persist the new shape with migration from the old enum, and keep existing lighting working unchanged via a temporary hour→preset shim.

**Architecture:** Phase 1 is purely a state + UI rework. Lighting/Sky keep their existing three-preset visuals; we add a hook (`useEffectiveHour`) that resolves the current hour from `(timeMode, manualHour)`, plus a `hourToPreset(hour)` helper used by `Lighting.tsx` and `Sky.tsx` so the visual output is unchanged. Phase 2 will replace this shim with astronomy-driven lighting.

**Tech Stack:** TypeScript, React, Zustand (existing slice pattern in `src/state/slices/types.ts`), Vitest, Tailwind. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-01-time-of-day-design.md §1](../specs/2026-05-01-time-of-day-design.md) (Time model section).

---

## File structure

**Created**
- `src/state/slices/timeSlice.test.ts` — unit tests for the rewritten slice.
- `src/scene/lighting/useEffectiveHour.ts` — hook that returns the current effective hour (manual or live system).
- `src/scene/lighting/useEffectiveHour.test.ts` — hook tests using `vi.useFakeTimers`.
- `src/scene/lighting/hourToPreset.ts` — temporary shim mapping hour → `'day'|'dusk'|'night'` for Lighting/Sky during phase 1.
- `src/scene/lighting/hourToPreset.test.ts` — unit tests for the shim.

**Modified**
- `src/state/slices/timeSlice.ts` — full rewrite: `TimeMode`, `manualHour`, `setTimeMode`, `setManualHour`, `setPresetTime`, `cyclePresetTime`.
- `src/state/store.ts` — re-exports `TimeMode` instead of `TimeOfDay`.
- `src/state/store.test.ts` — assertions for new initial state and actions.
- `src/state/storage/autosave.ts` — `Persistent` type + `pickPersistent` use new fields.
- `src/state/schema.ts` — serialize `{ timeMode, manualHour }`; migrate legacy `timeOfDay`.
- `src/state/schema.test.ts` — round-trip + legacy migration tests.
- `src/state/storage/LocalStorageAdapter.test.ts` — fixture uses new shape.
- `src/scene/lighting/Lighting.tsx` — read `useEffectiveHour` + `hourToPreset` instead of `s.timeOfDay`.
- `src/scene/lighting/Sky.tsx` — same.
- `src/controls/keybindings.ts` — rename `cycleTimeOfDay` → `cyclePresetTime`.
- `src/App.tsx` — T-key handler calls `cyclePresetTime`.
- `src/ui/HelpHint.tsx` — hint copy unchanged ("Cycle time of day"), but referenced action name changes.
- `src/ui/Toolbar.tsx` — replace `SegmentedControl<TimeOfDay>` with new `TimeDropdown` component.

---

## Task 1: Rewrite `timeSlice` with new state shape (TDD)

**Files:**
- Create: `src/state/slices/timeSlice.test.ts`
- Modify: `src/state/slices/timeSlice.ts`

- [ ] **Step 1.1: Write failing tests for the new slice**

Create `src/state/slices/timeSlice.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('timeSlice', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('starts in system mode with manualHour=12', () => {
    const s = useStore.getState();
    expect(s.timeMode).toBe('system');
    expect(s.manualHour).toBe(12);
  });

  it('setTimeMode flips between system and manual', () => {
    useStore.getState().setTimeMode('manual');
    expect(useStore.getState().timeMode).toBe('manual');
    useStore.getState().setTimeMode('system');
    expect(useStore.getState().timeMode).toBe('system');
  });

  it('setManualHour switches to manual mode and stores the hour', () => {
    useStore.getState().setManualHour(15.5);
    expect(useStore.getState().timeMode).toBe('manual');
    expect(useStore.getState().manualHour).toBe(15.5);
  });

  it('setManualHour clamps out-of-range values into [0, 24)', () => {
    useStore.getState().setManualHour(25);
    expect(useStore.getState().manualHour).toBe(0);
    useStore.getState().setManualHour(-1);
    expect(useStore.getState().manualHour).toBe(23);
  });

  it('setPresetTime sets manual mode + matching hour', () => {
    const cases: Array<[string, number]> = [
      ['morning', 6],
      ['noon', 12],
      ['dusk', 18],
      ['night', 0],
    ];
    for (const [preset, hour] of cases) {
      useStore.getState().setTimeMode('system');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useStore.getState().setPresetTime(preset as any);
      expect(useStore.getState().timeMode).toBe('manual');
      expect(useStore.getState().manualHour).toBe(hour);
    }
  });

  it('cyclePresetTime advances System → Morning → Noon → Dusk → Night → System', () => {
    const expected = [
      { timeMode: 'manual', manualHour: 6 },
      { timeMode: 'manual', manualHour: 12 },
      { timeMode: 'manual', manualHour: 18 },
      { timeMode: 'manual', manualHour: 0 },
      { timeMode: 'system', manualHour: 0 },
    ];
    expect(useStore.getState().timeMode).toBe('system');
    for (const e of expected) {
      useStore.getState().cyclePresetTime();
      const s = useStore.getState();
      expect(s.timeMode).toBe(e.timeMode);
      expect(s.manualHour).toBe(e.manualHour);
    }
  });

  it('cyclePresetTime starting from manual at non-preset hour goes to morning', () => {
    useStore.getState().setManualHour(9.5);
    useStore.getState().cyclePresetTime();
    expect(useStore.getState().timeMode).toBe('manual');
    expect(useStore.getState().manualHour).toBe(6);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx vitest run src/state/slices/timeSlice.test.ts`
Expected: FAIL with "Property 'timeMode' does not exist" or similar TypeScript / runtime errors.

- [ ] **Step 1.3: Rewrite `timeSlice.ts`**

Replace contents of `src/state/slices/timeSlice.ts` with:

```ts
import type { SliceCreator } from './types';
import type { RootState } from '../store';

export type TimeMode = 'system' | 'manual';

export type TimePreset = 'morning' | 'noon' | 'dusk' | 'night';

export const PRESET_HOURS: Record<TimePreset, number> = {
  morning: 6,
  noon: 12,
  dusk: 18,
  night: 0,
};

/** Cycle order for the T-key shortcut. After 'night' we wrap back to 'system'. */
const CYCLE_ORDER: ReadonlyArray<TimePreset | 'system'> = [
  'system',
  'morning',
  'noon',
  'dusk',
  'night',
];

export interface TimeSlice {
  timeMode: TimeMode;
  /** Fractional hour in [0, 24). Ignored when timeMode === 'system'. */
  manualHour: number;
  setTimeMode: (m: TimeMode) => void;
  setManualHour: (h: number) => void;
  setPresetTime: (preset: TimePreset) => void;
  cyclePresetTime: () => void;
}

export const TIME_INITIAL: Pick<TimeSlice, 'timeMode' | 'manualHour'> = {
  timeMode: 'system',
  manualHour: 12,
};

/** Wrap any real number into [0, 24). Negative inputs wrap as expected
 *  (e.g. -1 → 23). Inputs ≥ 24 wrap to [0, 24). */
function wrapHour(h: number): number {
  const m = h % 24;
  return m < 0 ? m + 24 : m;
}

/** Identify which preset (if any) the current state matches, for cycling. */
function currentPresetIndex(s: TimeSlice): number {
  if (s.timeMode === 'system') return 0;
  for (let i = 1; i < CYCLE_ORDER.length; i++) {
    const preset = CYCLE_ORDER[i] as TimePreset;
    if (s.manualHour === PRESET_HOURS[preset]) return i;
  }
  // Manual but at a non-preset hour: treat as "before morning" so cycle
  // advances to morning next.
  return 0;
}

export const createTimeSlice: SliceCreator<TimeSlice, RootState> = (set, get) => ({
  ...TIME_INITIAL,
  setTimeMode: (m) => set({ timeMode: m }),
  setManualHour: (h) => set({ timeMode: 'manual', manualHour: wrapHour(h) }),
  setPresetTime: (preset) =>
    set({ timeMode: 'manual', manualHour: PRESET_HOURS[preset] }),
  cyclePresetTime: () => {
    const idx = currentPresetIndex(get());
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
    if (next === 'system') {
      set({ timeMode: 'system' });
    } else {
      set({ timeMode: 'manual', manualHour: PRESET_HOURS[next] });
    }
  },
});
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run src/state/slices/timeSlice.test.ts`
Expected: 7 tests passing.

- [ ] **Step 1.5: Commit**

```bash
git add src/state/slices/timeSlice.ts src/state/slices/timeSlice.test.ts
git commit -m "$(cat <<'EOF'
time: replace day/dusk/night enum with timeMode + manualHour

Rewrites timeSlice to support 'system' (live wall clock) and 'manual'
modes with a fractional manualHour. setPresetTime jumps to morning/
noon/dusk/night; cyclePresetTime walks System → Morning → Noon →
Dusk → Night → System for the T-key shortcut.

This commit only updates the slice and its tests; downstream callers
(store.ts re-exports, lighting, schema, toolbar) are updated in
follow-on commits and will be temporarily broken until then.
EOF
)"
```

---

## Task 2: Update store re-exports, fix `store.test.ts`, autosave

**Files:**
- Modify: `src/state/store.ts`
- Modify: `src/state/store.test.ts`
- Modify: `src/state/storage/autosave.ts`

- [ ] **Step 2.1: Update `store.ts` re-export**

In `src/state/store.ts`, find the line:

```ts
export type { TimeOfDay } from './slices/timeSlice';
```

Replace it with:

```ts
export type { TimeMode, TimePreset } from './slices/timeSlice';
export { PRESET_HOURS } from './slices/timeSlice';
```

- [ ] **Step 2.2: Update `store.test.ts` assertions**

In `src/state/store.test.ts`, find the test block:

```ts
  it('starts in orbit camera mode at day with measurements off', () => {
    const s = useStore.getState();
    expect(s.cameraMode).toBe('orbit');
    expect(s.timeOfDay).toBe('day');
    expect(s.showMeasurements).toBe(false);
  });
```

Replace with:

```ts
  it('starts in orbit camera mode in system time mode with measurements off', () => {
    const s = useStore.getState();
    expect(s.cameraMode).toBe('orbit');
    expect(s.timeMode).toBe('system');
    expect(s.manualHour).toBe(12);
    expect(s.showMeasurements).toBe(false);
  });
```

And find the test:

```ts
  it('cycles time of day', () => {
    useStore.getState().setTimeOfDay('dusk');
    expect(useStore.getState().timeOfDay).toBe('dusk');
  });
```

Replace with:

```ts
  it('sets a manual hour via setPresetTime', () => {
    useStore.getState().setPresetTime('dusk');
    expect(useStore.getState().timeMode).toBe('manual');
    expect(useStore.getState().manualHour).toBe(18);
  });
```

- [ ] **Step 2.3: Update `autosave.ts` to track new fields**

In `src/state/storage/autosave.ts`, replace the `Persistent` type and `pickPersistent`/`shallowEqual` to track `timeMode` and `manualHour` instead of `timeOfDay`:

```ts
type Persistent = {
  items: unknown;
  doors: unknown;
  finishes: unknown;
  userFurniture: unknown;
  userMaterials: unknown;
  timeMode: unknown;
  manualHour: unknown;
  cameraMode: unknown;
};

function pickPersistent(): Persistent {
  const s = useStore.getState();
  return {
    items: s.items,
    doors: s.doors,
    finishes: s.finishes,
    userFurniture: s.userFurniture,
    userMaterials: s.userMaterials,
    timeMode: s.timeMode,
    manualHour: s.manualHour,
    cameraMode: s.cameraMode,
  };
}

function shallowEqual(a: Persistent, b: Persistent): boolean {
  return (
    a.items === b.items &&
    a.doors === b.doors &&
    a.finishes === b.finishes &&
    a.userFurniture === b.userFurniture &&
    a.userMaterials === b.userMaterials &&
    a.timeMode === b.timeMode &&
    a.manualHour === b.manualHour &&
    a.cameraMode === b.cameraMode
  );
}
```

- [ ] **Step 2.4: Run store + slice tests**

Run: `npx vitest run src/state/`
Expected: All `timeSlice` and `store` tests pass. `schema.test.ts` and `LocalStorageAdapter.test.ts` will still fail — those are fixed in later tasks. Note any other failing test files; if any failure is *not* in `schema.test.ts` or `LocalStorageAdapter.test.ts`, stop and investigate before proceeding.

- [ ] **Step 2.5: Commit**

```bash
git add src/state/store.ts src/state/store.test.ts src/state/storage/autosave.ts
git commit -m "$(cat <<'EOF'
time: update store re-exports + autosave for new time fields

Re-exports TimeMode/TimePreset from store.ts and updates the autosave
persistent-fields tracker to compare timeMode + manualHour instead of
timeOfDay. store.test.ts assertions updated.

schema.ts and LocalStorageAdapter fixtures still reference the old
shape and are fixed in the next commits.
EOF
)"
```

---

## Task 3: Add `useEffectiveHour` hook (TDD)

**Files:**
- Create: `src/scene/lighting/useEffectiveHour.ts`
- Create: `src/scene/lighting/useEffectiveHour.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `src/scene/lighting/useEffectiveHour.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEffectiveHour, hoursFromDate } from './useEffectiveHour';
import { useStore } from '../../state/store';

describe('hoursFromDate', () => {
  it('returns fractional hours including minutes and seconds', () => {
    const d = new Date('2026-05-01T03:30:36');
    // 3 + 30/60 + 36/3600 = 3 + 0.5 + 0.01 = 3.51
    expect(hoursFromDate(d)).toBeCloseTo(3.51, 2);
  });
});

describe('useEffectiveHour', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns manualHour when in manual mode', () => {
    useStore.getState().setManualHour(7.25);
    const { result } = renderHook(() => useEffectiveHour());
    expect(result.current).toBe(7.25);
  });

  it('updates when manualHour changes', () => {
    useStore.getState().setManualHour(8);
    const { result } = renderHook(() => useEffectiveHour());
    expect(result.current).toBe(8);
    act(() => useStore.getState().setManualHour(9));
    expect(result.current).toBe(9);
  });

  it('returns the system clock hour when in system mode', () => {
    vi.setSystemTime(new Date('2026-05-01T14:30:00'));
    const { result } = renderHook(() => useEffectiveHour());
    expect(result.current).toBeCloseTo(14.5, 2);
  });

  it('refreshes the system hour roughly every 60 seconds', () => {
    vi.setSystemTime(new Date('2026-05-01T14:00:00'));
    const { result } = renderHook(() => useEffectiveHour());
    expect(result.current).toBeCloseTo(14.0, 2);

    act(() => {
      vi.setSystemTime(new Date('2026-05-01T14:01:00'));
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBeCloseTo(14 + 1 / 60, 2);
  });

  it('switching from system to manual stops the interval', () => {
    vi.setSystemTime(new Date('2026-05-01T10:00:00'));
    const { result } = renderHook(() => useEffectiveHour());
    expect(result.current).toBeCloseTo(10, 2);
    act(() => useStore.getState().setManualHour(20));
    expect(result.current).toBe(20);
    // Advancing wall clock should not change result.
    act(() => {
      vi.setSystemTime(new Date('2026-05-01T11:30:00'));
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current).toBe(20);
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npx vitest run src/scene/lighting/useEffectiveHour.test.ts`
Expected: FAIL with "Cannot find module './useEffectiveHour'".

- [ ] **Step 3.3: Implement the hook**

Create `src/scene/lighting/useEffectiveHour.ts`:

```ts
import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';

/** Fractional hour-of-day for a Date. */
export function hoursFromDate(d: Date): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Returns the current "effective" hour ∈ [0, 24).
 *
 *  - `manual` mode: returns `manualHour` directly.
 *  - `system` mode: reads `new Date()` on mount and re-reads every 60 s,
 *    triggering a re-render. Sub-minute accuracy is unnecessary because
 *    the lighting tween smooths visible jumps. */
export function useEffectiveHour(): number {
  const timeMode = useStore((s) => s.timeMode);
  const manualHour = useStore((s) => s.manualHour);
  const [systemHour, setSystemHour] = useState(() => hoursFromDate(new Date()));

  useEffect(() => {
    if (timeMode !== 'system') return;
    setSystemHour(hoursFromDate(new Date()));
    const id = setInterval(() => {
      setSystemHour(hoursFromDate(new Date()));
    }, 60_000);
    return () => clearInterval(id);
  }, [timeMode]);

  return timeMode === 'system' ? systemHour : manualHour;
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx vitest run src/scene/lighting/useEffectiveHour.test.ts`
Expected: 6 tests passing.

If `@testing-library/react` is not installed (check `package.json`), install it first: `npm i -D @testing-library/react`. Verify with `grep '@testing-library/react' package.json` — if present, skip the install.

- [ ] **Step 3.5: Commit**

```bash
git add src/scene/lighting/useEffectiveHour.ts src/scene/lighting/useEffectiveHour.test.ts
# If @testing-library/react was added:
# git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
time: add useEffectiveHour hook

Returns the active hour-of-day from the timeSlice — directly from
manualHour in manual mode, or from new Date() refreshed every 60s in
system mode. The 60s cadence is intentional: sub-minute precision is
unnecessary because Lighting.tsx already tweens toward its target
over ~0.6s.
EOF
)"
```

---

## Task 4: Add `hourToPreset` shim and switch Lighting/Sky to consume effective hour

**Files:**
- Create: `src/scene/lighting/hourToPreset.ts`
- Create: `src/scene/lighting/hourToPreset.test.ts`
- Modify: `src/scene/lighting/Lighting.tsx`
- Modify: `src/scene/lighting/Sky.tsx`

- [ ] **Step 4.1: Write the failing shim test**

Create `src/scene/lighting/hourToPreset.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hourToPreset } from './hourToPreset';

describe('hourToPreset', () => {
  it('maps mid-day hours to "day"', () => {
    expect(hourToPreset(6)).toBe('day');
    expect(hourToPreset(12)).toBe('day');
    expect(hourToPreset(16.99)).toBe('day');
  });

  it('maps the late-afternoon window to "dusk"', () => {
    expect(hourToPreset(17)).toBe('dusk');
    expect(hourToPreset(18)).toBe('dusk');
    expect(hourToPreset(18.99)).toBe('dusk');
  });

  it('maps night hours to "night"', () => {
    expect(hourToPreset(0)).toBe('night');
    expect(hourToPreset(3)).toBe('night');
    expect(hourToPreset(19)).toBe('night');
    expect(hourToPreset(23.5)).toBe('night');
  });

  it('treats hours just below 6 as night and 6 as day', () => {
    expect(hourToPreset(5.99)).toBe('night');
    expect(hourToPreset(6)).toBe('day');
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `npx vitest run src/scene/lighting/hourToPreset.test.ts`
Expected: FAIL with "Cannot find module './hourToPreset'".

- [ ] **Step 4.3: Implement the shim**

Create `src/scene/lighting/hourToPreset.ts`:

```ts
/** Phase-1 shim: maps a fractional hour to one of the existing
 *  Lighting/Sky preset keys ('day' | 'dusk' | 'night'). Phase 2
 *  replaces this with altitude-driven, astronomy-derived values. */
export type LegacyTimeKey = 'day' | 'dusk' | 'night';

export function hourToPreset(hour: number): LegacyTimeKey {
  // Wrap defensively in case a caller passes 24+.
  const h = ((hour % 24) + 24) % 24;
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}
```

- [ ] **Step 4.4: Run shim tests to verify they pass**

Run: `npx vitest run src/scene/lighting/hourToPreset.test.ts`
Expected: 4 tests passing.

- [ ] **Step 4.5: Update `Lighting.tsx` to read effective hour**

In `src/scene/lighting/Lighting.tsx`, replace the imports and the `useStore` call.

Find:

```ts
import { useStore, type TimeOfDay } from '../../state/store';
```

Replace with:

```ts
import { useEffectiveHour } from './useEffectiveHour';
import { hourToPreset, type LegacyTimeKey } from './hourToPreset';
```

Find:

```ts
const PRESETS: Record<TimeOfDay, Vals> = {
```

Replace with:

```ts
const PRESETS: Record<LegacyTimeKey, Vals> = {
```

Find:

```ts
  const time = useStore((s) => s.timeOfDay);
```

Replace with:

```ts
  const time = hourToPreset(useEffectiveHour());
```

- [ ] **Step 4.6: Update `Sky.tsx` to read effective hour**

In `src/scene/lighting/Sky.tsx`, find:

```ts
import { useStore } from '../../state/store';
```

Replace with:

```ts
import { useEffectiveHour } from './useEffectiveHour';
import { hourToPreset } from './hourToPreset';
```

Find:

```ts
  const time = useStore((s) => s.timeOfDay);
```

Replace with:

```ts
  const time = hourToPreset(useEffectiveHour());
```

- [ ] **Step 4.7: Run all lighting + state tests**

Run: `npx vitest run src/scene/lighting/ src/state/slices/timeSlice.test.ts`
Expected: all pass.

- [ ] **Step 4.8: Commit**

```bash
git add src/scene/lighting/hourToPreset.ts src/scene/lighting/hourToPreset.test.ts src/scene/lighting/Lighting.tsx src/scene/lighting/Sky.tsx
git commit -m "$(cat <<'EOF'
time: drive Lighting and Sky from useEffectiveHour via hour→preset shim

Lighting.tsx and Sky.tsx no longer subscribe to timeOfDay directly;
they read the current fractional hour via useEffectiveHour and
collapse it to one of the existing 'day'/'dusk'/'night' preset keys
through hourToPreset.

The shim is a phase-1 expedient. Phase 2 replaces it with an
altitude-driven curve from real astronomy and removes hourToPreset
entirely.
EOF
)"
```

---

## Task 5: Update keybindings, App.tsx T-key handler, HelpHint copy

**Files:**
- Modify: `src/controls/keybindings.ts`
- Modify: `src/App.tsx`
- Modify: `src/ui/HelpHint.tsx`

- [ ] **Step 5.1: Rename the keybinding id**

In `src/controls/keybindings.ts`, find:

```ts
  toggleCameraMode: 'KeyV',
  cycleTimeOfDay: 'KeyT',
```

Replace with:

```ts
  toggleCameraMode: 'KeyV',
  cyclePresetTime: 'KeyT',
```

- [ ] **Step 5.2: Update App.tsx T-key handler**

In `src/App.tsx`, find:

```ts
      if (!mod && code === KEYBINDINGS.cycleTimeOfDay) {
        useStore.getState().cycleTimeOfDay();
      }
```

Replace with:

```ts
      if (!mod && code === KEYBINDINGS.cyclePresetTime) {
        useStore.getState().cyclePresetTime();
      }
```

- [ ] **Step 5.3: HelpHint copy is unchanged**

`src/ui/HelpHint.tsx` shows `{ keys: 'T', desc: 'Cycle time of day' }`. The user-visible copy stays correct. No changes required in this file. Verify by running `grep "Cycle time of day" src/ui/HelpHint.tsx` — expect one match.

- [ ] **Step 5.4: Run a typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors. If `tsc` reports errors in `schema.ts`, `LocalStorageAdapter.test.ts`, `Toolbar.tsx`, or `schema.test.ts`, those are expected and fixed in tasks 6 and 7. Investigate any *other* errors before proceeding.

- [ ] **Step 5.5: Commit**

```bash
git add src/controls/keybindings.ts src/App.tsx
git commit -m "$(cat <<'EOF'
time: rename T-key action cycleTimeOfDay → cyclePresetTime

Keeps the T binding ('Cycle time of day' in the help overlay) wired
to the new slice action. HelpHint copy unchanged.
EOF
)"
```

---

## Task 6: Update schema serialization with migration from legacy `timeOfDay`

**Files:**
- Modify: `src/state/schema.ts`
- Modify: `src/state/schema.test.ts`
- Modify: `src/state/storage/LocalStorageAdapter.test.ts`

- [ ] **Step 6.1: Add a failing schema-migration test**

In `src/state/schema.test.ts`, **append** the following tests inside the existing `describe('schema', ...)` block:

```ts
  it('round-trips timeMode + manualHour for system mode', () => {
    useStore.getState().__resetForTest();
    // default is system / 12
    const out = serialize(useStore.getState());
    const parsed = SerializedStateZ.safeParse(out);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.timeMode).toBe('system');
      expect(parsed.data.manualHour).toBe(12);
    }
  });

  it('round-trips timeMode + manualHour for manual mode', () => {
    useStore.getState().__resetForTest();
    useStore.getState().setManualHour(15.5);
    const out = serialize(useStore.getState());
    const parsed = SerializedStateZ.safeParse(out);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.timeMode).toBe('manual');
      expect(parsed.data.manualHour).toBe(15.5);
    }
  });

  it('migrates legacy timeOfDay="day" to manual hour 12', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeOfDay: 'day',
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    };
    const parsed = SerializedStateZ.parse(legacy);
    expect(parsed.timeMode).toBe('manual');
    expect(parsed.manualHour).toBe(12);
  });

  it('migrates legacy timeOfDay="dusk" to manual hour 18', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeOfDay: 'dusk',
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    };
    const parsed = SerializedStateZ.parse(legacy);
    expect(parsed.timeMode).toBe('manual');
    expect(parsed.manualHour).toBe(18);
  });

  it('migrates legacy timeOfDay="night" to manual hour 0', () => {
    const legacy = {
      version: 1,
      apartmentId: 'serangoon-north-vista-4r',
      items: [],
      doors: {},
      finishes: { floor: {}, walls: {} },
      userFurniture: [],
      userMaterials: [],
      timeOfDay: 'night',
      cameraMode: 'orbit',
      savedAt: '2026-04-01T00:00:00.000Z',
    };
    const parsed = SerializedStateZ.parse(legacy);
    expect(parsed.timeMode).toBe('manual');
    expect(parsed.manualHour).toBe(0);
  });

  it('applySerialized writes timeMode + manualHour back into the store patch', () => {
    useStore.getState().__resetForTest();
    useStore.getState().setManualHour(7.5);
    const out = serialize(useStore.getState());
    const patch = applySerialized(out, new Set());
    expect(patch.timeMode).toBe('manual');
    expect(patch.manualHour).toBe(7.5);
  });
```

Also remove or update the existing `setTimeOfDay('dusk')` round-trip test at the top of the file. Replace:

```ts
  it('serialize → parse round-trip preserves the persistent fields', () => {
    useStore.getState().__resetForTest();
    useStore.getState().resetToDefault();
    useStore.getState().setTimeOfDay('dusk');
    const out = serialize(useStore.getState());
    const round = SerializedStateZ.safeParse(out);
    expect(round.success).toBe(true);
    if (round.success) {
      expect(round.data.timeOfDay).toBe('dusk');
      expect(round.data.items.length).toBeGreaterThan(0);
    }
  });
```

With:

```ts
  it('serialize → parse round-trip preserves the persistent fields', () => {
    useStore.getState().__resetForTest();
    useStore.getState().resetToDefault();
    useStore.getState().setPresetTime('dusk');
    const out = serialize(useStore.getState());
    const round = SerializedStateZ.safeParse(out);
    expect(round.success).toBe(true);
    if (round.success) {
      expect(round.data.timeMode).toBe('manual');
      expect(round.data.manualHour).toBe(18);
      expect(round.data.items.length).toBeGreaterThan(0);
    }
  });
```

- [ ] **Step 6.2: Run schema tests to verify they fail**

Run: `npx vitest run src/state/schema.test.ts`
Expected: FAIL — old `timeOfDay` field is required, `timeMode`/`manualHour` don't exist on the schema.

- [ ] **Step 6.3: Update `schema.ts` with the new fields and a Zod-level migration**

In `src/state/schema.ts`, find the `SerializedStateZ` definition and replace the `timeOfDay` line. Find:

```ts
  timeOfDay: z.enum(['day', 'dusk', 'night']),
  cameraMode: z.enum(['orbit', 'firstPerson']),
```

Replace with:

```ts
  /** New shape (phase 1+). Both fields are optional in the input so legacy
   *  payloads that only carry `timeOfDay` still parse; the preprocess step
   *  fills these in by migrating the legacy field. */
  timeMode: z.enum(['system', 'manual']),
  manualHour: z.number().min(0).max(24),
  cameraMode: z.enum(['orbit', 'firstPerson']),
```

Now wrap the schema with a `z.preprocess` that performs the legacy migration. Find the line that exports the schema (search for `export const SerializedStateZ`); replace its definition by introducing a raw schema and a migrating wrapper. The full structure becomes:

```ts
const RawSerializedStateZ = z.object({
  version: z.literal(1),
  apartmentId: z.string(),
  items: z.array(FurnitureItemZ),
  doors: z.record(z.string(), z.boolean()),
  finishes: z.object({
    floor: z.record(z.string(), z.string()),
    walls: z.record(z.string(), z.string()),
  }),
  userFurniture: z.array(UserGltfDefZ),
  userMaterials: z.array(UserMaterialDefZ),
  timeMode: z.enum(['system', 'manual']),
  manualHour: z.number().min(0).max(24),
  cameraMode: z.enum(['orbit', 'firstPerson']),
  orientationDeg: z.number().optional(),
  savedAt: z.string(),
});

const LEGACY_TIME_HOUR: Record<string, number> = {
  day: 12,
  dusk: 18,
  night: 0,
};

/** Accepts both new (`timeMode`/`manualHour`) and legacy (`timeOfDay`)
 *  payload shapes. Legacy values map: day→12, dusk→18, night→0, all
 *  in manual mode. */
export const SerializedStateZ = z.preprocess((input) => {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (!('timeMode' in obj) && typeof obj.timeOfDay === 'string') {
      const hour = LEGACY_TIME_HOUR[obj.timeOfDay];
      if (typeof hour === 'number') {
        const { timeOfDay: _legacy, ...rest } = obj;
        void _legacy;
        return { ...rest, timeMode: 'manual', manualHour: hour };
      }
    }
  }
  return input;
}, RawSerializedStateZ);
```

Make sure the existing `SerializedStateZ = z.object({...})` at the top is **removed** (replaced by `RawSerializedStateZ` + the wrapper).

- [ ] **Step 6.4: Update `serialize` and `applySerialized` to use the new fields**

In `src/state/schema.ts`, find:

```ts
    timeOfDay: state.timeOfDay,
    cameraMode: state.cameraMode,
    orientationDeg: state.orientationDeg,
    savedAt: new Date().toISOString(),
  };
}
```

(in the `serialize` function) and replace `timeOfDay: state.timeOfDay,` with:

```ts
    timeMode: state.timeMode,
    manualHour: state.manualHour,
```

So the block reads:

```ts
    timeMode: state.timeMode,
    manualHour: state.manualHour,
    cameraMode: state.cameraMode,
    orientationDeg: state.orientationDeg,
    savedAt: new Date().toISOString(),
  };
}
```

Then in `applySerialized`, find:

```ts
    timeOfDay: state.timeOfDay,
    cameraMode: state.cameraMode,
    orientationDeg: state.orientationDeg ?? 0,
  };
```

Replace with:

```ts
    timeMode: state.timeMode,
    manualHour: state.manualHour,
    cameraMode: state.cameraMode,
    orientationDeg: state.orientationDeg ?? 0,
  };
```

- [ ] **Step 6.5: Update `LocalStorageAdapter.test.ts` fixture**

In `src/state/storage/LocalStorageAdapter.test.ts`, find:

```ts
function fakeState(savedAt: string): SerializedState {
  return {
    version: 1,
    apartmentId: 'serangoon-north-vista-4r',
    items: [],
    doors: {},
    finishes: { floor: {}, walls: {} },
    userFurniture: [],
    userMaterials: [],
    timeOfDay: 'day',
    cameraMode: 'orbit',
    savedAt,
  };
}
```

Replace with:

```ts
function fakeState(savedAt: string): SerializedState {
  return {
    version: 1,
    apartmentId: 'serangoon-north-vista-4r',
    items: [],
    doors: {},
    finishes: { floor: {}, walls: {} },
    userFurniture: [],
    userMaterials: [],
    timeMode: 'system',
    manualHour: 12,
    cameraMode: 'orbit',
    savedAt,
  };
}
```

- [ ] **Step 6.6: Run all state tests**

Run: `npx vitest run src/state/`
Expected: all pass — `timeSlice`, `store`, `schema` (including new round-trip + migration tests), `LocalStorageAdapter`.

- [ ] **Step 6.7: Commit**

```bash
git add src/state/schema.ts src/state/schema.test.ts src/state/storage/LocalStorageAdapter.test.ts
git commit -m "$(cat <<'EOF'
time: serialize timeMode + manualHour with migration from legacy timeOfDay

Replaces the timeOfDay enum field on SerializedState with timeMode +
manualHour. A z.preprocess wrapper detects legacy payloads that only
carry timeOfDay and rewrites them: day→12, dusk→18, night→0 (all in
manual mode), so existing saves load without user intervention.

LocalStorageAdapter test fixture updated to the new shape.
EOF
)"
```

---

## Task 7: Replace toolbar segmented control with the time dropdown

**Files:**
- Modify: `src/ui/Toolbar.tsx`

- [ ] **Step 7.1: Add the `TimeDropdown` component**

Open `src/ui/Toolbar.tsx`. Replace the existing imports block (top of file) with:

```ts
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useStore, type CameraMode, PRESET_HOURS, type TimePreset } from '../state/store';
import { useEffectiveHour } from '../scene/lighting/useEffectiveHour';
import type { EditorTool } from '../state/slices/uiSlice';
import { LocalStorageAdapter } from '../state/storage/LocalStorageAdapter';
import { serialize, applySerialized } from '../state/schema';
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog';
import type { SlotMeta } from '../state/storage/StorageAdapter';
import { CreditsModal } from './CreditsModal';
```

Then **delete** the line:

```ts
const TIMES: TimeOfDay[] = ['day', 'dusk', 'night'];
```

Find the time-of-day section in the toolbar render:

```tsx
      <SegmentedControl<TimeOfDay>
        label="Time"
        value={timeOfDay}
        options={TIMES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
        onChange={setTimeOfDay}
      />
```

Replace with:

```tsx
      <TimeDropdown />
```

And remove the corresponding store hooks at the top of the `Toolbar` function:

```ts
  const timeOfDay = useStore((s) => s.timeOfDay);
  const setTimeOfDay = useStore((s) => s.setTimeOfDay);
```

(These two lines are deleted — `TimeDropdown` reads/writes the time slice itself.)

Now add the `TimeDropdown` component. Place it directly above the `function Divider()` declaration near the bottom of the file:

```tsx
function TimeDropdown() {
  const timeMode = useStore((s) => s.timeMode);
  const manualHour = useStore((s) => s.manualHour);
  const setTimeMode = useStore((s) => s.setTimeMode);
  const setPresetTime = useStore((s) => s.setPresetTime);
  const setManualHour = useStore((s) => s.setManualHour);
  const effectiveHour = useEffectiveHour();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const matchedPreset = matchPreset(timeMode, manualHour);
  const label = closedLabel(timeMode, manualHour, effectiveHour, matchedPreset);
  const inputValue = formatTimeInput(effectiveHour);

  const onSelectPreset = (p: TimePreset) => {
    setPresetTime(p);
    setOpen(false);
  };
  const onSelectSystem = () => {
    setTimeMode('system');
    setOpen(false);
  };
  const onCustomChange = (e: ChangeEvent<HTMLInputElement>) => {
    const [hh, mm] = e.target.value.split(':').map((n) => Number.parseInt(n, 10));
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      setManualHour(hh + mm / 60);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
      >
        Time: {label}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg bg-white p-1 text-xs shadow">
          <DropdownRow
            checked={timeMode === 'system'}
            label="System"
            detail={formatClock(effectiveHour)}
            onClick={onSelectSystem}
          />
          <Separator />
          {(['morning', 'noon', 'dusk', 'night'] as const).map((p) => (
            <DropdownRow
              key={p}
              checked={timeMode === 'manual' && manualHour === PRESET_HOURS[p]}
              label={p[0].toUpperCase() + p.slice(1)}
              detail={formatClock(PRESET_HOURS[p])}
              onClick={() => onSelectPreset(p)}
            />
          ))}
          <Separator />
          <div
            className={`flex items-center gap-2 rounded px-2 py-1.5 ${
              timeMode === 'manual' && matchedPreset === null
                ? 'bg-neutral-100'
                : ''
            }`}
          >
            <span className="w-3 text-neutral-500">
              {timeMode === 'manual' && matchedPreset === null ? '●' : ''}
            </span>
            <span className="flex-1">Custom</span>
            <input
              type="time"
              value={inputValue}
              onChange={onCustomChange}
              className="rounded border border-neutral-200 bg-white px-1 py-0.5 text-xs"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DropdownRow({
  checked,
  label,
  detail,
  onClick,
}: {
  checked: boolean;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-neutral-100 ${
        checked ? 'bg-neutral-100' : ''
      }`}
    >
      <span className="w-3 text-neutral-500">{checked ? '●' : ''}</span>
      <span className="flex-1">{label}</span>
      <span className="text-neutral-500">{detail}</span>
    </button>
  );
}

function Separator() {
  return <div className="my-1 h-px bg-neutral-100" />;
}

function matchPreset(
  mode: 'system' | 'manual',
  hour: number,
): TimePreset | null {
  if (mode !== 'manual') return null;
  for (const p of ['morning', 'noon', 'dusk', 'night'] as const) {
    if (PRESET_HOURS[p] === hour) return p;
  }
  return null;
}

function closedLabel(
  mode: 'system' | 'manual',
  manualHour: number,
  effectiveHour: number,
  matched: TimePreset | null,
): string {
  if (mode === 'system') return `System (${formatClock(effectiveHour)})`;
  if (matched) return matched[0].toUpperCase() + matched.slice(1);
  return `Custom (${formatClock(manualHour)})`;
}

function formatClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const totalMinutes = Math.round(h * 60) % (24 * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  const period = hh < 12 ? 'AM' : 'PM';
  const display = hh % 12 === 0 ? 12 : hh % 12;
  return `${display}:${String(mm).padStart(2, '0')} ${period}`;
}

function formatTimeInput(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const totalMinutes = Math.round(h * 60) % (24 * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
```

- [ ] **Step 7.2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors. The `TimeOfDay` type is no longer imported anywhere.

- [ ] **Step 7.3: Smoke-test in dev**

Run: `npm run dev`
Open the URL it prints. Verify:

1. Toolbar shows `Time: System (HH:MM AM/PM)` reflecting the wall clock.
2. Click the button → dropdown opens with five rows + Custom.
3. Click `Morning` → label becomes `Morning`, lighting tweens to the existing "day" preset (because `06:00` maps to `'day'` via the shim).
4. Click `Dusk` → label becomes `Dusk`, lighting becomes warm-orange (existing dusk preset).
5. Click `Night` → label becomes `Night`, lighting goes dark blue.
6. Use Custom input to type `10:30` → label becomes `Custom (10:30 AM)`, lighting matches the day preset.
7. Click `System` → label returns to live system time.
8. Press `T` → cycles System → Morning → Noon → Dusk → Night → System, label updates each time.
9. Reload the page → autosave restores the last selection (re-check the label after reload).

If any check fails, halt and investigate. **Stop the dev server** before proceeding.

- [ ] **Step 7.4: Commit**

```bash
git add src/ui/Toolbar.tsx
git commit -m "$(cat <<'EOF'
time: replace toolbar segmented control with TimeDropdown

Adds a small dropdown that exposes System (live clock), four named
presets (Morning/Noon/Dusk/Night), and a Custom <input type="time">
row. Closed-button label reflects the current state with a formatted
clock when relevant. Outside-click closes the menu (existing pattern
from LoadButton).
EOF
)"
```

---

## Task 8: Final verification

**Files:** none modified.

- [ ] **Step 8.1: Run the full test suite**

Run: `npx vitest run`
Expected: all passing. Any failures must be fixed before merging.

- [ ] **Step 8.2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint 2>/dev/null || echo "no lint script"`
Expected: 0 type errors. Lint may be optional depending on the script.

- [ ] **Step 8.3: Confirm no orphaned references to the legacy API**

Run: `grep -rn "timeOfDay\|TimeOfDay\|cycleTimeOfDay\|setTimeOfDay" src/ scripts/ docs/superpowers/plans/ 2>/dev/null`
Expected: only matches that are inside string literals, code-block fences in spec markdown, the legacy migration comment, or this plan file. No live TS code references the old names.

- [ ] **Step 8.4: Update TODO.md**

Edit `TODO.md`. Find the "Time of Day" section and the time-of-day rework bullet. Mark phase 1 done by prefixing with `~~`:

```md
- ~~**Time-of-day rework — Phase 1 (time model)**~~ — done. Plan: [docs/superpowers/plans/2026-05-01-time-of-day-phase1-time-model.md](docs/superpowers/plans/2026-05-01-time-of-day-phase1-time-model.md). The remaining four phases (astronomy + geocoding, realistic indoor lighting, light fixtures, quality settings) are still pending.
```

Keep the existing single-line summary of the full five-phase scope above it, but adjust to indicate phase 1 is complete.

- [ ] **Step 8.5: Final commit**

```bash
git add TODO.md
git commit -m "$(cat <<'EOF'
docs: mark time-of-day phase 1 complete in TODO.md

Phase 1 (time model: timeMode + manualHour, dropdown UI, schema
migration) is implemented. Phases 2–5 (astronomy, indoor lighting,
fixtures, quality settings) still pending — separate plans to come.
EOF
)"
```

---

## Spec coverage check

| Spec §1 requirement                                  | Task |
|------------------------------------------------------|------|
| `timeMode: 'system' \| 'manual'` state               | 1    |
| `manualHour ∈ [0, 24)`                               | 1    |
| `setTimeMode`, `setManualHour`, `setPresetTime`, `cyclePresetTime` | 1 |
| `useEffectiveHour` hook with 60s system-mode refresh | 3    |
| Toolbar dropdown with closed label                   | 7    |
| Five rows: System / Morning / Noon / Dusk / Night    | 7    |
| Custom row with `<input type="time">`                | 7    |
| Outside-click closes dropdown                        | 7    |
| `T` key cycles System → Morning → ... → System       | 1, 5 |
| HelpHint copy "Cycle time of day"                    | 5 (verified, no change) |
| Schema serializes `{ timeMode, manualHour }`         | 6    |
| Migration: day→12 / dusk→18 / night→0                | 6    |
| Lighting + Sky read from effective hour              | 4    |

No spec §1 requirement is unimplemented.
