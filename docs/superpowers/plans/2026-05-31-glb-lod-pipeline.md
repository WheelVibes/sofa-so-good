# Tiered GLB LOD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve lighter GLB variants (smaller textures + simplified geometry) on the low/medium quality tiers and keep originals on high, so rooms full of imported IKEA models stay performant on integrated GPUs.

**Architecture:** A hybrid of (A) an offline Node script that generates `-low`/`-medium` GLB variants beside each original, and (B) a runtime texture-downscale fallback for freshly-imported models with no variant yet. The app picks a variant URL by quality tier using a sibling-filename convention with a synchronous existence-probe cache, so it stays Suspense-compatible.

**Tech Stack:** TypeScript, React, Three.js, @react-three/fiber + drei (`useGLTF`), Zustand store, Vitest (happy-dom). Offline script: Node + `@gltf-transform/core` + `@gltf-transform/functions` + `sharp` + `meshoptimizer` + `draco3dgltf` (all already installed).

**Spec:** `docs/superpowers/specs/2026-05-31-glb-lod-pipeline-design.md`

---

## File structure

- **Create** `src/furniture/gltf/lod.ts` — pure URL/tier helpers + synchronous
  probe cache + async prewarm. One responsibility: "given a base URL and a tier,
  what URL should we load?"
- **Create** `src/furniture/gltf/lod.test.ts` — unit tests for the helpers.
- **Create** `src/furniture/gltf/textureBudget.ts` — `applyTextureBudget(root, tier)`
  runtime fallback (texture downscale).
- **Create** `src/furniture/gltf/textureBudget.test.ts` — unit tests.
- **Modify** `src/furniture/GltfModel.tsx` — read `qualityTier`, resolve LOD URL,
  key footprint cache by base URL, run the runtime fallback when serving an original.
- **Create** `python/scripts/optimize_glb_lod.mjs` — offline variant generator.
- **Modify** `package.json` — add `draco3dgltf` to devDependencies + an
  `optimize:glb` script (no app-runtime dependency added).

Tier constants live in `lod.ts` and are the single source of truth, imported by
both `textureBudget.ts` and the offline script.

---

## Task 1: Tier constants + URL helpers

**Files:**
- Create: `src/furniture/gltf/lod.ts`
- Test: `src/furniture/gltf/lod.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/furniture/gltf/lod.test.ts
import { describe, it, expect } from 'vitest';
import { lodSuffix, lodUrl, baseUrl, TIER_BUDGETS } from './lod';

describe('lod url helpers', () => {
  it('maps tiers to suffixes', () => {
    expect(lodSuffix('high')).toBe('');
    expect(lodSuffix('low')).toBe('-low');
    expect(lodSuffix('medium')).toBe('-medium');
  });

  it('builds variant urls preserving the .glb extension', () => {
    expect(lodUrl('/models/foo.glb', 'high')).toBe('/models/foo.glb');
    expect(lodUrl('/models/foo.glb', 'low')).toBe('/models/foo-low.glb');
    expect(lodUrl('/models/foo.glb', 'medium')).toBe('/models/foo-medium.glb');
  });

  it('handles urls with query strings', () => {
    expect(lodUrl('/m/foo.glb?v=2', 'low')).toBe('/m/foo-low.glb?v=2');
  });

  it('strips a tier suffix back to the base url', () => {
    expect(baseUrl('/models/foo-low.glb')).toBe('/models/foo.glb');
    expect(baseUrl('/models/foo-medium.glb')).toBe('/models/foo.glb');
    expect(baseUrl('/models/foo.glb')).toBe('/models/foo.glb');
  });

  it('exposes texture + geometry budgets per tier', () => {
    expect(TIER_BUDGETS.low.maxTexture).toBe(512);
    expect(TIER_BUDGETS.low.triangleRatio).toBe(0.5);
    expect(TIER_BUDGETS.medium.maxTexture).toBe(1024);
    expect(TIER_BUDGETS.medium.triangleRatio).toBe(0.75);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/gltf/lod.test.ts`
Expected: FAIL — cannot resolve module `./lod`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/furniture/gltf/lod.ts
import type { QualityTier } from '../../scene/quality';

