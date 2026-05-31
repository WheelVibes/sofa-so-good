# Independent Asset Quality — design

## Problem

GLB asset detail (mesh/texture LOD) is driven directly off `qualityTier`.
On `high` you get original-resolution assets; on `low`/`medium` you get
downscaled `-low`/`-medium` GLB variants plus a runtime texture-budget
downscale. There is no way to view original-quality assets (e.g. IKEA
products) without also enabling the GPU-heavy `high` render effects (bloom,
AO, SMAA, large shadow maps, high DPR).

## Goal

Decouple **asset detail** from **render effects** so the user can pick
original-resolution assets independently of the render quality tier.

## State (`state/slices/uiSlice.ts`)

Add alongside the existing quality state:

- `assetTier: QualityTier | null` — `null` = "Auto" (follow `qualityTier`);
  an explicit `'low' | 'medium' | 'high'` pins asset detail independently.
- `setAssetTier(t: QualityTier | null): void`.

Default: `assetTier: null`.

Resolver helper (exported from `scene/quality.ts` so it has a single home and
is unit-testable):

```ts
export function effectiveAssetTier(
  assetTier: QualityTier | null,
  renderTier: QualityTier,
): QualityTier {
  return assetTier ?? renderTier;
}
```

Because the fallback to `qualityTier` happens only when `assetTier === null`,
an explicit choice is immune to the FPS auto-downgrade — that path
(`autoSetQualityTier`) only mutates `qualityTier`, never `assetTier`. This
satisfies "independent of auto-adjust": once the user picks an asset level it
stays put even if render tier drops.

`assetTier` is added to the persisted-keys list so it survives reloads.

## Persistence (`state/storage/qualityPrefs.ts`)

Extend the `sofa.graphics.v1` blob with an optional `assetTier` field:

- `load`: `assetTier: p.assetTier ?? null`.
- `watch`: include `assetTier` in the serialized snapshot.

This is a per-device preference, not part of a saved layout — no `schema.ts`
change.

## Wiring (`furniture/GltfModel.tsx`)

`GltfModel` reads `qualityTier` for three things; all three switch to the
effective asset tier:

```ts
const renderTier = useStore((s) => s.qualityTier);
const assetTier = useStore((s) => s.assetTier);
const tier = effectiveAssetTier(assetTier, renderTier);
```

- `prewarmLod(url, tier)`
- `resolveLodUrlSync(url, tier)`
- `applyTextureBudget(cloned, tier)` (the `servingOriginal && tier !== 'high'`
  guard uses the same `tier`)

Scope is **all GLB asset detail**: both LOD variant selection and the runtime
texture-budget downscale follow the asset tier. `'high'` asset tier = original
GLB + untouched textures (the "Original" option).

The footprint cache stays keyed on `baseUrl(url)` (unchanged), so collision
geometry remains tier-independent.

## UI (`ui/GraphicsSettings.tsx`)

Add an **Asset quality** row above the render-effect toggles (under the tier
preset block): a 4-button segmented control — `Auto / Low / Medium /
Original`.

- `Auto` highlighted when `assetTier === null`.
- `Low`/`Medium`/`Original` highlighted when `assetTier` equals
  `'low'`/`'medium'`/`'high'` respectively.
- Hint line: *"Model + texture detail, separate from render quality. 'Original'
  loads full-resolution assets even on Low."*

The render tier preset / overrides / FPS auto-adjust UI is untouched. The
toolbar `Quality: <tier>` button still reflects the render tier only (toolbar
redesign is a separate change).

## Testing

Unit (`scene/quality.test.ts` or extend existing):
- `effectiveAssetTier(null, 'low')` → `'low'`; `effectiveAssetTier(null,
  'high')` → `'high'` (tracks render tier when Auto).
- `effectiveAssetTier('high', 'low')` → `'high'` (explicit ignores render tier).
- Store: an `autoSetQualityTier('low')` downgrade leaves an explicit
  `assetTier: 'high'` unchanged.

Persistence:
- `qualityPrefs` round-trips `assetTier` (save then load).

Visual verification (required by CLAUDE.md):
- Load a GLB/IKEA-heavy scene, set render tier **Low** and Asset quality
  **Original**, screenshot, confirm the model renders at full detail while
  render effects (no bloom, small shadows) stay low. Report what the
  screenshots show.

## Out of scope

- Toolbar redesign (separate, next change).
- Any change to the offline `optimize_glb_lod.mjs` pipeline or `schema.ts`.
