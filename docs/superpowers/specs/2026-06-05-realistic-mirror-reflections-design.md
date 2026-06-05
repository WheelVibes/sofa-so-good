# Realistic mirror reflections — design

**Date:** 2026-06-05
**Status:** approved, inline implementation

## Goal

Make the catalog mirrors reflect the actual room (true planar reflections) so a
user can see the space-enlarging effect of a mirror, replacing today's fake
"shiny metallic" pane that only catches the IBL.

## Decisions

- **Performance gating:** real reflections only on the **High** and **Maximum**
  render tiers (where the GPU post-stack already runs). **Performance** (the
  default for GPU-less laptops) and **Medium** keep the existing fast fake-shiny
  pane. Real reflection costs one extra scene render per *on-screen* mirror per
  frame; off-screen mirrors are frustum-culled and free.
- **Scope:** all three mirror primitives — `WallMirror` (round / arch / rect),
  `Mirror` (bathroom rect / round / frameless), `FloorMirror` (rect + round
  cheval).

## Approach

drei's `MeshReflectorMaterial` (already a dependency, drei v10) renders the scene
from the mirror's plane into a render target each frame — true geometry
reflection with correct parallax. Chosen over a CubeCamera environment probe
(no planar parallax — flat mirrors look wrong) and over the status-quo fake pane.

## Components

- **`furniture/primitives/MirrorMaterial.tsx`** — a small material component that
  reads the render tier from the store and returns either:
  - `<MeshReflectorMaterial>` when tier is `high`/`maximum` (sharp mirror:
    `blur=[0,0]`, `roughness=0`, `mirror=1`, near-white tint; `resolution` 512 on
    High, 1024 on Maximum), or
  - the current fake `<meshStandardMaterial>` (low roughness + metalness + raised
    `envMapIntensity`, faint emissive so it never goes black) otherwise.
  It is placed as the material child inside each existing pane mesh; geometry is
  unchanged. Pure tier→config helper extracted for unit testing.
- **Primitive edits** — `WallMirror`, `Mirror`, `FloorMirror` each swap their pane
  mesh's material (currently a `material=` instance prop or a `<meshStandardMaterial>`
  child) for `<MirrorMaterial>` as a child element.

## Non-goals / risks

- **No recursion**: the reflector renders the scene once; a mirror seen inside
  another mirror falls back to its base look (no infinite loop).
- **Render-on-demand**: no special handling — the reflector updates on every
  rendered frame; the demand loop already renders while the view changes and on
  mount, and a static idle reflection is correct. Verify no black first frame.
- Does not change collision, footprints, or the fake-pane look on lower tiers.

## Verification

- Unit test the pure tier→reflector-config selection.
- In-app (High): place a mirror facing furniture, confirm the reflection shows
  the real room; confirm Performance still renders the fake pane (no regression).