/** Per-tier asset budgets — single source of truth for the runtime fallback
 *  and the offline `optimize_glb_lod.mjs` script. */
export const TIER_BUDGETS: Record<
  Exclude<QualityTier, 'high'>,
  { maxTexture: number; triangleRatio: number }
> = {
  low: { maxTexture: 512, triangleRatio: 0.5 },
  medium: { maxTexture: 1024, triangleRatio: 0.75 },
};

/** Filename suffix for a tier's variant. High uses the original (no suffix). */
export function lodSuffix(tier: QualityTier): string {
  return tier === 'high' ? '' : `-${tier}`;
}

/** Rewrites a `.glb` URL to its tier variant, preserving any query string. */
export function lodUrl(url: string, tier: QualityTier): string {
  const suffix = lodSuffix(tier);
  if (!suffix) return url;
  const [path, query] = splitQuery(url);
  if (!path.endsWith('.glb')) return url;
  return `${path.slice(0, -'.glb'.length)}${suffix}.glb${query}`;
}

/** Strips a known tier suffix, returning the original base URL. */
export function baseUrl(url: string): string {
  const [path, query] = splitQuery(url);
  for (const tier of ['low', 'medium'] as const) {
    const tag = `-${tier}.glb`;
    if (path.endsWith(tag)) return `${path.slice(0, -tag.length)}.glb${query}`;
  }
  return url;
}

