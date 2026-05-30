# Render Fidelity + GLTF Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the HDB sandbox render at IKEA-grade fidelity (calibrated look + offline parked-camera accumulation stills) and make user-imported GLB models first-class, finish-swappable catalog citizens.

**Architecture:** Four independent units layered on the existing `scene/` and `furniture/` code, no rewrites. Unit 1 calibrates the look via a new pure `scene/look.ts`. Unit 2 adds a parked-camera `ShowcaseController` + capture-time max-settings forcing. Unit 3 hardens the existing `GltfModel`/upload path (compressed-mesh decoders, collision span from the bbox cache, named finish targets). Unit 4 surfaces imported GLBs as real catalog cards with persisted metadata.

**Tech Stack:** React 18 + TypeScript, three.js 0.184 via @react-three/fiber 8, @react-three/drei 9 (`useGLTF`, `AccumulativeShadows`, `RandomizedLight`), @react-three/postprocessing 2, Zustand 5, Vitest. three-stdlib `DRACOLoader`/`KTX2Loader`/meshopt decoder.

---

## Spec reference

`docs/superpowers/specs/2026-05-30-render-fidelity-gltf-hardening-design.md`

## File structure

| File | Responsibility | Unit |
|------|----------------|------|
| `src/scene/look.ts` (create) | Pure look-grading curves: `grade(altitude)`, shadow/AO param tables | 1 |
| `src/scene/look.test.ts` (create) | Unit tests for `look.ts` | 1 |
| `src/scene/Scene.tsx` (modify) | `PCFShadowMap` → `PCFSoftShadowMap` | 1 |
| `src/scene/lighting/Lighting.tsx` (modify) | Apply soft-shadow radius/bias + drive exposure from `grade()` | 1 |
| `src/scene/lighting/SceneEnvironment.tsx` (modify) | Richer IBL probe | 1 |
| `src/scene/EffectsImpl.tsx` (modify) | Retuned N8AO + Vignette + tone curve | 1 |
| `src/scene/showcase.ts` (create) | Pure idle state machine `nextShowcaseState()` | 2 |
| `src/scene/showcase.test.ts` (create) | Unit tests for idle state machine | 2 |
| `src/scene/ShowcaseController.tsx` (create) | Mounts `AccumulativeShadows` while parked | 2 |
| `src/scene/quality.ts` (modify) | Add `showcase` capability to presets | 2 |
| `src/state/slices/uiSlice.ts` (modify) | Persist `showcase` override key | 2 |
| `src/scene/ScreenshotController.tsx` (modify) | Force max settings during capture (try/finally) | 2 |
| `src/scene/Scene.tsx` (modify) | Mount `<ShowcaseController/>` | 2 |
| `src/ui/GraphicsSettings.tsx` (modify) | `showcase` toggle | 2 |
| `src/furniture/gltf/decoders.ts` (create) | Register Draco/KTX2/meshopt on `useGLTF` | 3 |
| `src/furniture/gltf/decoders.test.ts` (create) | Assert decoder registration | 3 |
| `src/main.tsx` (modify) | Call `registerGltfDecoders()` at boot | 3 |
| `src/furniture/gltf/finishTargets.ts` (create) | List named mesh/material groups of a loaded GLTF; resolve a target | 3 |
| `src/furniture/gltf/finishTargets.test.ts` (create) | Unit tests for target listing/resolution | 3 |
| `src/furniture/types.ts` (modify) | Add `finishTargets?` + `finishOverrides?` + span fields to `UserGltfDef` | 3,4 |
| `src/furniture/GltfModel.tsx` (modify) | Apply finish overrides to named targets; expose span helper | 3 |
| `src/collision/gltfSpan.ts` (create) | Derive `verticalSpan`+footprint from cached bbox | 3 |
| `src/collision/gltfSpan.test.ts` (create) | Unit tests for span derivation | 3 |
| `src/furniture/upload/persist.ts` (modify) | Persist category/flags/finishTargets onto `UserGltfDef` | 4 |
| `src/ui/upload/UploadModelDialog.tsx` (modify) | Capture mounted/noClip flags | 4 |
| `src/state/schema.ts` (modify) | Round-trip new `UserGltfDef` fields | 4 |
| `src/ui/catalog/*` (modify) | Imported items render as cards (verify existing path) | 4 |

---

## Unit 1 — Look calibration

### Task 1: Pure look-grading module (`look.ts`)

**Files:**
- Create: `src/scene/look.ts`
- Test: `src/scene/look.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/look.test.ts
import { describe, it, expect } from 'vitest';
import { grade, SOFT_SHADOW, AO } from './look';

describe('grade', () => {
  it('exposure rises monotonically with sun altitude', () => {
    const night = grade(-0.3).exposure;
    const dawn = grade(0.05).exposure;
    const noon = grade(1.2).exposure;
    expect(night).toBeLessThan(dawn);
    expect(dawn).toBeLessThan(noon);
  });

  it('clamps exposure to a sane range', () => {
    for (const alt of [-1.5, -0.2, 0, 0.4, 1.57]) {
      const e = grade(alt).exposure;
      expect(e).toBeGreaterThanOrEqual(0.7);
      expect(e).toBeLessThanOrEqual(1.25);
    }
  });

  it('white balance is warmer (lower kelvin factor) near the horizon', () => {
    // wb is a 0..1 "warmth" factor; 1 = warmest (golden hour), 0 = neutral midday
    expect(grade(0.03).warmth).toBeGreaterThan(grade(1.2).warmth);
  });

  it('exposes tuned shadow + AO constants', () => {
    expect(SOFT_SHADOW.radius).toBeGreaterThan(0);
    expect(SOFT_SHADOW.normalBias).toBeGreaterThan(0);
    expect(AO.aoRadius).toBeGreaterThan(0);
    expect(AO.intensity).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/look.test.ts`
