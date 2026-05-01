# Time of Day — System Time + Custom Time

Brainstormed 2026-05-01.

## Goal

Replace the current three-preset toolbar control (`day` / `dusk` / `night`) with a richer time-of-day model that:

1. Tracks the user's system clock by default ("System" mode).
2. Offers four named presets — **Morning (06:00)**, **Noon (12:00)**, **Dusk (18:00)**, **Night (00:00)** — that freeze the scene at that hour.
3. Supports an arbitrary user-set time via a time-picker ("Custom").

The scene does not auto-advance on its own. System mode is the only mode that follows the wall clock; presets and custom times are static until the user changes them.

## State model

`src/state/slices/timeSlice.ts` is rewritten:

```ts
export type TimeMode = 'system' | 'manual';

export interface TimeSlice {
  timeMode: TimeMode;
  manualHour: number; // 0–24, fractional. Ignored when timeMode === 'system'.
  setTimeMode: (m: TimeMode) => void;
  setManualHour: (h: number) => void;
  setPresetTime: (preset: 'morning' | 'noon' | 'dusk' | 'night') => void; // sets manual + corresponding hour
  cyclePresetTime: () => void; // T-key cycle: System → Morning → Noon → Dusk → Night → System
}

export const TIME_INITIAL = { timeMode: 'system' as TimeMode, manualHour: 12 };
```

The old `TimeOfDay` enum and `cycleTimeOfDay`/`setTimeOfDay` are removed. Anything that imported `TimeOfDay` from `state/store` is updated to import `TimeMode` (or to read `manualHour`/effective hour as appropriate).

## Effective hour

Lighting and sky must read a single number — the "effective hour" — regardless of mode. A new hook in `src/scene/lighting/useEffectiveHour.ts`:

- In `manual` mode: returns `manualHour` directly. No interval, no re-render churn.
- In `system` mode: reads `new Date()` once on mount and re-reads every 60 s via `setInterval`, forcing the hook's owner to re-render. Sub-minute precision is unnecessary because the lighting tween (~0.6 s) smooths visible jumps.

`hoursFromDate(d: Date)` returns `d.getHours() + d.getMinutes()/60 + d.getSeconds()/3600`.

## Hour-driven Lighting and Sky

`src/scene/lighting/Lighting.tsx` and `Sky.tsx` move from a discrete `Record<TimeOfDay, …>` to four hour-keyed keyframes:

| Hour | Name    | Notes                                  |
|------|---------|----------------------------------------|
| 0    | night   | existing values                        |
| 6    | morning | NEW — warm low sun, brighter than dusk |
| 12   | noon    | values currently used for `day`        |
| 18   | dusk    | existing values                        |
| 24   | night   | wraps back to hour-0 keyframe          |

Initial morning values (open to tuning once visible):

- Lighting: `sun: 0.7, ambient: 0.5, sunPos: [10, 8, 5], sunColor: [1.0, 0.85, 0.65]`
- Sky: `sunPosition: [10, 6, 5], turbidity: 6, rayleigh: 2, mieCoefficient: 0.008, mieDirectionalG: 0.85`

A small helper `interpolatePreset(hour, presets)` does piecewise-linear interpolation between the two keyframes that bracket the hour, lerping every numeric field (scalar, 3-tuple position, 3-tuple color). Wraps so `hour=23` interpolates between `dusk` (18) and `night` (24/0).

`Lighting.tsx`'s existing tween-toward-target loop keeps working unchanged — it just chases a continuously moving target now. The settled-threshold check in that loop stays as-is; in system mode the target only nudges every minute, so the loop spends most of its time settled.

## Toolbar UI

`src/ui/Toolbar.tsx` replaces the time `SegmentedControl` with a small dropdown button.

**Closed label** reflects current state:

- `Time: System (3:45 PM)` — system mode, with current resolved time
- `Time: Morning` — manual mode at exactly 06:00
- `Time: Noon` — manual mode at exactly 12:00
- `Time: Dusk` — manual mode at exactly 18:00
- `Time: Night` — manual mode at exactly 00:00
- `Time: Custom (10:30 AM)` — manual mode at any other hour