function splitQuery(url: string): [string, string] {
  const i = url.indexOf('?');
  return i === -1 ? [url, ''] : [url.slice(0, i), url.slice(i)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/gltf/lod.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/gltf/lod.ts src/furniture/gltf/lod.test.ts
git commit -m "feat: LOD tier budgets + glb url variant helpers"
```

---

## Task 2: Synchronous probe cache + async prewarm

**Files:**
- Modify: `src/furniture/gltf/lod.ts`
- Test: `src/furniture/gltf/lod.test.ts`

Rationale: `useGLTF` needs a synchronous URL during render (it renders under
`<Suspense>`). So we resolve synchronously from a module-level cache, and populate
that cache asynchronously (eager probe) outside render via `prewarmLod`. On a cache
miss we optimistically return the base URL (never a 404), then prewarm upgrades it.

- [ ] **Step 1: Write the failing test**

```ts
// add to src/furniture/gltf/lod.test.ts
import { resolveLodUrlSync, prewarmLod, __resetLodCacheForTest } from './lod';
import { beforeEach, vi } from 'vitest';

describe('lod resolution', () => {
  beforeEach(() => __resetLodCacheForTest());

  it('returns base url on high regardless of cache', () => {
    expect(resolveLodUrlSync('/m/foo.glb', 'high')).toBe('/m/foo.glb');
  });

  it('returns base url before the variant is known to exist', () => {
    expect(resolveLodUrlSync('/m/foo.glb', 'low')).toBe('/m/foo.glb');
  });

  it('returns the variant url after prewarm confirms it exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await prewarmLod('/m/foo.glb', 'low');
    expect(resolveLodUrlSync('/m/foo.glb', 'low')).toBe('/m/foo-low.glb');
    expect(fetchMock).toHaveBeenCalledWith('/m/foo-low.glb', { method: 'HEAD' });
    vi.unstubAllGlobals();
  });

  it('keeps base url and does not re-probe after a miss', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await prewarmLod('/m/foo.glb', 'low');
    expect(resolveLodUrlSync('/m/foo.glb', 'low')).toBe('/m/foo.glb');
    await prewarmLod('/m/foo.glb', 'low'); // second call cached
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/gltf/lod.test.ts`
Expected: FAIL — `resolveLodUrlSync`/`prewarmLod` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/furniture/gltf/lod.ts

/** Probe result per resolved variant URL: true=exists, false=missing. */
const probeCache = new Map<string, boolean>();
/** In-flight probes, so concurrent callers share one request. */
const inflight = new Map<string, Promise<boolean>>();

/** Synchronous resolution for render. Returns the variant URL only when a prior
 *  prewarm confirmed it exists; otherwise the base URL (never a 404). */
export function resolveLodUrlSync(url: string, tier: QualityTier): string {
  if (tier === 'high') return url;
  const variant = lodUrl(url, tier);
  if (variant === url) return url;
  return probeCache.get(variant) === true ? variant : url;
}

/** Eagerly HEAD-probe a tier variant and cache the result. Idempotent. */
export async function prewarmLod(url: string, tier: QualityTier): Promise<void> {
  if (tier === 'high') return;
  const variant = lodUrl(url, tier);
  if (variant === url || probeCache.has(variant)) return;
  let p = inflight.get(variant);
  if (!p) {
    p = fetch(variant, { method: 'HEAD' })
      .then((r) => r.ok)
      .catch(() => false);
    inflight.set(variant, p);
  }
  const ok = await p;
  probeCache.set(variant, ok);
  inflight.delete(variant);
}

/** Test-only: clear caches between cases. */
export function __resetLodCacheForTest(): void {
  probeCache.clear();
  inflight.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/gltf/lod.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/gltf/lod.ts src/furniture/gltf/lod.test.ts
git commit -m "feat: synchronous LOD probe cache + async prewarm"
```

---

## Task 3: Runtime texture-budget fallback

**Files:**
- Create: `src/furniture/gltf/textureBudget.ts`
- Test: `src/furniture/gltf/textureBudget.test.ts`

`applyTextureBudget` walks a cloned scene's materials and downscales any texture
whose longest edge exceeds the tier cap, disposing the original. No-op on high.
Idempotent. Resizing uses an offscreen canvas (available in happy-dom and the
browser); textures whose `image` has no width/height (not yet decoded) are skipped.

- [ ] **Step 1: Write the failing test**

```ts
// src/furniture/gltf/textureBudget.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Mesh, MeshStandardMaterial, Texture, BufferGeometry } from 'three';
import { applyTextureBudget } from './textureBudget';

function meshWithTexture(w: number, h: number) {
  const tex = new Texture();
  // Minimal stand-in for an image with intrinsic size.
  tex.image = { width: w, height: h } as unknown as HTMLImageElement;
  const mat = new MeshStandardMaterial();
  mat.map = tex;
  const mesh = new Mesh(new BufferGeometry(), mat);
  return { mesh, tex, mat };
}

describe('applyTextureBudget', () => {
  it('is a no-op on high', () => {
    const { mesh, tex } = meshWithTexture(2048, 2048);
    const spy = vi.fn();
    applyTextureBudget(mesh, 'high', spy);
    expect(spy).not.toHaveBeenCalled();
    expect(tex.image.width).toBe(2048);
  });

  it('resizes textures above the tier cap', () => {
    const { mesh, tex } = meshWithTexture(2048, 1024);
    const resized: Array<[Texture, number]> = [];
    applyTextureBudget(mesh, 'low', (t, cap) => {
      resized.push([t, cap]);
      return { width: 512, height: 256 } as unknown as HTMLCanvasElement;
    });
    expect(resized).toEqual([[tex, 512]]);
    expect(tex.needsUpdate).toBe(true);
  });

  it('leaves textures already within budget alone', () => {
    const { mesh } = meshWithTexture(256, 256);
    const spy = vi.fn();
    applyTextureBudget(mesh, 'low', spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips textures with no intrinsic size', () => {
    const tex = new Texture();
    tex.image = {} as unknown as HTMLImageElement;
    const mat = new MeshStandardMaterial();
    mat.map = tex;
    const mesh = new Mesh(new BufferGeometry(), mat);
    const spy = vi.fn();
    applyTextureBudget(mesh, 'low', spy);
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/gltf/textureBudget.test.ts`
Expected: FAIL — cannot resolve `./textureBudget`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/furniture/gltf/textureBudget.ts
import type { Object3D } from 'three';
import { Mesh, type Material, type Texture } from 'three';
import type { QualityTier } from '../../scene/quality';
import { TIER_BUDGETS } from './lod';

/** Slots on a standard material that hold textures we may downscale. */
const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
] as const;

/** Resizes one texture's image to `cap` (longest edge) and returns the new
 *  image, or undefined if it can't. Injectable for tests. */
export type Resizer = (tex: Texture, cap: number) => CanvasImageSource | undefined;

const canvasResizer: Resizer = (tex, cap) => {
  const img = tex.image as { width?: number; height?: number } | undefined;
  if (!img?.width || !img?.height) return undefined;
  const scale = cap / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  return canvas;
};

/** Downscales over-budget textures in `root` in place for the given tier.
 *  No-op on high. Idempotent (textures already within budget are skipped). */
export function applyTextureBudget(
  root: Object3D,
  tier: QualityTier,
  resize: Resizer = canvasResizer,
): void {
  if (tier === 'high') return;
  const cap = TIER_BUDGETS[tier].maxTexture;
  const seen = new Set<Texture>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) shrinkMaterial(mat, cap, seen, resize);
  });
}