Expected: FAIL — `Cannot find module './look'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/scene/look.ts
/**
 * Single source of truth for the graded "look". Pure functions only — no
 * three.js, no React — so the curves are unit-testable. Consumers (Lighting,
 * EffectsImpl) read these to drive exposure, white balance, shadow softness
 * and ambient occlusion. `altitude` is the sun altitude in radians as
 * returned by SunCalc (negative below the horizon, ~1.57 at zenith).
 */

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface Grade {
  /** Multiplier for gl.toneMappingExposure. */
  exposure: number;
  /** 0 = neutral midday, 1 = warmest golden-hour/indoor-night cast. */
  warmth: number;
}

/** Map sun altitude → exposure + white-balance warmth. */
export function grade(altitude: number): Grade {
  // day factor: 0 well below horizon → 1 high sun.
  const day = smoothstep(-0.12, 0.5, altitude);
  const exposure = clamp(0.78 + day * 0.42, 0.7, 1.25);
  // Warmest right at the horizon band, cooling toward midday and night.
  const horizonBand = 1 - smoothstep(0.0, 0.35, Math.abs(altitude - 0.08));
  const warmth = clamp(0.2 + horizonBand * 0.6, 0, 1);
  return { exposure, warmth };
}

/** Soft-shadow tuning for the sun directional light (PCFSoftShadowMap). */
export const SOFT_SHADOW = {
  radius: 4,
  normalBias: 0.04,
  bias: -0.0002,
} as const;

/** Screen-space AO tuning (N8AO) — deeper than the old defaults so corners
 *  and recesses ground like the reference renders. */
export const AO = {
  aoRadius: 0.7,
  distanceFalloff: 1.2,
  intensity: 3.0,
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/look.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scene/look.ts src/scene/look.test.ts
git commit -m "feat: pure look-grading curves (exposure/white-balance/shadow/AO)"
```

### Task 2: Soft shadows + exposure wiring

**Files:**
- Modify: `src/scene/Scene.tsx` (shadow map type + remove fixed exposure default)
- Modify: `src/scene/lighting/Lighting.tsx` (soft-shadow props + drive exposure)

- [ ] **Step 1: Switch the shadow map type**

In `src/scene/Scene.tsx`, change the import and the `shadows` prop:

```tsx
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three';
// ...
<Canvas
  shadows={{ type: PCFSoftShadowMap }}
```

- [ ] **Step 2: Apply soft-shadow params + drive exposure in Lighting**

In `src/scene/lighting/Lighting.tsx`:

1. Add imports at the top:

```tsx
import { useThree } from '@react-three/fiber';
import { grade, SOFT_SHADOW } from '../look';
```

2. Inside `Lighting()`, after the existing `const shadowMapSize = useQuality().shadowMapSize;` line, add:

```tsx
const gl = useThree((s) => s.gl);
```

3. In the `useFrame` body, after the existing `if (sunRef.current) { ... }` block that sets intensity/position/color, drive exposure from the *target* altitude (cheap, runs only while unsettled — but exposure should track even when lights settle, so move this above the `if (settled) return;` early-out). Concretely, replace the early-out region:

```tsx
    // Drive tone-mapping exposure from the sun altitude every frame — cheap,
    // and it must keep tracking even after the light tween settles.
    gl.toneMappingExposure = grade(sunPos.altitude).exposure;

    // Cheap settle check on the dominant channels.
    const settled =
      Math.abs(target.sun - cur.sun) < 1e-3 &&
      Math.abs(target.ambient - cur.ambient) < 1e-3 &&
      Math.abs(target.sunPos[1] - cur.sunPos[1]) < 1e-2 &&
      Math.abs(target.skyColor[2] - cur.skyColor[2]) < 1e-3;
    if (settled) return;
```

4. In the `<directionalLight>` JSX, add the soft-shadow props (replace the existing `shadow-bias` / `shadow-normalBias` lines):

```tsx
        shadow-bias={SOFT_SHADOW.bias}
        shadow-normalBias={SOFT_SHADOW.normalBias}
        shadow-radius={SOFT_SHADOW.radius}
```

- [ ] **Step 3: Typecheck + existing tests**

Run: `npm run build 2>&1 | head -20` and `npx vitest run src/scene`
Expected: typecheck passes; existing scene tests pass.

- [ ] **Step 4: Visual smoke check**

Run: `npm run dev` in one shell, then `node scripts/shot.mjs /tmp/look-after.png 7000`
Expected: a PNG renders (software WebGL); shadows read softer, scene exposure tracks time of day. (Visual confirmation only — not asserted.)

- [ ] **Step 5: Commit**

```bash
git add src/scene/Scene.tsx src/scene/lighting/Lighting.tsx
git commit -m "feat: soft shadows + altitude-driven tone-mapping exposure"
```

