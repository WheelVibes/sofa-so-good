# Window Glass Tinting and Curtains

Brainstormed 2026-05-02. Lifts item #1 from the [time-of-day spec — Out of scope](2026-05-01-time-of-day-design.md#out-of-scope).

## Goal

Two layered features that give the apartment's windows expressive control over the sunlight they let through:

1. **Curtains** — opaque or near-opaque coverings that, when closed, occlude the sun like any other shadow caster (no shader work — three.js already does this).
2. **Glass tint** — a per-installation color that paints a colored "sunbeam decal" on the floor where the sun would project through that window. Visually approximates a stained-glass shadow without a custom depth-color shadow shader.

Approach **B** from brainstorming (curtains as standard shadow casters + faux tinted floor decals). Approach C (true colored shadows via custom material chunks) is out of scope.

For a first pass, controls are **global**, not per-window: one tint and one curtain state apply to every window. Per-window state and selection UI are explicit follow-ups.

## State

New slice `src/state/slices/windowsSlice.ts`:

```ts
export type WindowTintPreset = 'none' | 'warm' | 'cool' | 'sage' | 'rose';

export interface WindowsSlice {
  windowTint: WindowTintPreset;
  curtainsClosed: boolean;
  curtainOpacity: number; // 0.5–1.0; only used when curtainsClosed
  setWindowTint: (t: WindowTintPreset) => void;
  setCurtainsClosed: (b: boolean) => void;
  setCurtainOpacity: (n: number) => void;
}

export const WINDOWS_INITIAL = {
  windowTint: 'none' as WindowTintPreset,
  curtainsClosed: false,
  curtainOpacity: 0.85,
};

export const WINDOW_TINT_RGB: Record<WindowTintPreset, [number, number, number] | null> = {
  none: null,
  warm: [1.0, 0.78, 0.45],
  cool: [0.55, 0.72, 1.0],
  sage: [0.6, 0.92, 0.65],
  rose: [1.0, 0.55, 0.65],
};
```

Persisted in `schema.ts` alongside other slices. Missing → defaults.

## Curtains

`src/apartment/Window.tsx` extension. When `curtainsClosed`, render an inset plane filling the cutout, parented to the same wall transform as the existing pane:

- Geometry: `<planeGeometry args={[spec.width, paneHeight]} />`
- Material: `meshStandardMaterial` with `color="#dccaa6"`, `roughness=0.85`, `transparent={curtainOpacity < 1}`, `opacity={curtainOpacity}`.
- `castShadow={shadows !== 'off'}`, `receiveShadow` true.
- Position: same as pane but offset along wall normal by `+0.02 m` so it sits inside the room.

The existing translucent glass pane stays rendered behind it. When curtains are open the curtain mesh isn't rendered at all (component returns null for the curtain branch).

The shadow caster will fully occlude the directional sun through the cutout when curtains are closed — the existing shadow-map plumbing handles this without modification. Curtain `opacity < 1` does not produce a partial shadow (three.js shadow maps are binary at the depth-test level); semi-transparent curtains visually look semi-sheer but cast a full shadow. Documented as a known limitation; an `alphaTest` based curtain texture could be a follow-up.

## Tinted floor sunbeam decals

New component `src/scene/lighting/WindowSunbeams.tsx`. Mounted from `Scene.tsx` next to other lighting components.

For each `WindowSpec` in `WINDOWS`:

1. Skip if `WINDOW_TINT_RGB[windowTint]` is null, or if `curtainsClosed && curtainOpacity >= 1.0`, or if `sunDir.y <= 0`, or if the wall's outward normal `n` (in xz, computed via the existing pattern in `daylight.ts:wallNormalOutward` — adapted to operate on a wall without a room reference, picking the side that points away from the apartment AABB centroid) satisfies `dot(n, sunDir.xz) >= 0` (sun is behind the wall, no light enters).
2. Compute the four world-space corners of the window aperture: along the wall in `[offset, offset + width]`, vertical in `[sill, head]`. Lift to the window's plane in xz using the wall direction.
3. Project each corner along `sunDir` onto the floor plane (`y = 0.005` to avoid z-fighting): `t = corner.y / sunDir.y`, `floorPt = corner - sunDir * t`.
4. Build a `BufferGeometry` with the four floor points (as a parallelogram, two triangles), normals pointing up.
5. Render with `meshBasicMaterial`:
   - `color = WINDOW_TINT_RGB[windowTint]` multiplied by altitude-driven sun color (use `lightingFromAltitude(sunAltRad).sunColor`).
   - `transparent: true`, `blending: AdditiveBlending`, `depthWrite: false`.
   - `opacity = admit * BEAM_OPACITY_MAX * (curtainsClosed ? (1 - curtainOpacity) : 1)` where `admit = daylightAdmittance(sunAltRad)` and `BEAM_OPACITY_MAX = 0.45`.

The decal updates each frame (or each sun change — for first pass, each frame is fine; the geometry rebuild is 4 vertices × 11 windows = trivial).

When the global directional sun also paints a white beam through the cutout, the result is white sun + additive tinted decal — slightly desaturated tint rather than pure colored shadow. Acceptable trade for not writing a custom depth-color pass.

## Settings panel

`src/ui/SettingsPanel.tsx` gains a **Windows** section:

- **Glass tint** — segmented control `None / Warm / Cool / Sage / Rose`.
- **Curtains** — toggle `Open / Closed`.
- **Curtain opacity** — slider 0.5 → 1.0, only enabled when curtains are closed.

## Files touched

- `src/state/slices/windowsSlice.ts` — new
- `src/state/store.ts` — compose
- `src/state/schema.ts` — persist + migrate (missing → defaults)
- `src/apartment/Window.tsx` — curtain mesh
- `src/scene/lighting/WindowSunbeams.tsx` — new
- `src/scene/Scene.tsx` — mount `<WindowSunbeams />`
- `src/ui/SettingsPanel.tsx` — Windows section
- `TODO.md`

## Tests

- `windowsSlice.test.ts` — defaults, setters, persistence round-trip via schema.
- `windowSunbeams.test.ts` — geometry: given a known window + sun direction, the four projected floor corners match expected coordinates within 1e-4. Skip-conditions: sun below horizon, curtains fully closed, tint=none.

## Out of scope

- Per-window tint and per-window curtain state (would require window-selection UX).
- True colored shadows via custom depth-color render pass (Approach C).
- Curtain materials with alpha textures producing dappled shadows.
- Decals on walls/furniture (only the floor receives the tinted beam).
- Animated curtain open/close transitions.
