# PC2-CAM-DOF-LENS — implementation plan (2026-06-20 research)

Camera **lens type + depth-of-field** controls for the render/snapshot camera. Research distilled from a
codebase audit; the pixel-level bokeh needs a real GPU to verify, but the wiring (steps 1–6) is fully
CI-verifiable.

## What already exists
- **Path tracer (HQ render) already has real DoF, but no lens controls.** `src/scene/pathtrace/hqRenderSession.ts`
  uses `three-gpu-pathtracer`'s `PhysicalCamera`: `HqRenderOptions.fStop` is the only knob; when `fStop>0`
  it clones the live pose/FOV into a `PhysicalCamera`, sets `fStop`, and **auto-focuses on the first surface
  at screen centre** (raycast, 3 m fallback). Focus distance + focal length are NOT user-controllable.
  UI is a 4-option dropdown in `src/ui/HqRenderModal.tsx` (`DOF_STOPS`).
- **Raster tiers (High/Max) have NO DoF.** `src/scene/EffectsImpl.tsx` runs N8AO + Bloom + HueSaturation +
  (cinematic) CA/Noise + Vignette + SMAA — no `DepthOfField`. The Maximum tier description string already
  *claims* "subtle lens defocus" (currently false).
- **`@react-three/postprocessing` ships `DepthOfField` + `Autofocus`** (already in node_modules) → cheap raster
  DoF is a drop-in.
- **Precedent for tunable camera params:** walk camera (`src/scene/cameras/walkCameraSettings.ts` pure
  ranges/clamps + `cameraSlice` fields `walkFov`/`walkEyeHeight` + `WalkCameraControls.tsx` sliders, gated by
  `walkCameraControls` flag). **Copy this pattern.**
- **Persistence:** `src/state/storage/qualityPrefs.ts` (`sofa.graphics.v1`, JSON snapshot diff). HQ-modal
  `fStop` is currently component-local `useState` (not persisted).

## Smallest verifiable slice (headless, do first)
1. Pure `src/scene/cameras/cameraLensSettings.ts` (mirror walkCameraSettings): focal presets (24/35/50/85 mm),
   f-stop list, focus-distance clamp, `mmToFov(mm, sensorH=24)` = `2*atan(12/mm)` (three `PerspectiveCamera.fov`
   is the vertical FOV in degrees) + inverse. Unit-test conversions + clamps.
2. `cameraDof` flag — registry + `types.ts` union + both-mode test (`default: true`, `tier: 'pro'`).
3. `cameraSlice` fields `lensFocalMm` / `dofFStop` / `dofFocusDistance` (+ `dofAuto`) + clamped setters + tests.
4. `qualityPrefs` snapshot extended (load + watch) with back-compat defaults; round-trip test.
5. `HqRenderOptions` gains `focalLengthMm` + `focusDistance`; wire into the `PhysicalCamera` block (override
   the auto-raycast focus when provided; map mm→FOV). Update `hqRenderSession.test.ts`.
6. `HqRenderModal` UI: replace the lone DoF dropdown with gated lens/f-stop/focus controls (fallback to the
   dropdown when the flag is off). RTL presence test in both modes.

## Raster DoF (High/Max only) — step 7
- Add `dof: boolean` to `QualitySettings` (`quality.ts`): **true only on `high`/`maximum`**, false on
  `performance`/`medium`. Since `Effects` only mounts when `postprocessing` is true (High+), DoF is
  structurally impossible on the default tiers. Fix the Maximum description.
- Mount `<DepthOfField>` in `EffectsImpl.tsx` (keyed-array assembly) when `quality.dof && isFeatureEnabled('cameraDof') && userDofEnabled`.
  Prefer **world-space** form (`worldFocusDistance`/`worldFocusRange` in metres) to share one mental model
  with the path tracer. Reuse the centre-screen raycast for default focus (or `<Autofocus>`). Keep
  `bokehScale` modest + consider `resolutionScale < 1` (half-res like N8AO).

## Verifiable vs real-GPU
- **Headless:** lens math, flag resolution, store setters, persistence round-trip, HQ option plumbing, UI presence.
- **Real GPU (screenshot harness):** that bokeh focuses where the slider says, raster DoF visible on High/Max and
  absent on Performance/Medium, no foreground/transparent artifacts.

## References
- Coohom exposes focal length + DoF + aperture in render settings (parity benchmark). Planner 5D / SH3D have
  FOV but no f-stop. IKEA Kreativ deliberately minimal (matches keeping DoF out of Simple). Blender / **D5 Render**
  are the param-vocabulary model (focal length + f-stop + focus distance/object). D5 Render + the GarageFarm DoF
  guide added to `REFERENCES.md`.

## Risks
- Keep DoF off the default Performance tier (structural — Effects doesn't mount there).
- Share the metres-based focus model across raster + HQ to avoid two mental models.