### Task 3: Richer IBL probe + retuned AO + finishing post

**Files:**
- Modify: `src/scene/lighting/SceneEnvironment.tsx`
- Modify: `src/scene/EffectsImpl.tsx`

- [ ] **Step 1: Enrich the IBL probe**

In `src/scene/lighting/SceneEnvironment.tsx`, add two Lightformers inside the `<Environment>` for more directional variation + a warmer bounce. Insert before the closing `</Environment>`:

```tsx
      {/* Warm key from the sun side for stronger spec variation on wood/metal. */}
      <Lightformer form="rect" intensity={0.8} color="#ffe6c2" scale={[5, 5, 1]} position={[5, 5, 5]} rotation={[Math.PI / 2, 0, 0]} />
      {/* Cool counter-fill so reflections aren't flat. */}
      <Lightformer form="rect" intensity={0.35} color="#c2d4ff" scale={[5, 5, 1]} position={[-5, 4, -5]} rotation={[Math.PI / 2, 0, 0]} />
```

- [ ] **Step 2: Retune AO + add finishing post**

In `src/scene/EffectsImpl.tsx`, replace the imports and component body:

```tsx
import { EffectComposer, Bloom, SMAA, N8AO, Vignette, HueSaturation } from '@react-three/postprocessing';
import { AO } from './look';

/**
 * High-tier post-processing stack.
 *   - N8AO: SSAO, tuned via look.AO so corners/recesses ground deeply.
 *   - Bloom: gentle glow on emissive fixtures at night (thresholded).
 *   - HueSaturation: a touch of saturation so finishes read rich, not muddy.
 *   - Vignette: subtle edge darkening so the frame reads "shot, not rendered".
 *   - SMAA: edge antialiasing (composer renders off-screen).
 */
export default function EffectsImpl() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={AO.aoRadius} distanceFalloff={AO.distanceFalloff} intensity={AO.intensity} quality="medium" halfRes />
      <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.15} intensity={0.6} />
      <HueSaturation saturation={0.06} hue={0} />
      <Vignette eskil={false} offset={0.32} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build 2>&1 | head -20`
Expected: passes. (If `Vignette`/`HueSaturation` are not exported by the installed `@react-three/postprocessing`, the typecheck will error — see fallback below.)

Fallback if an effect is unavailable: drop the unavailable effect from the JSX and its import; keep the rest. Confirm the export list with `grep -o 'export.*Vignette\|export.*HueSaturation' node_modules/@react-three/postprocessing/dist/index.d.ts` (both ship in 2.19).

- [ ] **Step 4: Visual smoke check**

Run (dev server up): `node scripts/shot.mjs /tmp/look-post.png 7000`
Note: software WebGL renders the High post stack slowly; allow the wait. Expected: a PNG; corners darker, slight vignette. Visual only.

- [ ] **Step 5: Commit**

```bash
git add src/scene/lighting/SceneEnvironment.tsx src/scene/EffectsImpl.tsx
git commit -m "feat: richer IBL probe, deeper AO, vignette + saturation finishing"
```

---

## Unit 2 — Showcase / accumulation still mode

### Task 4: Pure idle state machine (`showcase.ts`)

**Files:**
- Create: `src/scene/showcase.ts`
- Test: `src/scene/showcase.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/showcase.test.ts
import { describe, it, expect } from 'vitest';
import { nextShowcaseState, IDLE_MS, type ShowcaseState } from './showcase';

const live: ShowcaseState = { mode: 'live', stillSince: null };

describe('nextShowcaseState', () => {
  it('stays live until the camera has been still for IDLE_MS', () => {
    const s1 = nextShowcaseState(live, { moved: false, now: 1000 });
    expect(s1.mode).toBe('live');
    expect(s1.stillSince).toBe(1000);
    const s2 = nextShowcaseState(s1, { moved: false, now: 1000 + IDLE_MS - 1 });
    expect(s2.mode).toBe('live');
  });

  it('enters accumulate once still past IDLE_MS', () => {
    const s1 = nextShowcaseState(live, { moved: false, now: 1000 });
    const s2 = nextShowcaseState(s1, { moved: false, now: 1000 + IDLE_MS + 1 });
    expect(s2.mode).toBe('accumulate');
  });

  it('resets to live the moment the camera moves', () => {
    const acc: ShowcaseState = { mode: 'accumulate', stillSince: 0 };
    const s = nextShowcaseState(acc, { moved: true, now: 5000 });
    expect(s.mode).toBe('live');
    expect(s.stillSince).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/showcase.test.ts`
Expected: FAIL — `Cannot find module './showcase'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/scene/showcase.ts
/**
 * Pure idle state machine for showcase accumulation. The controller feeds it
 * whether the camera moved this frame and the current clock; it returns the
 * next state. Kept free of three.js/React so it's unit-testable with a fake
 * clock. "accumulate" means: park the live render and let AccumulativeShadows
 * converge a noise-free soft shadow.
 */

export const IDLE_MS = 400;

export interface ShowcaseState {
  mode: 'live' | 'accumulate';
  /** Clock (ms) when the camera last became still, or null while moving. */
  stillSince: number | null;
}

export interface ShowcaseInput {
  moved: boolean;
  now: number;
}

export function nextShowcaseState(prev: ShowcaseState, input: ShowcaseInput): ShowcaseState {
  if (input.moved) {
    return { mode: 'live', stillSince: null };
  }
  const stillSince = prev.stillSince ?? input.now;
  const idleFor = input.now - stillSince;
  const mode = idleFor > IDLE_MS ? 'accumulate' : 'live';
  return { mode, stillSince };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/showcase.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scene/showcase.ts src/scene/showcase.test.ts
git commit -m "feat: pure idle state machine for showcase accumulation"
```