**Open dropdown** is a simple vertical menu:

```
┌──────────────────────────┐
│ ● System  (3:45 PM)      │
├──────────────────────────┤
│   Morning   6:00 AM      │
│   Noon      12:00 PM     │
│   Dusk      6:00 PM      │
│   Night     12:00 AM     │
├──────────────────────────┤
│   Custom    [10:30 ▢]    │  ← native <input type="time">
└──────────────────────────┘
```

- A radio dot marks the currently selected row.
- Clicking a preset row sets `timeMode='manual'` + the hour and closes the dropdown.
- Clicking **System** sets `timeMode='system'` and closes the dropdown.
- The **Custom** row contains an `<input type="time" value="HH:MM">`. Its `value` is bound to the current *effective* hour (so when in System mode the input shows the live clock, and when in any manual mode it shows `manualHour`). Editing it sets `timeMode='manual'` + the parsed hour. The dropdown stays open while the user is editing the time input; it closes when they click outside.
- Outside-click closes the dropdown (existing pattern from `LoadButton`).

The label format `(3:45 PM)` re-evaluates when `manualHour` changes or, in system mode, when `useEffectiveHour` triggers a re-render.

## Keybinding

`src/controls/keybindings.ts` and `src/App.tsx`'s key handler — `T` now calls `cyclePresetTime`, which advances through `system → morning → noon → dusk → night → system`. `src/ui/HelpHint.tsx` updates its T-key hint copy to "Cycle time of day".

## Persistence and migration

`src/state/schema.ts` serializes `{ timeMode, manualHour }` instead of `timeOfDay`. Migration for older saves:

| Old `timeOfDay` | New shape                              |
|-----------------|----------------------------------------|
| `'day'`         | `{ timeMode: 'manual', manualHour: 12 }` |
| `'dusk'`        | `{ timeMode: 'manual', manualHour: 18 }` |
| `'night'`       | `{ timeMode: 'manual', manualHour: 0 }`  |
| missing         | defaults: `{ timeMode: 'system', manualHour: 12 }` |

`'morning'` did not exist in the old enum, so there is nothing else to migrate. The schema version bumps; `applySerialized` performs the transform when reading legacy payloads.

## Testing

Updated tests:

- `src/state/slices/timeSlice.test.ts` (new or rename existing time slice tests) — `setPresetTime`, `setManualHour`, `cyclePresetTime` cycle order, mode transitions.
- `src/state/store.test.ts` — initial state has `timeMode: 'system'`, `manualHour: 12`.
- `src/state/schema.test.ts` — round-trip of new shape, migration from legacy `'day'/'dusk'/'night'`.
- `src/state/storage/LocalStorageAdapter.test.ts` — reading a payload written before this change still loads.
- New `src/scene/lighting/useEffectiveHour.test.ts` — manual mode returns `manualHour`; system mode reads `Date` and updates every 60 s (fake timers).
- New small unit test for `interpolatePreset` — keyframe boundaries, midpoints, wrap from 23→0.

No new lighting/Sky integration tests; the existing tween loop is unchanged.

## Files touched

- `src/state/slices/timeSlice.ts` — rewrite
- `src/state/store.ts` — re-export `TimeMode`, drop `TimeOfDay`
- `src/state/schema.ts` — serialize/migrate
- `src/scene/lighting/Lighting.tsx` — hour-keyframe interpolation
- `src/scene/lighting/Sky.tsx` — hour-keyframe interpolation
- `src/scene/lighting/useEffectiveHour.ts` — new hook
- `src/scene/lighting/interpolatePreset.ts` — new helper (or co-located in Lighting)
- `src/ui/Toolbar.tsx` — dropdown control
- `src/ui/HelpHint.tsx` — T hint copy
- `src/controls/keybindings.ts` — T cycles presets via new action
- `src/App.tsx` — wire T to `cyclePresetTime`
- Tests as listed above.

## Out of scope

- Auto-advancing in-world clock (option C from brainstorming).
- Sun-azimuth or seasonal accuracy. The four keyframes are stylistic, not astronomical.
- Per-room lighting overrides.
- Animated transitions between hours faster than the existing 0.6 s tween.