function shrinkMaterial(
  mat: Material,
  cap: number,
  seen: Set<Texture>,
  resize: Resizer,
): void {
  const m = mat as unknown as Record<string, Texture | null>;
  for (const slot of TEXTURE_SLOTS) {
    const tex = m[slot];
    if (!tex || seen.has(tex)) continue;
    seen.add(tex);
    const img = tex.image as { width?: number; height?: number } | undefined;
    if (!img?.width || !img?.height) continue;
    if (Math.max(img.width, img.height) <= cap) continue;
    const next = resize(tex, cap);
    if (!next) continue;
    tex.image = next;
    tex.needsUpdate = true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/gltf/textureBudget.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/gltf/textureBudget.ts src/furniture/gltf/textureBudget.test.ts
git commit -m "feat: runtime texture-budget downscale fallback"
```

---

## Task 4: Wire LOD selection into GltfModel

**Files:**
- Modify: `src/furniture/GltfModel.tsx`
- Test: `src/furniture/gltf/lod.test.ts` (footprint-key behavior is covered by Task 1's `baseUrl`; this task adds an integration assertion that the resolved URL feeds `useGLTF`).

Wiring summary (the engineer applies these edits to `GltfModel.tsx`):

1. Add imports near the top:

```ts
import { useStore } from '../state/store';
import { resolveLodUrlSync, prewarmLod, baseUrl } from './gltf/lod';
import { applyTextureBudget } from './gltf/textureBudget';
```

2. Inside `GltfModel`, before `useGLTF`, resolve the tier + URL:

```ts
const qualityTier = useStore((s) => s.qualityTier);
// Kick off the existence probe outside render; harmless if already cached.
useEffect(() => {
  void prewarmLod(url, qualityTier);
}, [url, qualityTier]);
const resolvedUrl = resolveLodUrlSync(url, qualityTier);
const servingOriginal = resolvedUrl === url;
```

3. Change `const gltf = useGLTF(url);` to `const gltf = useGLTF(resolvedUrl);`.

4. Change the footprint cache to key off the base URL so collision is identical
   across tiers (simplified geometry must not shift the cached footprint). Replace
   every `FOOTPRINT_CACHE` key `url` and the effect dep with `baseUrl(url)`:

```ts
const fpKey = baseUrl(url);
useEffect(() => {
  if (FOOTPRINT_CACHE.has(fpKey)) return;
  // ... unchanged bbox computation on `cloned` ...
  FOOTPRINT_CACHE.set(fpKey, { /* w,d,h,ox,oz unchanged */ });
}, [fpKey, cloned]);
```

   And update `getCachedGltfFootprint` callers? No — `getCachedGltfFootprint(url)`
   is called by collision code with the original URL, which now equals `fpKey`, so
   it stays correct. Verify with: `grep -rn getCachedGltfFootprint src`.

5. After the tint/finish effects, add the runtime fallback (textures only, and only
   when serving the original on a non-high tier):

```ts
useEffect(() => {
  if (servingOriginal && qualityTier !== 'high') {
    applyTextureBudget(cloned, qualityTier);
  }
}, [cloned, servingOriginal, qualityTier]);
```

- [ ] **Step 1: Write the failing test**

```ts
// add to src/furniture/gltf/lod.test.ts — guards the contract GltfModel relies on
describe('GltfModel url contract', () => {
  beforeEach(() => __resetLodCacheForTest());
  it('feeds useGLTF the base url until a variant is confirmed', () => {
    // Mirrors GltfModel: resolvedUrl starts as base, servingOriginal true.
    const resolved = resolveLodUrlSync('/m/foo.glb', 'low');
    expect(resolved).toBe('/m/foo.glb');
    expect(baseUrl(resolved)).toBe('/m/foo.glb');
  });
});
```

- [ ] **Step 2: Run test to verify it fails (or passes trivially), then apply edits**

Run: `npx vitest run src/furniture/gltf/lod.test.ts`
Expected: PASS (the helper test). Then apply edits 1–5 above to `GltfModel.tsx`.

- [ ] **Step 3: Typecheck + full test run**

Run: `npm run build` then `npx vitest run`
Expected: tsc passes; all tests green. Fix any type error from the `useStore`
selector or `applyTextureBudget` import before continuing.

- [ ] **Step 4: Verify footprint callers unaffected**

Run: `grep -rn "getCachedGltfFootprint\|FOOTPRINT_CACHE" src`
Expected: every external caller passes the original URL (== base key). Confirm
`gltfSpan.ts` / `collision/placement.ts` still resolve a footprint.

Run: `npx vitest run src/collision`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/furniture/GltfModel.tsx src/furniture/gltf/lod.test.ts
git commit -m "feat: GltfModel serves tier LOD variants + runtime fallback"
```

---

## Task 5: Offline variant generator script

**Files:**
- Create: `python/scripts/optimize_glb_lod.mjs`
- Modify: `package.json` (devDependency + script)

The script must be runnable as `node python/scripts/optimize_glb_lod.mjs [glob]`.
It reads each `.glb` under `python/scripts/ikea_sg_3d_models/` (or a path arg),
skips files that are themselves variants (`-low.glb`/`-medium.glb`), and writes
`<name>-low.glb` / `<name>-medium.glb` beside each source. Idempotent by mtime.

- [ ] **Step 1: Add the dev dependency + npm script**

Edit `package.json`: add to `devDependencies`:

```json
"draco3dgltf": "^1.5.7"
```

Add to `scripts`:

```json
"optimize:glb": "node python/scripts/optimize_glb_lod.mjs"
```

Run: `npm install`
Expected: installs without errors.

- [ ] **Step 2: Write the script**

```js
// python/scripts/optimize_glb_lod.mjs
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, prune, weld, simplify, textureCompress, draco,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  'ikea_sg_3d_models',
);
const TIERS = {
  low: { maxTexture: 512, triangleRatio: 0.5 },
  medium: { maxTexture: 1024, triangleRatio: 0.75 },
};
const VARIANT_RE = /-(low|medium)\.glb$/i;

function listGlbs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listGlbs(p));
    else if (entry.name.endsWith('.glb') && !VARIANT_RE.test(entry.name)) out.push(p);
  }
  return out;
}

async function buildIO() {
  await MeshoptSimplifier.ready;
  return new NodeIO()
    .registerExtensions(KHRONOS_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
}

async function makeVariant(io, src, tier, cfg) {
  const out = src.replace(/\.glb$/, `-${tier}.glb`);
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    return { out, skipped: true };
  }
  const doc = await io.read(src);
  await doc.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [cfg.maxTexture, cfg.maxTexture],
    }),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: cfg.triangleRatio, error: 0.001 }),
    dedup(),
    prune(),
    draco(),
  );
  await io.write(out, doc);
  return { out, skipped: false };
}

async function main() {
  const arg = process.argv[2];
  const srcs = arg
    ? (statSync(arg).isDirectory() ? listGlbs(arg) : [arg])
    : listGlbs(ROOT);
  const io = await buildIO();
  let made = 0, skipped = 0;
  for (const src of srcs) {
    for (const [tier, cfg] of Object.entries(TIERS)) {
      const r = await makeVariant(io, src, tier, cfg);
      r.skipped ? skipped++ : made++;
      if (!r.skipped) console.log(`  ${tier.padEnd(6)} ${r.out}`);
    }
  }
  console.log(`\nDone. ${made} variants written, ${skipped} up-to-date.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Smoke-run on a single model**

Run:
```bash
node python/scripts/optimize_glb_lod.mjs python/scripts/ikea_sg_3d_models/malm-bed-frame-high-90x200
ls -la python/scripts/ikea_sg_3d_models/malm-bed-frame-high-90x200/*-low.glb
```
Expected: `*-low.glb` and `*-medium.glb` appear; sizes smaller than the originals.

- [ ] **Step 4: Verify the win with the analysis harness**

Reuse the inspection approach from the assessment (a small `gltf-transform` script
computing triangles + max-texture-dim). Confirm:
- low variant: max texture dim ≤ 512, triangles ≈ 50% of original.
- medium variant: max texture dim ≤ 1024, triangles ≈ 75% of original.

If `simplify` errors on a malformed mesh, wrap the `simplify` transform in a
try/catch inside `makeVariant` that logs and proceeds without simplification
(textures still shrink — the dominant win). Add this guard only if a real file fails.

- [ ] **Step 5: Confirm variants are gitignored**

Run: `git status --porcelain python/scripts/ikea_sg_3d_models | head`
Expected: no `*-low.glb`/`*-medium.glb` show as tracked/untracked-to-commit
(the `python/` output area is already excluded from the committed repo per the
non-CC0 decision). If they appear, add `*-low.glb` and `*-medium.glb` to
`.gitignore` under that path.

- [ ] **Step 6: Commit (script + package.json only — never the GLBs)**

```bash
git add python/scripts/optimize_glb_lod.mjs package.json package-lock.json
git commit -m "feat: offline GLB LOD variant generator (low/medium)"
```

---

## Task 6: Generate the full variant set + document usage

**Files:**
- Modify: `docs/ikea-import-app-support.md` (append an "Asset optimization" section)

- [ ] **Step 1: Run the full pass**

Run: `npm run optimize:glb`
Expected: ~3–8 min; per-file variant lines; final summary. Re-running immediately
reports all up-to-date (idempotency check).

- [ ] **Step 2: Spot-check in the app**

Run: `npm run dev`, place an IKEA model, toggle quality low/medium/high in the
Graphics panel. Expected: model still renders at each tier; on low/medium it loads
the variant URL (confirm via devtools Network: `*-low.glb`/`*-medium.glb`).

- [ ] **Step 3: Document**

Append to `docs/ikea-import-app-support.md`:

```markdown
## Asset optimization (LOD variants)

Imported GLBs are heavy (avg ~30 MB texture VRAM/model). `npm run optimize:glb`
generates `-low` (≤512px textures, ~50% tris) and `-medium` (≤1024px, ~75% tris)
variants beside each original; `high` uses the original. The app selects the
variant by quality tier (`src/furniture/gltf/lod.ts`), falling back to a runtime
texture downscale (`textureBudget.ts`) for models with no variant yet. Re-run after
importing new models (idempotent by mtime). Variants stay out of the committed repo.
```

- [ ] **Step 4: Commit the doc**

```bash
git add docs/ikea-import-app-support.md
git commit -m "docs: document GLB LOD optimization workflow"
```

---

## Self-review notes

- **Spec coverage:** offline pass (Task 5/6), runtime fallback (Task 3, wired in 4),
  tier budgets (Task 1), sibling-suffix discovery + probe (Tasks 1–2), GltfModel
  integration + footprint fix (Task 4), KTX2-optional documented (Task 5 uses WebP;
  KTX2 noted in spec as config upgrade — not in v1 scope, intentionally deferred),
  testing (Tasks 1–4). All covered.
- **No placeholders:** every code step has complete code.
- **Type consistency:** `TIER_BUDGETS` shape, `QualityTier`, `lodUrl/baseUrl/`
  `resolveLodUrlSync/prewarmLod`, `applyTextureBudget(root, tier, resize?)` are used
  identically across tasks.
- **Known caveat:** `textureCompress` with `targetFormat: 'webp'` shrinks on-disk +
  VRAM via resolution; KTX2 (further VRAM cut) is deferred (no `toktx` installed).
  This matches the spec's documented-optional stance.
```