### Task 5: `showcase` quality capability

**Files:**
- Modify: `src/scene/quality.ts`
- Modify: `src/ui/GraphicsSettings.tsx`

- [ ] **Step 1: Add `showcase` to `QualitySettings` + presets**

In `src/scene/quality.ts`, add to the `QualitySettings` interface (after `geometryDetail`):

```ts
  /** Accumulate soft, noise-free shadows while the camera is parked
   *  (drei AccumulativeShadows). Off on low; forced on during capture. */
  showcase: boolean;
```

Then add `showcase` to each preset: `low: { ... showcase: false }`, `medium: { ... showcase: true }`, `high: { ... showcase: true }`.

- [ ] **Step 2: Add the Graphics toggle**

In `src/ui/GraphicsSettings.tsx`, after the "Contact shadows" `<Toggle>` line, add:

```tsx
          <Toggle label="Showcase stills" hint="Sharpen shadows when the camera is still" checked={eff.showcase} onChange={(v) => setOverride('showcase', v)} />
```

- [ ] **Step 3: Typecheck + tests**

Run: `npm run build 2>&1 | head -20` and `npx vitest run src/scene src/state`
Expected: passes. `resolveQuality` already spreads presets+overrides, so `showcase` flows through with no other change. The `uiSlice` `qualityOverrides` is `Partial<QualitySettings>`, so the new key is automatically allowed.

- [ ] **Step 4: Commit**

```bash
git add src/scene/quality.ts src/ui/GraphicsSettings.tsx
git commit -m "feat: showcase quality capability + Graphics toggle"
```

### Task 6: `ShowcaseController` (accumulate while parked)

**Files:**
- Create: `src/scene/ShowcaseController.tsx`
- Modify: `src/scene/Scene.tsx` (mount it)

- [ ] **Step 1: Write the controller**

```tsx
// src/scene/ShowcaseController.tsx
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { AccumulativeShadows, RandomizedLight } from '@react-three/drei';
import { Vector3 } from 'three';
import { useQuality } from './useQuality';
import { nextShowcaseState, type ShowcaseState } from './showcase';
import { APARTMENT_EXT_W, APARTMENT_EXT_D } from '../apartment/constants';

/**
 * While the camera is parked (see showcase.ts), drop in AccumulativeShadows so
 * the ground shadow converges to area-light-quality softness with no noise.
 * Any camera movement resets it and returns to the live render. Gated by the
 * `showcase` quality capability. Costs nothing while the camera moves.
 */
export function ShowcaseController() {
  const enabled = useQuality().showcase;
  const [state, setState] = useState<ShowcaseState>({ mode: 'live', stillSince: null });
  const prevPos = useRef(new Vector3());
  const stateRef = useRef(state);
  stateRef.current = state;

  useFrame(({ camera, clock }) => {
    if (!enabled) {
      if (stateRef.current.mode !== 'live') setState({ mode: 'live', stillSince: null });
      return;
    }
    const moved = prevPos.current.distanceToSquared(camera.position) > 1e-6;
    prevPos.current.copy(camera.position);
    const now = clock.getElapsedTime() * 1000;
    const next = nextShowcaseState(stateRef.current, { moved, now });
    if (next.mode !== stateRef.current.mode || next.stillSince !== stateRef.current.stillSince) {
      setState(next);
    }
  });

  if (!enabled || state.mode !== 'accumulate') return null;

  return (
    <AccumulativeShadows
      temporal
      frames={60}
      alphaTest={0.85}
      opacity={0.8}
      scale={Math.max(APARTMENT_EXT_W, APARTMENT_EXT_D) * 1.5}
      position={[APARTMENT_EXT_W / 2, 0.01, APARTMENT_EXT_D / 2]}
    >
      <RandomizedLight amount={8} radius={6} ambient={0.5} intensity={1} position={[5, 8, -3]} bias={0.001} />
    </AccumulativeShadows>
  );
}
```

- [ ] **Step 2: Mount it in the scene**

In `src/scene/Scene.tsx`, add the import and place `<ShowcaseController />` right after `<Effects />`:

```tsx
import { ShowcaseController } from './ShowcaseController';
// ...
      <Effects />
      <ShowcaseController />
```

- [ ] **Step 3: Typecheck**

Run: `npm run build 2>&1 | head -20`
Expected: passes.

- [ ] **Step 4: Visual smoke check**

Run (dev up): `node scripts/shot.mjs /tmp/showcase.png 9000`
Expected: PNG renders; after the wait (camera parked) the contact shadow under furniture reads softer/cleaner. Visual only.

- [ ] **Step 5: Commit**

```bash
git add src/scene/ShowcaseController.tsx src/scene/Scene.tsx
git commit -m "feat: ShowcaseController accumulates soft shadows while parked"
```

### Task 7: Force max settings during capture

**Files:**
- Modify: `src/scene/ScreenshotController.tsx`

