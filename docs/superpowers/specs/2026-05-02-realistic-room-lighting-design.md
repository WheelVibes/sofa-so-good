# Realistic per-room lighting (window-aware, door-gated)

Date: 2026-05-02
Branch: phase-1/apartment-shell

## Problem

The current scene applies sun + sky-IBL + ambient uniformly to every room, so a windowless household-shelter reads at the same brightness as a north-facing bedroom at noon. The previous `RoomFillLights` was deleted because it lit windowless rooms equally and glowed at night. We now want light to depend on (a) whether a room has windows, (b) the sun direction relative to those windows, and (c) which doors are open between rooms.

## Goal

A windowed room is bright by day; a windowless interior room is dim unless light bleeds in through an open door from a windowed neighbour. Closing a door visibly drops the neighbour's daylight contribution. At night, all rooms read equally dim regardless of windows or door state. No fake "always-on" downlights.

## Non-goals

- User-installed ceiling/floor fixtures (Phase 4) — orthogonal; they add on top.
- Per-room IBL probes (already in TODO).
- Real-time GI / path tracing.
- Window glass tinting / curtains.
- Outdoor scenes beyond the apartment shell.

## Existing infrastructure (reused as-is)

- `roomDaylightFactor(roomId, sunDir)` in [src/apartment/daylight.ts](../../../src/apartment/daylight.ts) — returns 0..1 per room from window area × wall-facing-sun (`external` rooms = 1; rooms with no sunlit windows = 0).
- `buildRoomGraph(doorState)` and `relaxDaylight(base, graph)` in [src/apartment/roomGraph.ts](../../../src/apartment/roomGraph.ts) — propagates per-room values through *open* doors with `BLEED_ATTENUATION = 0.4` per pass, up to `BLEED_MAX_PASSES = 4`. Closed doors block bleed entirely.
- `lightingFromAltitude(alt)` in [src/scene/lighting/altitudeCurve.ts](../../../src/scene/lighting/altitudeCurve.ts) — sun/ambient/exposure curve over altitude.
- `useSunPosition()`, `sunDirectionToScene()`.

These are already tested. The spec wires them into actual lights.

## Design

### 1. Lower the global baseline

In `altitudeCurve.ts`, drop `ambient` to roughly half its current values across the curve. The "no per-room contribution" state should read as a dim windowless interior, not a flat-lit one. `envIntensity` (set in [Environment.tsx](../../../src/scene/lighting/Environment.tsx)) drops in step so the IBL no longer single-handedly fills enclosed rooms.

Calibration target: at noon, a windowless household-shelter with all doors closed reads as "dim but navigable" (rough luminance ~10–20% of a sunlit bedroom). Verified by visual smoke test at zenith, golden hour, civil twilight, deep night.

### 2. New `RoomDaylight` component

New file: `src/scene/lighting/RoomDaylight.tsx`. Responsibilities:

1. Subscribe to `state.doors` and the sun position.
2. Each frame (or on door/sun change), compute:
   - `base[roomId] = roomDaylightFactor(roomId, sunDir)` for every room.
   - `relaxed[roomId] = relaxDaylight(base, buildRoomGraph(doorState))[roomId]`.
3. Multiply each `relaxed[roomId]` by a `daylightAdmittance(altitude)` curve (zero below the horizon, ramps in over civil twilight, peaks at high sun) — separate from the sun-direct curve so we can tune indoor admittance without re-tuning the sun.
4. For each non-`external` room, render one `pointLight` at the room's centroid, height ≈ ceiling − 0.2 m, intensity ∝ `relaxed[roomId] × admittance`, color derived from `lightingFromAltitude(alt).sunColor` (so warm at golden hour, cool at noon). This is the "skylight admittance fill".
5. For each room with `base[roomId] > 0` (its *own* windows are sunlit), additionally render an inward-facing `directionalLight` (or wide spotLight) positioned just outside the windowed wall, aimed into the room. Intensity ∝ `base[roomId] × admittance × sunCurve`. This is what reads as "light coming through the window".
6. Tween all per-room values with the same 0.6 s pattern as `Lighting.tsx` so door toggles and sun-altitude changes feel smooth, not snapping.

### 3. Door reactivity

Existing `state.doors` updates already trigger React re-renders. The component re-derives `base`/`relaxed` whenever `doorState` or `sunDir` changes. Closing a door drops `relaxed` for any room whose only daylight path went through it; the tween animates the falloff. Opening a door restores it.

### 4. File layout & integration

- New: `src/scene/lighting/RoomDaylight.tsx`.
- Mounted in [src/scene/Scene.tsx](../../../src/scene/Scene.tsx) alongside `<Lighting />` and `<Environment />`.
- [altitudeCurve.ts](../../../src/scene/lighting/altitudeCurve.ts) ambient values reduced; `daylightAdmittance(alt)` exported.
- [Environment.tsx](../../../src/scene/lighting/Environment.tsx) `envIntensity` curve reduced in lockstep.

### 5. Performance

- Up to ~10 rooms × 2 lights = ~20 lights. Three.js handles this. Shadows on the per-room lights are off (the directional sun already casts shadows; per-room lights are fills).
- `relaxDaylight` is O(rooms × doors × passes) ≈ tens of operations — cheap to run per frame, but we'll memoise on `(doorState, sunDirQuantised)` to avoid allocating each frame.

## Testing

- Unit: extend `daylight.test.ts` / `roomGraph.test.ts` with a test that closing all doors of a windowless room drops its `relaxDaylight` value to 0, and opening one door to a sunlit room restores it to `BLEED_ATTENUATION × source`.
- Unit: `daylightAdmittance` is 0 below horizon, monotonic up to ~30°, plateaus.
- Visual smoke test (manual): four time-of-day keypoints (zenith, golden hour, civil twilight, deep night) × {all doors open, all doors closed, household-shelter door closed}. Document expected reads in TODO.md follow-up.

## Risks

- **Tuning interaction with existing exposure / envIntensity curves.** Changing global ambient means re-checking the time-of-day realism follow-ups already listed in TODO.md. Mitigation: keep the new admittance curve independent from the existing sun/ambient curves so we can tune indoor brightness without disturbing outdoor readings.
- **Per-room lights placed at centroid look "from nowhere" in long rooms.** If this reads poorly, fall back to placing the inward-facing `directionalLight` pre-positioned at the centre of each windowed wall instead of the centroid — roomGraph already gives us per-wall window data.
- **Doors that don't separate two rooms** (e.g. front door → corridor only). Already handled by `roomsAdjacentToDoor` returning `null`; no edge added.

## Open questions deferred to follow-up

- Whether to add a "skylight only" component for windowless rooms with skylights — none exist in the current floorplan.
- Per-window directional contribution (one injector per window vs. one per windowed wall). Start with per-wall.