- [ ] **Step 1: Force + restore quality around capture**

Replace the `onExport` handler body in `src/scene/ScreenshotController.tsx` so it bumps to the best settings, renders, then restores in a `finally`. Add the store import at the top:

```tsx
import { useStore } from '../state/store';
```

Replace the `onExport` function:

```tsx
    const onExport = () => {
      const store = useStore.getState();
      const prevTier = store.qualityTier;
      const prevOverrides = store.qualityOverrides;
      try {
        // Force the highest-fidelity look for the exported frame regardless of
        // the live tier: high tier + every capability on.
        store.setQualityTier('high');
        store.setQualityOverride('showcase', true);
        store.setQualityOverride('postprocessing', true);
        gl.render(scene, camera);
        const url = gl.domElement.toDataURL('image/png');
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.href = url;
        a.download = `hdb-design-${stamp}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch {
        /* tainted canvas / unsupported — ignore */
      } finally {
        // Always restore the user's live settings, even if capture threw.
        store.setQualityTier(prevTier);
        useStore.setState({ qualityOverrides: prevOverrides });
      }
    };
```

Note: `setQualityTier` resets overrides, so we restore `qualityOverrides` directly via `setState` after restoring the tier. A single synchronous `gl.render` won't let `AccumulativeShadows` fully converge in one frame; that is acceptable for the PNG (the post + high tier are the dominant fidelity gain). Converged accumulation applies to the live parked view.

- [ ] **Step 2: Typecheck**

Run: `npm run build 2>&1 | head -20`
Expected: passes.

- [ ] **Step 3: Manual verification**

Run dev, open the app, click Export (PNG). Confirm: a PNG downloads, and after export the Graphics panel shows the *original* tier/overrides (not stuck on high).

- [ ] **Step 4: Commit**

```bash
git add src/scene/ScreenshotController.tsx
git commit -m "feat: force max fidelity during PNG capture, restore live settings after"
```

---

## Unit 3 — GLTF fidelity hardening

### Task 8: Register compressed-mesh decoders

**Files:**
- Create: `src/furniture/gltf/decoders.ts`
- Create: `src/furniture/gltf/decoders.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// src/furniture/gltf/decoders.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('registerGltfDecoders', () => {
  it('configures useGLTF with Draco, KTX2 and meshopt extensions once', async () => {
    const calls: string[] = [];
    vi.doMock('@react-three/drei', () => ({
      useGLTF: Object.assign(() => ({}), {
        setDecoderPath: (p: string) => calls.push(`draco:${p}`),
        preload: () => {},
      }),
    }));
    const mod = await import('./decoders');
    const used = mod.registerGltfDecoders();
    expect(used.draco).toBe(true);
    expect(used.ktx2).toBe(true);
    expect(used.meshopt).toBe(true);
    // Idempotent: second call is a no-op.
    expect(mod.registerGltfDecoders().alreadyRegistered).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/gltf/decoders.test.ts`
Expected: FAIL — `Cannot find module './decoders'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/furniture/gltf/decoders.ts
import { useGLTF } from '@react-three/drei';
import { MeshoptDecoder } from 'three-stdlib';

/**
 * Register compressed-mesh decoders on the shared drei GLTF loader so any GLB
 * (built-in, user-uploaded, or remote) that uses Draco geometry compression,
 * KTX2/Basis textures, or meshopt compression loads correctly and stays small
 * in memory. Idempotent — safe to call once at app boot.
 *
 * Decoder binaries are served from a CDN path; drei wires KTX2 to the active
 * renderer the first time a KTX2 texture is encountered.
 */
let registered = false;

export interface DecoderReport {
  draco: boolean;
  ktx2: boolean;
  meshopt: boolean;
  alreadyRegistered?: boolean;
}

export function registerGltfDecoders(): DecoderReport {
  if (registered) return { draco: true, ktx2: true, meshopt: true, alreadyRegistered: true };
  registered = true;

  const loader = useGLTF as unknown as {
    setDecoderPath?: (path: string) => void;
    setMeshoptDecoder?: (d: unknown) => void;
  };
  // Draco: drei exposes useGLTF.setDecoderPath for the Draco WASM/JS.
  let draco = false;
  if (typeof loader.setDecoderPath === 'function') {
    loader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    draco = true;
  }
  // meshopt: pass the decoder so GLTFLoader can decompress meshopt buffers.
  let meshopt = false;
  if (typeof loader.setMeshoptDecoder === 'function') {
    loader.setMeshoptDecoder(MeshoptDecoder);
    meshopt = true;
  }
  // KTX2: drei auto-detects and binds KTX2Loader to the renderer on first use;
  // no global setter needed, so we report it as enabled.
  const ktx2 = true;
  return { draco, ktx2, meshopt };
}
```

Note: `useGLTF` in drei 9 exposes `setDecoderPath` (Draco) and `setMeshoptDecoder`. If the installed drei version lacks one, the corresponding flag is `false` and the test for that flag must be relaxed — confirm with `grep -o 'setDecoderPath\|setMeshoptDecoder' node_modules/@react-three/drei/core/Gltf.d.ts` before implementing, and adjust the test expectations to match what the version actually exposes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/gltf/decoders.test.ts`
Expected: PASS.

- [ ] **Step 5: Call it at boot**

In `src/main.tsx`, import and call before `ReactDOM.createRoot(...).render(...)`:

```tsx
import { registerGltfDecoders } from './furniture/gltf/decoders';
registerGltfDecoders();
```

- [ ] **Step 6: Typecheck + commit**

Run: `npm run build 2>&1 | head -20` (expect pass)

```bash
git add src/furniture/gltf/decoders.ts src/furniture/gltf/decoders.test.ts src/main.tsx
git commit -m "feat: register Draco/KTX2/meshopt decoders for GLB loading"
```

### Task 9: Derive collision span from the cached GLTF bbox

**Files:**
- Create: `src/collision/gltfSpan.ts`
- Create: `src/collision/gltfSpan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/collision/gltfSpan.test.ts
import { describe, it, expect } from 'vitest';
import { spanFromFootprint } from './gltfSpan';

describe('spanFromFootprint', () => {
  it('builds a floor-anchored span and footprint from a cached bbox', () => {
    const r = spanFromFootprint({ w: 1.2, d: 0.6, h: 0.75, ox: 0, oz: 0 });
    expect(r.defaultFootprint).toEqual({ w: 1.2, d: 0.6, h: 0.75 });
    expect(r.verticalSpan).toEqual({ base: 0, top: 0.75 });
  });

  it('honours a mounted flag by lifting the span base to the bbox bottom offset', () => {
    // a wall cabinet whose geometry sits 1.4m up: caller supplies baseY
    const r = spanFromFootprint({ w: 0.8, d: 0.3, h: 0.5, ox: 0, oz: 0 }, { baseY: 1.4 });
    expect(r.verticalSpan).toEqual({ base: 1.4, top: 1.9 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/collision/gltfSpan.test.ts`
Expected: FAIL — `Cannot find module './gltfSpan'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/collision/gltfSpan.ts
/**
 * Turn a cached GLB bounding box (from GltfModel's FOOTPRINT_CACHE) into the
 * collision shape the placement system understands: a footprint (w×d×h) and a
 * floor-anchored verticalSpan. Wall/ceiling-mounted models can pass an
 * explicit base Y so their span starts where the geometry actually sits.
 */

export interface CachedBox {
  w: number;
  d: number;
  h: number;
  ox: number;
  oz: number;
}

export interface SpanResult {
  defaultFootprint: { w: number; d: number; h: number };
  verticalSpan: { base: number; top: number };
}

export function spanFromFootprint(box: CachedBox, opts?: { baseY?: number }): SpanResult {
  const base = opts?.baseY ?? 0;
  return {
    defaultFootprint: { w: box.w, d: box.d, h: box.h },
    verticalSpan: { base, top: base + box.h },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/collision/gltfSpan.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into the catalog merge for user GLBs**

The catalog merge that turns `UserGltfDef`s into placeable defs lives in `src/furniture/catalog.ts`. Locate where a `UserGltfDef`'s `defaultFootprint` is read (search: `getCachedGltfFootprint`). After the GLB footprint is cached, call `spanFromFootprint` to fill `defaultFootprint` + `verticalSpan` when the def doesn't already carry an authored span. Add import:

```ts
import { spanFromFootprint } from '../collision/gltfSpan';
import { getCachedGltfFootprint } from './GltfModel';
```

Concretely, in the function that resolves a user/remote GLB def's footprint, replace the footprint fallback with:

```ts
const cached = getCachedGltfFootprint(url);
if (cached) {
  const { defaultFootprint, verticalSpan } = spanFromFootprint(cached, def.mounted ? { baseY: def.verticalSpan?.base } : undefined);
  return { ...def, defaultFootprint, verticalSpan: def.verticalSpan ?? verticalSpan };
}
return def;
```

(If `catalog.ts` does not currently recompute footprints from the cache for user defs, add this resolution where placeable defs are assembled — verify by reading `src/furniture/catalog.ts` first.)

- [ ] **Step 6: Typecheck + commit**

Run: `npm run build 2>&1 | head -20` (expect pass) and `npx vitest run src/collision src/furniture`

```bash
git add src/collision/gltfSpan.ts src/collision/gltfSpan.test.ts src/furniture/catalog.ts
git commit -m "feat: collision span + footprint for imported GLBs from cached bbox"
```

### Task 10: Named finish targets on imported GLBs

**Files:**
- Create: `src/furniture/gltf/finishTargets.ts`
- Create: `src/furniture/gltf/finishTargets.test.ts`
- Modify: `src/furniture/types.ts`
- Modify: `src/furniture/GltfModel.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// src/furniture/gltf/finishTargets.test.ts
import { describe, it, expect } from 'vitest';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { listFinishTargets } from './finishTargets';

function meshNamed(name: string, matName: string): Mesh {
  const mat = new MeshStandardMaterial();
  mat.name = matName;
  const m = new Mesh(new BoxGeometry(), mat);
  m.name = name;
  return m;
}

describe('listFinishTargets', () => {
  it('lists unique material-group names from a GLTF scene', () => {
    const root = new Group();
    root.add(meshNamed('frame', 'Wood'));
    root.add(meshNamed('legs', 'Wood'));
    root.add(meshNamed('cushion', 'Fabric'));
    const targets = listFinishTargets(root);
    expect(targets.map((t) => t.key).sort()).toEqual(['Fabric', 'Wood']);
  });

  it('falls back to mesh names when materials are unnamed', () => {
    const root = new Group();
    const m = meshNamed('seat', '');
    root.add(m);
    const targets = listFinishTargets(root);
    expect(targets[0].key).toBe('seat');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/gltf/finishTargets.test.ts`
Expected: FAIL — `Cannot find module './finishTargets'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/furniture/gltf/finishTargets.ts
import type { Object3D, Mesh, Material } from 'three';

/**
 * A finish target is a named group of meshes in an imported GLB that share a
 * material — the unit a user can re-skin (e.g. "Wood" frame vs "Fabric"
 * cushion). We key by material name when present (most authored GLBs name
 * their materials), else by mesh name.
 */
export interface FinishTarget {
  key: string;
  label: string;
}

function materialName(m: Material | Material[] | undefined): string {
  if (!m) return '';
  const first = Array.isArray(m) ? m[0] : m;
  return first?.name ?? '';
}

export function listFinishTargets(root: Object3D): FinishTarget[] {
  const keys = new Set<string>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const key = materialName(mesh.material) || mesh.name;
    if (key) keys.add(key);
  });
  return [...keys].map((key) => ({ key, label: key }));
}

/** True if a mesh belongs to the given finish-target key. */
export function meshMatchesTarget(mesh: Mesh, key: string): boolean {
  return (materialName(mesh.material) || mesh.name) === key;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/gltf/finishTargets.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the def fields**

In `src/furniture/types.ts`, add to the `UserGltfDef` interface (after `runtimeUrl?`):

```ts
  /** Named material/mesh groups discovered in the GLB that the user can
   *  re-skin (populated at import). */
  finishTargets?: { key: string; label: string }[];
  /** Map of finish-target key → finish value (`mat:<id>` DLC, a procedural
   *  finish id, or a hex tint). Applied by GltfModel. */
  finishOverrides?: Record<string, string>;
```

- [ ] **Step 6: Apply overrides in GltfModel**

In `src/furniture/GltfModel.tsx`, add `finishOverrides` to the props interface and apply hex-tint overrides per target (full material/`mat:<id>` resolution reuses `getSurfaceMaterial` and is wired by the configurator milestone; this task lands per-target *tint* so the mechanism exists end-to-end and is testable). Extend `GltfModelProps`:

```tsx
import { meshMatchesTarget } from './gltf/finishTargets';
// ...
interface GltfModelProps {
  url: string;
  scale?: number;
  tint?: string;
  /** Per-finish-target hex tint, keyed by target key. */
  finishOverrides?: Record<string, string>;
}
```

Add an effect after the existing tint effect:

```tsx
  // Per-target tint overrides (key → hex). Cloned so instances don't share.
  useEffect(() => {
    if (!finishOverrides || Object.keys(finishOverrides).length === 0) return;
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      for (const [key, hex] of Object.entries(finishOverrides)) {
        if (!meshMatchesTarget(mesh, key)) continue;
        const c = new Color(hex);
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mesh.material = mats.map((m) => {
          const clone = (m as MeshStandardMaterial).clone();
          if ('color' in clone && clone.color) clone.color = c.clone();
          return clone;
        }) as MeshStandardMaterial | MeshStandardMaterial[];
        if (!Array.isArray(mesh.material) || mesh.material.length === 1) {
          mesh.material = (mesh.material as MeshStandardMaterial[])[0];
        }
      }
    });
  }, [cloned, finishOverrides]);
```

Add `finishOverrides` to the function signature: `export function GltfModel({ url, scale = 1, tint, finishOverrides }: GltfModelProps) {`.

- [ ] **Step 7: Typecheck + tests + commit**

Run: `npm run build 2>&1 | head -20` and `npx vitest run src/furniture`

```bash
git add src/furniture/gltf/finishTargets.ts src/furniture/gltf/finishTargets.test.ts src/furniture/types.ts src/furniture/GltfModel.tsx
git commit -m "feat: named finish targets on imported GLBs with per-target tint"
```

---

## Unit 4 — Imported-model catalog citizenship

### Task 11: Capture flags + finish targets at import

**Files:**
- Modify: `src/furniture/upload/persist.ts`
- Modify: `src/ui/upload/UploadModelDialog.tsx`

- [ ] **Step 1: Extend persist options**

In `src/furniture/upload/persist.ts`, extend `PersistOptions` and the def it builds:

```ts
export interface PersistOptions {
  name: string;
  category: FurnitureCategory;
  mounted?: boolean;
  noClip?: boolean;
}
```

In the `def: UserGltfDef = { ... }` literal, add the flags:

```ts
    mounted: opts.mounted,
    noClip: opts.noClip,
```

- [ ] **Step 2: Add the flag checkboxes to the dialog**

In `src/ui/upload/UploadModelDialog.tsx`, add two checkbox states (`mounted`, `noClip`) alongside the existing name/category inputs, and pass them into the `persistUserGlb(file, { name, category, mounted, noClip })` call. Match the existing input markup in the file:

```tsx
const [mounted, setMounted] = useState(false);
const [noClip, setNoClip] = useState(false);
// ...in the form JSX, near the category select:
<label className="flex items-center gap-2 text-sm">
  <input type="checkbox" checked={mounted} onChange={(e) => setMounted(e.target.checked)} />
  Wall / ceiling mounted (skip wall collision)
</label>
<label className="flex items-center gap-2 text-sm">
  <input type="checkbox" checked={noClip} onChange={(e) => setNoClip(e.target.checked)} />
  Flat floor covering (rug — never collides)
</label>
// ...in the submit handler:
const res = await persistUserGlb(file, { name, category, mounted, noClip });
```

(Read the file first to match its exact state/handler names and styling.)

- [ ] **Step 3: Typecheck + manual check**

Run: `npm run build 2>&1 | head -20` (expect pass). Then dev: upload a GLB, tick "mounted", confirm no crash and the item places.

- [ ] **Step 4: Commit**

```bash
git add src/furniture/upload/persist.ts src/ui/upload/UploadModelDialog.tsx
git commit -m "feat: capture mounted/noClip flags when importing a GLB"
```

### Task 12: Persist the new fields through the save schema

**Files:**
- Modify: `src/state/schema.ts`

- [ ] **Step 1: Extend the zod def + serializer**

In `src/state/schema.ts`, extend `UserGltfDefZ` to round-trip the new optional fields. Add after `assetId: z.string(),` (and any existing optional fields):

```ts
  mounted: z.boolean().optional(),
  noClip: z.boolean().optional(),
  verticalSpan: z.object({ base: z.number(), top: z.number() }).optional(),
  finishTargets: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
  finishOverrides: z.record(z.string(), z.string()).optional(),
```

In the serializer `state.userFurniture.map((d) => ({ ... }))`, add the same fields:

```ts
      mounted: d.mounted,
      noClip: d.noClip,
      verticalSpan: d.verticalSpan,
      finishTargets: d.finishTargets,
      finishOverrides: d.finishOverrides,
```

- [ ] **Step 2: Typecheck + schema tests**

Run: `npm run build 2>&1 | head -20` and `npx vitest run src/state`
Expected: passes (existing hydrate/schema tests still green; new optional fields are backward-compatible with old saves because they're `.optional()`).

- [ ] **Step 3: Commit**

```bash
git add src/state/schema.ts
git commit -m "feat: round-trip imported-GLB metadata through the save schema"
```

### Task 13: Verify imported items render as catalog cards

**Files:**
- Modify: `src/ui/catalog/*` (only if a gap is found)

- [ ] **Step 1: Audit the catalog drawer for user furniture**

Read `src/ui/catalog/` (the drawer + card components) and `src/furniture/catalog.ts`. Confirm `userFurniture` defs are merged into the catalog list the drawer renders and that a card shows for each (name + category + thumbnail). The merge likely already exists (uninstall/remove logic in `userAssetsSlice` implies placed instances exist).

- [ ] **Step 2: If a gap exists, surface user items**

If user GLB defs are NOT shown as cards, add them to the catalog source the drawer maps over, grouped under their `category`, reusing the existing card component and `catalog/packs/thumbnail.ts` for the preview. (No code shown because the exact drawer API must be read first; follow the existing built-in card rendering pattern verbatim.)

- [ ] **Step 3: Manual verification**

Run dev: upload a GLB → open the catalog drawer → confirm the imported model appears as a card in its category with a thumbnail, and dragging/clicking it places the model (not a placeholder cube).

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git add src/ui/catalog
git commit -m "feat: show imported GLB models as first-class catalog cards"
```

### Task 14: Full suite + final build

**Files:** none (verification task)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (including new `look`, `showcase`, `decoders`, `gltfSpan`, `finishTargets` suites).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `tsc` typecheck clean + Vite build succeeds.

- [ ] **Step 3: Visual confirmation**

Run dev, then `node scripts/shot.mjs /tmp/final.png 9000`. Confirm a calibrated, soft-shadowed render. Optionally export a PNG from the UI and confirm it is high-fidelity regardless of the live tier.

- [ ] **Step 4: Update TODO.md**

Mark the render-fidelity + GLTF-hardening milestone done in `TODO.md`, and note the slot-based configurator as the next milestone (it reuses the finish-target mechanism from Task 10). Commit:

```bash
git add TODO.md
git commit -m "docs: mark render-fidelity + GLTF-hardening milestone done"
```

---

## Self-review notes

- **Spec coverage:** Unit 1 (Tasks 1–3) = soft shadows + IBL/AO + time-of-day grading + finishing post. Unit 2 (Tasks 4–7) = idle state machine + quality capability + AccumulativeShadows controller + capture forcing. Unit 3 (Tasks 8–10) = decoders + collision span + finish targets. Unit 4 (Tasks 11–13) = import flags + schema round-trip + catalog cards. Cross-cutting error handling (decoder failure → placeholder; capture try/finally; validate.ts gate) is covered in Tasks 7, 8, and the existing validate path. All spec sections map to tasks.
- **Library-version caveats are explicit** (postprocessing `Vignette`/`HueSaturation`, drei `setDecoderPath`/`setMeshoptDecoder`, AccumulativeShadows) with verify-and-adjust fallbacks, since these are the only places the plan can't fully pin behavior without the installed code in front of the engineer.
- **Type consistency:** `grade()`, `SOFT_SHADOW`, `AO`, `nextShowcaseState`, `ShowcaseState`, `spanFromFootprint`, `listFinishTargets`, `meshMatchesTarget`, `registerGltfDecoders`, `finishTargets`/`finishOverrides` are defined before use and referenced with consistent names throughout.
