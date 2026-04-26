# Asset Population Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the furniture and material catalogs with real CC0 assets via a build-time fetch script, plus a generic drop folder for user-supplied assets.

**Architecture:** Manifest JSON describes CC0 assets and their runtime metadata. A fetch script downloads, processes (Draco GLB / 2K KTX2 textures via `gltf-transform`), and writes outputs to `public/assets/`. An indexer walks `public/assets/` (manifest-fetched + user-dropped), merges metadata via sidecar JSON or bbox/filename fallbacks, and emits typed `generated*.ts` modules merged into the runtime catalog hooks.

**Tech Stack:** TypeScript, Node 20, `@gltf-transform/core` + `@gltf-transform/functions` + `@gltf-transform/cli` (KTX2 + Draco), `sharp` (PNG↔raw conversion for texture processing fallback), `zod` (already a dep), Vitest.

**Reference:** [Design spec](../specs/2026-04-26-asset-population-design.md)

---

## File structure (created or modified)

**Created:**
- `assets/manifest/furniture.json` — CC0 furniture entries (data only)
- `assets/manifest/materials.json` — CC0 material entries (data only)
- `scripts/asset-pipeline/manifest.ts` — zod schemas + parse helpers
- `scripts/asset-pipeline/cache.ts` — URL→cache-path hashing + download
- `scripts/asset-pipeline/process-glb.ts` — Draco compression wrapper
- `scripts/asset-pipeline/process-texture.ts` — KTX2 conversion wrapper
- `scripts/asset-pipeline/sidecar.ts` — sidecar JSON read/write + bbox derivation
- `scripts/asset-pipeline/index-assets.ts` — walks `public/assets/`, emits generated TS modules
- `scripts/asset-pipeline/emit-credits.ts` — writes `CREDITS.json` + `CREDITS.md`
- `scripts/fetch-assets.ts` — top-level CLI orchestrator
- `scripts/index-assets-cli.ts` — top-level CLI for indexer-only runs
- `scripts/asset-pipeline/__tests__/*.test.ts` — unit tests
- `scripts/asset-pipeline/__tests__/integration.test.ts` — end-to-end fixture run
- `scripts/asset-pipeline/__tests__/fixtures/manifest.json` — 2-entry fixture manifest
- `src/furniture/generatedCatalog.ts` — emitted module (committed)
- `src/materials/generatedCatalog.ts` — emitted module (committed)
- `src/ui/CreditsModal.tsx` — Credits UI
- `src/ui/inspector/SourceLine.tsx` — "Source" attribution line
- `public/assets/furniture/dropped/.gitkeep`
- `public/assets/furniture/dropped/README.md`
- `public/assets/materials/dropped/.gitkeep`
- `public/assets/materials/dropped/README.md`

**Modified:**
- `package.json` — toolchain deps, `fetch-assets` / `index-assets` scripts
- `.gitignore` — add `.asset-cache/`, `public/assets/furniture/dropped/*`, `public/assets/materials/dropped/*` (with `!.gitkeep`, `!README.md` exceptions)
- `tsconfig.node.json` — include `scripts/**`
- `src/furniture/catalog.ts` — merge `GENERATED_FURNITURE`
- `src/materials/useMaterial.ts` — merge `GENERATED_MATERIALS`
- `src/materials/builtinCatalog.ts` — drop the placeholder `texFloor` solid-fallback (real entries now come from generated catalog)
- `src/ui/inspector/InspectorPanel.tsx` — render `<SourceLine>`
- `src/ui/Toolbar.tsx` — add Credits button opening `<CreditsModal>`

---

## Conventions used throughout this plan

- Test runner: Vitest. Run a single test: `npx vitest run path/to/file.test.ts -t 'name'`. Run full unit suite: `npm test`.
- Type check: `npx tsc --noEmit`.
- Commit after each task's tests pass. Commit message format follows repo style (lowercase imperative, no prefix tags).
- Node: 20+. The fetch script uses native `fetch` and ESM.
- All scripts run via `npx tsx <path>`; install `tsx` as a dev dep in Task 1.

---

## Task 1: Install toolchain dependencies and add npm scripts

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.node.json`

- [ ] **Step 1: Install dev dependencies**

```bash
npm install --save-dev @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp tsx
```

`@gltf-transform/core` provides the GLB document model and bbox helper. `@gltf-transform/functions` provides `draco()`, `textureCompress()`, and the texture/mesh transforms. `sharp` is a fallback for raw PNG/JPG handling outside `gltf-transform`. `tsx` runs TS scripts directly without a build step.

- [ ] **Step 2: Add scripts to `package.json`**

Add to the `"scripts"` block:

```json
"fetch-assets": "tsx scripts/fetch-assets.ts",
"fetch-assets:quick": "tsx scripts/fetch-assets.ts --quick",
"index-assets": "tsx scripts/index-assets-cli.ts"
```

- [ ] **Step 3: Update `tsconfig.node.json` to include scripts**

Read the existing `tsconfig.node.json`, then add `"scripts/**/*.ts"` to its `include` array (alongside existing entries like `vite.config.ts`).

- [ ] **Step 4: Verify TypeScript still resolves**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.node.json
git commit -m "$(cat <<'EOF'
Add asset pipeline toolchain dependencies

gltf-transform for Draco + KTX2 processing; sharp as a raw-image
fallback; tsx to run TS scripts without a build step. New npm scripts
expose fetch-assets and index-assets entry points.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Manifest zod schemas

**Files:**
- Create: `scripts/asset-pipeline/manifest.ts`
- Test: `scripts/asset-pipeline/__tests__/manifest.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/asset-pipeline/__tests__/manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  furnitureManifestSchema,
  materialManifestSchema,
} from '../manifest';

describe('furnitureManifestSchema', () => {
  const ok = {
    id: 'kenney-armchair',
    source: 'kenney',
    sourceUrl: 'https://kenney.nl/assets/furniture-kit',
    downloadUrl: 'https://kenney.nl/foo.glb',
    license: 'CC0',
    attribution: 'Kenney',
    name: 'Armchair',
    category: 'seating',
    footprint: { w: 0.8, d: 0.85, h: 0.95 },
  };

  it('accepts a minimal valid entry', () => {
    expect(() => furnitureManifestSchema.parse(ok)).not.toThrow();
  });

  it('rejects an invalid category', () => {
    expect(() =>
      furnitureManifestSchema.parse({ ...ok, category: 'bogus' }),
    ).toThrow();
  });

  it('rejects a non-CC0 license', () => {
    expect(() =>
      furnitureManifestSchema.parse({ ...ok, license: 'CC-BY' }),
    ).toThrow();
  });

  it('rejects negative footprint dims', () => {
    expect(() =>
      furnitureManifestSchema.parse({
        ...ok,
        footprint: { w: -1, d: 0.5, h: 0.5 },
      }),
    ).toThrow();
  });

  it('defaults scale to 1.0 and anchor to floor-center when omitted', () => {
    const parsed = furnitureManifestSchema.parse(ok);
    expect(parsed.scale).toBe(1.0);
    expect(parsed.anchor).toBe('floor-center');
  });
});

describe('materialManifestSchema', () => {
  const ok = {
    id: 'floor-wood-oak',
    source: 'polyhaven',
    sourceUrl: 'https://polyhaven.com/a/wood_floor_deck',
    downloads: {
      albedo: 'https://polyhaven.com/.../diff.jpg',
      normal: 'https://polyhaven.com/.../nor.jpg',
      rough: 'https://polyhaven.com/.../rough.jpg',
    },
    license: 'CC0',
    attribution: 'Poly Haven',
    name: 'Oak planks',
    category: 'floor',
    uvScale: [1.5, 1.5],
  };

  it('accepts a minimal valid entry', () => {
    expect(() => materialManifestSchema.parse(ok)).not.toThrow();
  });

  it('requires albedo download', () => {
    const { downloads, ...rest } = ok;
    expect(() =>
      materialManifestSchema.parse({
        ...rest,
        downloads: { normal: downloads.normal },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests, expect fails**

```bash
npx vitest run scripts/asset-pipeline/__tests__/manifest.test.ts
```

Expected: fails with "Cannot find module '../manifest'".

- [ ] **Step 3: Implement `scripts/asset-pipeline/manifest.ts`**

```ts
import { z } from 'zod';

const FURNITURE_CATEGORIES = [
  'beds',
  'seating',
  'tables',
  'storage',
  'kitchen',
  'lighting',
  'decor',
] as const;

export const furnitureManifestSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['kenney', 'polyhaven', 'quaternius', 'ambientcg']),
  sourceUrl: z.string().url(),
  downloadUrl: z.string().url(),
  license: z.literal('CC0'),
  attribution: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(FURNITURE_CATEGORIES),
  footprint: z.object({
    w: z.number().positive(),
    d: z.number().positive(),
    h: z.number().positive(),
  }),
  scale: z.number().positive().default(1.0),
  anchor: z.enum(['floor-center', 'origin']).default('floor-center'),
});

export type FurnitureManifestEntry = z.infer<typeof furnitureManifestSchema>;

export const materialManifestSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['polyhaven', 'ambientcg']),
  sourceUrl: z.string().url(),
  downloads: z.object({
    albedo: z.string().url(),
    normal: z.string().url().optional(),
    rough: z.string().url().optional(),
    ao: z.string().url().optional(),
  }),
  license: z.literal('CC0'),
  attribution: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['floor', 'wall']),
  uvScale: z.tuple([z.number().positive(), z.number().positive()]),
});

export type MaterialManifestEntry = z.infer<typeof materialManifestSchema>;

export const furnitureManifestFile = z.array(furnitureManifestSchema);
export const materialManifestFile = z.array(materialManifestSchema);
```

- [ ] **Step 4: Run tests, expect passes**

```bash
npx vitest run scripts/asset-pipeline/__tests__/manifest.test.ts
```

Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/asset-pipeline/manifest.ts scripts/asset-pipeline/__tests__/manifest.test.ts
git commit -m "$(cat <<'EOF'
Add zod schemas for furniture and material asset manifests

Validates manifest entries against fixed source/category/license enums,
positive footprint dims, and required URL fields. Defaults scale to 1.0
and anchor to floor-center.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Asset cache and downloader

**Files:**
- Create: `scripts/asset-pipeline/cache.ts`
- Test: `scripts/asset-pipeline/__tests__/cache.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/asset-pipeline/__tests__/cache.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachePathFor, downloadToCache } from '../cache';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'asset-cache-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('cachePathFor', () => {
  it('produces a stable path from a URL', () => {
    const a = cachePathFor(tmp, 'https://example.com/foo.glb');
    const b = cachePathFor(tmp, 'https://example.com/foo.glb');
    expect(a).toBe(b);
    expect(a.startsWith(tmp)).toBe(true);
    expect(a.endsWith('foo.glb')).toBe(true);
  });

  it('produces different paths for different URLs', () => {
    expect(cachePathFor(tmp, 'https://a.com/x.glb')).not.toBe(
      cachePathFor(tmp, 'https://b.com/x.glb'),
    );
  });
});

describe('downloadToCache', () => {
  it('skips download when the cache file already exists', async () => {
    const url = 'https://example.com/cached.glb';
    const path = cachePathFor(tmp, url);
    const dir = path.substring(0, path.lastIndexOf('/'));
    require('node:fs').mkdirSync(dir, { recursive: true });
    writeFileSync(path, 'cached-bytes');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await downloadToCache(tmp, url);
    expect(result).toBe(path);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readFileSync(path, 'utf8')).toBe('cached-bytes');
  });

  it('downloads when the cache is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('downloaded').buffer,
    })));
    const url = 'https://example.com/new.glb';
    const path = await downloadToCache(tmp, url);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('downloaded');
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(downloadToCache(tmp, 'https://example.com/missing.glb'))
      .rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 2: Run tests, expect fails**

```bash
npx vitest run scripts/asset-pipeline/__tests__/cache.test.ts
```

Expected: fails with "Cannot find module '../cache'".

- [ ] **Step 3: Implement `scripts/asset-pipeline/cache.ts`**

```ts
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

/**
 * Returns a deterministic path under `cacheRoot` for a given source URL.
 * Layout: <cacheRoot>/<sha256(url).slice(0,16)>/<basename(url)>
 */
export function cachePathFor(cacheRoot: string, url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  const name = basename(new URL(url).pathname) || 'asset.bin';
  return join(cacheRoot, hash, name);
}

export async function downloadToCache(
  cacheRoot: string,
  url: string,
): Promise<string> {
  const path = cachePathFor(cacheRoot, url);
  if (existsSync(path)) return path;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${url} (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return path;
}
```

- [ ] **Step 4: Run tests, expect passes**

```bash
npx vitest run scripts/asset-pipeline/__tests__/cache.test.ts
```

Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/asset-pipeline/cache.ts scripts/asset-pipeline/__tests__/cache.test.ts
git commit -m "$(cat <<'EOF'
Add URL-hashed asset cache and idempotent downloader

Cache layout is <root>/<sha256-prefix>/<basename>; downloadToCache
short-circuits on existing files so re-runs are free.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: GLB processing (Draco compression)

**Files:**
- Create: `scripts/asset-pipeline/process-glb.ts`
- Test: `scripts/asset-pipeline/__tests__/process-glb.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/asset-pipeline/__tests__/process-glb.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processGlb, deriveBoundingBox } from '../process-glb';

let tmp: string;
const FIXTURE_GLB = 'public/assets/furniture/demo-duck.glb';

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'glb-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('processGlb', () => {
  it('writes an output GLB and (in --compress mode) shrinks it', async () => {
    const out = join(tmp, 'out.glb');
    await processGlb(FIXTURE_GLB, out, { compress: true });
    expect(existsSync(out)).toBe(true);
    const inSize = statSync(FIXTURE_GLB).size;
    const outSize = statSync(out).size;
    // Draco-compressed should be no larger than source for non-trivial meshes;
    // the demo duck is tiny so we just assert <=.
    expect(outSize).toBeLessThanOrEqual(inSize);
  });

  it('quick mode just copies the file', async () => {
    const out = join(tmp, 'out.glb');
    await processGlb(FIXTURE_GLB, out, { compress: false });
    expect(statSync(out).size).toBe(statSync(FIXTURE_GLB).size);
  });
});

describe('deriveBoundingBox', () => {
  it('returns a positive bbox for the demo duck', async () => {
    const bbox = await deriveBoundingBox(FIXTURE_GLB);
    expect(bbox.w).toBeGreaterThan(0);
    expect(bbox.d).toBeGreaterThan(0);
    expect(bbox.h).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests, expect fails**

```bash
npx vitest run scripts/asset-pipeline/__tests__/process-glb.test.ts
```

Expected: fails (module missing).

- [ ] **Step 3: Implement `scripts/asset-pipeline/process-glb.ts`**

```ts
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { draco } from '@gltf-transform/functions';
import { getBounds } from '@gltf-transform/core';

export interface ProcessGlbOptions {
  /** When true, run Draco geometry compression. When false, just copy. */
  compress: boolean;
}

const io = new NodeIO();

export async function processGlb(
  inputPath: string,
  outputPath: string,
  opts: ProcessGlbOptions,
): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true });
  if (!opts.compress) {
    copyFileSync(inputPath, outputPath);
    return;
  }
  const doc = await io.read(inputPath);
  await doc.transform(draco());
  await io.write(outputPath, doc);
}

export async function deriveBoundingBox(
  glbPath: string,
): Promise<{ w: number; d: number; h: number }> {
  const doc = await io.read(glbPath);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error(`No scene in ${glbPath}`);
  const bounds = getBounds(scene);
  return {
    w: Math.max(bounds.max[0] - bounds.min[0], 0.001),
    h: Math.max(bounds.max[1] - bounds.min[1], 0.001),
    d: Math.max(bounds.max[2] - bounds.min[2], 0.001),
  };
}
```

Note: `getBounds` is exported from `@gltf-transform/core`. If a different version of the package exports it elsewhere, search node_modules and adjust the import path; the function name is stable.

- [ ] **Step 4: Run tests, expect passes**

```bash
npx vitest run scripts/asset-pipeline/__tests__/process-glb.test.ts
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/asset-pipeline/process-glb.ts scripts/asset-pipeline/__tests__/process-glb.test.ts
git commit -m "$(cat <<'EOF'
Add GLB Draco compression and bbox derivation helpers

processGlb runs gltf-transform draco() in compress mode or copies the
file in quick mode. deriveBoundingBox returns w/h/d in metres for
sidecar-fallback footprints.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Texture processing (KTX2 conversion)

**Files:**
- Create: `scripts/asset-pipeline/process-texture.ts`
- Test: `scripts/asset-pipeline/__tests__/process-texture.test.ts`

- [ ] **Step 1: Write a tiny PNG fixture and the failing test**

Create `scripts/asset-pipeline/__tests__/process-texture.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { processTexture } from '../process-texture';

let tmp: string;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'tex-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function makePng(path: string, size = 8): Promise<void> {
  const buf = await sharp({
    create: { width: size, height: size, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  writeFileSync(path, buf);
}

describe('processTexture', () => {
  it('quick mode copies PNG to output unchanged', async () => {
    const src = join(tmp, 'src.png');
    const dst = join(tmp, 'out.png');
    await makePng(src);
    await processTexture(src, dst, { compress: false, maxSize: 2048 });
    expect(statSync(dst).size).toBe(statSync(src).size);
  });

  it('compress mode emits a .ktx2 sibling', async () => {
    const src = join(tmp, 'src.png');
    const dst = join(tmp, 'out.ktx2');
    await makePng(src, 64);
    await processTexture(src, dst, { compress: true, maxSize: 2048 });
    expect(existsSync(dst)).toBe(true);
  });

  it('clamps dimensions to maxSize', async () => {
    const src = join(tmp, 'src.png');
    const dstPng = join(tmp, 'out.png');
    await makePng(src, 256);
    await processTexture(src, dstPng, { compress: false, maxSize: 64 });
    const meta = await sharp(dstPng).metadata();
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(64);
  });
});
```

- [ ] **Step 2: Run tests, expect fails**

```bash
npx vitest run scripts/asset-pipeline/__tests__/process-texture.test.ts
```

Expected: module-missing failure.

- [ ] **Step 3: Implement `scripts/asset-pipeline/process-texture.ts`**

KTX2 production path: build a tiny single-texture GLB in memory via `gltf-transform`, run `textureCompress({ targetFormat: 'ktx2' })`, then strip the texture out and write its bytes. This avoids requiring `toktx` as a separate binary.

```ts
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { textureCompress } from '@gltf-transform/functions';

export interface ProcessTextureOptions {
  compress: boolean;
  /** Max edge length in pixels. Source larger than this is downscaled. */
  maxSize: number;
}

const io = new NodeIO();

async function clampSize(
  inputPath: string,
  maxSize: number,
): Promise<{ buf: Buffer; mime: 'image/png' | 'image/jpeg' }> {
  const meta = await sharp(inputPath).metadata();
  const w = meta.width ?? maxSize;
  const h = meta.height ?? maxSize;
  const longest = Math.max(w, h);
  let pipeline = sharp(inputPath);
  if (longest > maxSize) {
    pipeline = pipeline.resize({ width: w >= h ? maxSize : undefined, height: h > w ? maxSize : undefined });
  }
  const ext = inputPath.toLowerCase().endsWith('.jpg') || inputPath.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png';
  const buf = await (ext === 'jpeg' ? pipeline.jpeg() : pipeline.png()).toBuffer();
  return { buf, mime: ext === 'jpeg' ? 'image/jpeg' : 'image/png' };
}

export async function processTexture(
  inputPath: string,
  outputPath: string,
  opts: ProcessTextureOptions,
): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true });
  if (!opts.compress) {
    // Just clamp size; preserve format.
    const { buf } = await clampSize(inputPath, opts.maxSize);
    writeFileSync(outputPath, buf);
    return;
  }
  // Compress to KTX2 by routing through a single-texture gltf-transform doc.
  const { buf, mime } = await clampSize(inputPath, opts.maxSize);
  const doc = new Document();
  const tex = doc.createTexture('t').setImage(buf).setMimeType(mime);
  await doc.transform(textureCompress({ targetFormat: 'ktx2' }));
  const out = tex.getImage();
  if (!out) throw new Error('textureCompress produced no image');
  writeFileSync(outputPath, Buffer.from(out));
}
```

- [ ] **Step 4: Run tests, expect passes**

```bash
npx vitest run scripts/asset-pipeline/__tests__/process-texture.test.ts
```

Expected: 3 pass. If `textureCompress({ targetFormat: 'ktx2' })` fails because the system lacks the underlying encoder, surface the error message and update the function to suggest `npm install --save-dev @gltf-transform/cli` (whose binaries include the encoder); rerun the test.

- [ ] **Step 5: Commit**

```bash
git add scripts/asset-pipeline/process-texture.ts scripts/asset-pipeline/__tests__/process-texture.test.ts
git commit -m "$(cat <<'EOF'
Add texture processing: 2K clamp and KTX2 compression

processTexture downscales to maxSize via sharp, then optionally routes
through a single-texture gltf-transform document to emit KTX2 bytes.
Quick mode skips compression and writes the clamped source format.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Sidecar I/O and metadata merge

**Files:**
- Create: `scripts/asset-pipeline/sidecar.ts`
- Test: `scripts/asset-pipeline/__tests__/sidecar.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/asset-pipeline/__tests__/sidecar.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar, readSidecar, resolveFurnitureMetadata } from '../sidecar';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'sidecar-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('writeSidecar / readSidecar', () => {
  it('round-trips JSON', () => {
    const path = join(tmp, 'foo.glb');
    writeFileSync(path, 'glb-bytes');
    writeSidecar(path, { id: 'foo', category: 'decor' });
    expect(readSidecar(path)).toEqual({ id: 'foo', category: 'decor' });
  });

  it('returns null when no sidecar exists', () => {
    expect(readSidecar(join(tmp, 'nope.glb'))).toBeNull();
  });
});

describe('resolveFurnitureMetadata', () => {
  it('uses sidecar values when present', async () => {
    const meta = await resolveFurnitureMetadata({
      glbPath: 'unused-when-sidecar-present',
      sidecar: {
        id: 'side-id',
        name: 'Side Name',
        category: 'seating',
        footprint: { w: 1, d: 1, h: 1 },
        scale: 1.0,
        anchor: 'floor-center',
        license: 'CC0',
        attribution: 'Test',
        sourceUrl: 'https://example.com',
      },
      bboxFn: async () => ({ w: 99, d: 99, h: 99 }),
    });
    expect(meta.id).toBe('side-id');
    expect(meta.footprint.w).toBe(1);
  });

  it('derives id and footprint from filename + bbox when sidecar is missing', async () => {
    const meta = await resolveFurnitureMetadata({
      glbPath: '/tmp/dropped/cool-couch.glb',
      sidecar: null,
      bboxFn: async () => ({ w: 2.1, d: 0.9, h: 0.85 }),
    });
    expect(meta.id).toBe('dropped-cool-couch');
    expect(meta.name).toBe('Cool Couch');
    expect(meta.category).toBe('decor');
    expect(meta.footprint).toEqual({ w: 2.1, d: 0.9, h: 0.85 });
    expect(meta.scale).toBe(1.0);
    expect(meta.attribution).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, expect fails**

```bash
npx vitest run scripts/asset-pipeline/__tests__/sidecar.test.ts
```

- [ ] **Step 3: Implement `scripts/asset-pipeline/sidecar.ts`**

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

export interface FurnitureSidecar {
  id: string;
  name: string;
  category: 'beds' | 'seating' | 'tables' | 'storage' | 'kitchen' | 'lighting' | 'decor';
  footprint: { w: number; d: number; h: number };
  scale: number;
  anchor: 'floor-center' | 'origin';
  license?: 'CC0';
  attribution?: string;
  sourceUrl?: string;
}

export interface MaterialSidecar {
  id: string;
  name: string;
  category: 'floor' | 'wall';
  uvScale: [number, number];
  channels: {
    albedo: string;
    normal?: string;
    rough?: string;
    ao?: string;
  };
  license?: 'CC0';
  attribution?: string;
  sourceUrl?: string;
}

function sidecarPath(filePath: string): string {
  return `${filePath}.json`;
}

export function writeSidecar(filePath: string, data: object): void {
  writeFileSync(sidecarPath(filePath), JSON.stringify(data, null, 2));
}

export function readSidecar<T>(filePath: string): T | null {
  const p = sidecarPath(filePath);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ');
}

export interface ResolveFurnitureArgs {
  glbPath: string;
  sidecar: FurnitureSidecar | null;
  bboxFn: (path: string) => Promise<{ w: number; d: number; h: number }>;
}

export async function resolveFurnitureMetadata(
  args: ResolveFurnitureArgs,
): Promise<FurnitureSidecar> {
  if (args.sidecar) return args.sidecar;
  const filename = basename(args.glbPath).replace(/\.glb$/i, '');
  const id = `dropped-${filename}`;
  const bbox = await args.bboxFn(args.glbPath);
  return {
    id,
    name: titleCase(filename),
    category: 'decor',
    footprint: bbox,
    scale: 1.0,
    anchor: 'floor-center',
  };
}
```

- [ ] **Step 4: Run tests, expect passes**

```bash
npx vitest run scripts/asset-pipeline/__tests__/sidecar.test.ts
```

Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/asset-pipeline/sidecar.ts scripts/asset-pipeline/__tests__/sidecar.test.ts
git commit -m "$(cat <<'EOF'
Add sidecar JSON I/O and furniture metadata fallback

Sidecar values win when present; otherwise the resolver derives id and
name from the filename and footprint from a caller-supplied bbox fn.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Indexer (walk public/assets, emit generated TS modules)

**Files:**
- Create: `scripts/asset-pipeline/index-assets.ts`
- Test: `scripts/asset-pipeline/__tests__/index-assets.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/asset-pipeline/__tests__/index-assets.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexAssets } from '../index-assets';
import { writeSidecar } from '../sidecar';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'index-test-'));
  mkdirSync(join(root, 'public/assets/furniture'), { recursive: true });
  mkdirSync(join(root, 'public/assets/materials'), { recursive: true });
  mkdirSync(join(root, 'src/furniture'), { recursive: true });
  mkdirSync(join(root, 'src/materials'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('indexAssets', () => {
  it('emits a TS module containing entries for each GLB', async () => {
    // Copy a real demo GLB so bbox derivation has something to chew on.
    const glb = join(root, 'public/assets/furniture/demo-duck.glb');
    copyFileSync('public/assets/furniture/demo-duck.glb', glb);
    writeSidecar(glb, {
      id: 'demo-duck',
      name: 'Demo duck',
      category: 'decor',
      footprint: { w: 0.6, d: 0.6, h: 1.0 },
      scale: 0.005,
      anchor: 'floor-center',
      license: 'CC0',
      attribution: 'Khronos',
      sourceUrl: 'https://github.com/KhronosGroup/glTF-Sample-Models',
    });
    await indexAssets({ projectRoot: root });
    const out = readFileSync(join(root, 'src/furniture/generatedCatalog.ts'), 'utf8');
    expect(out).toContain("id: 'demo-duck'");
    expect(out).toContain("category: 'decor'");
    expect(out).toContain("url: '/assets/furniture/demo-duck.glb'");
    expect(out).toContain("attribution: 'Khronos'");
  });

  it('throws on duplicate ids', async () => {
    const a = join(root, 'public/assets/furniture/a.glb');
    const b = join(root, 'public/assets/furniture/b.glb');
    copyFileSync('public/assets/furniture/demo-duck.glb', a);
    copyFileSync('public/assets/furniture/demo-duck.glb', b);
    const sidecar = {
      id: 'same-id',
      name: 'X',
      category: 'decor' as const,
      footprint: { w: 1, d: 1, h: 1 },
      scale: 1.0,
      anchor: 'floor-center' as const,
    };
    writeSidecar(a, sidecar);
    writeSidecar(b, sidecar);
    await expect(indexAssets({ projectRoot: root })).rejects.toThrow(/duplicate id/);
  });

  it('emits an empty catalog when no assets exist', async () => {
    await indexAssets({ projectRoot: root });
    const out = readFileSync(join(root, 'src/furniture/generatedCatalog.ts'), 'utf8');
    expect(out).toContain('export const GENERATED_FURNITURE');
    expect(out).toContain('[]');
  });
});
```

- [ ] **Step 2: Run tests, expect fails**

```bash
npx vitest run scripts/asset-pipeline/__tests__/index-assets.test.ts
```

- [ ] **Step 3: Implement `scripts/asset-pipeline/index-assets.ts`**

```ts
import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  readSidecar,
  resolveFurnitureMetadata,
  type FurnitureSidecar,
  type MaterialSidecar,
} from './sidecar';
import { deriveBoundingBox } from './process-glb';

export interface IndexOptions {
  projectRoot: string;
}

function walk(dir: string, ext: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p, ext));
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

function tsLiteralFurniture(meta: FurnitureSidecar, urlPath: string): string {
  const attrLine = meta.attribution ? `    attribution: ${JSON.stringify(meta.attribution)},\n` : '';
  const srcLine = meta.sourceUrl ? `    sourceUrl: ${JSON.stringify(meta.sourceUrl)},\n` : '';
  return `  {
    kind: 'gltf',
    id: ${JSON.stringify(meta.id)},
    name: ${JSON.stringify(meta.name)},
    category: ${JSON.stringify(meta.category)},
    source: 'builtin',
    url: ${JSON.stringify(urlPath)},
    license: 'CC0',
${attrLine}${srcLine}    defaultFootprint: { w: ${meta.footprint.w}, d: ${meta.footprint.d}, h: ${meta.footprint.h} },
    scale: ${meta.scale},
  },\n`;
}

function tsLiteralMaterial(meta: MaterialSidecar, baseUrl: string): string {
  const albedo = `${baseUrl}/${meta.channels.albedo}`;
  const normal = meta.channels.normal ? `\n      normal: ${JSON.stringify(`${baseUrl}/${meta.channels.normal}`)},` : '';
  const rough = meta.channels.rough ? `\n      roughness: ${JSON.stringify(`${baseUrl}/${meta.channels.rough}`)},` : '';
  const ao = meta.channels.ao ? `\n      ao: ${JSON.stringify(`${baseUrl}/${meta.channels.ao}`)},` : '';
  return `  {
    id: ${JSON.stringify(meta.id)},
    name: ${JSON.stringify(meta.name)},
    category: ${JSON.stringify(meta.category)},
    kind: 'textured',
    source: 'polyhaven',
    swatch: '#888888',
    sourceUrl: ${JSON.stringify('')},
    textures: {
      albedo: ${JSON.stringify(albedo)},${normal}${rough}${ao}
    },
    uvScale: [${meta.uvScale[0]}, ${meta.uvScale[1]}],
  },\n`;
}

export async function indexAssets(opts: IndexOptions): Promise<void> {
  const root = opts.projectRoot;
  const furnitureDir = join(root, 'public/assets/furniture');
  const materialsDir = join(root, 'public/assets/materials');

  const glbs = walk(furnitureDir, /\.glb$/i);
  const seen = new Set<string>();
  const furnitureLits: string[] = [];
  for (const glb of glbs) {
    const sidecar = readSidecar<FurnitureSidecar>(glb);
    const meta = await resolveFurnitureMetadata({
      glbPath: glb,
      sidecar,
      bboxFn: deriveBoundingBox,
    });
    if (seen.has(meta.id)) {
      throw new Error(`duplicate id "${meta.id}" in ${glb}`);
    }
    seen.add(meta.id);
    const url = '/' + relative(join(root, 'public'), glb).replace(/\\/g, '/');
    furnitureLits.push(tsLiteralFurniture(meta, url));
  }

  const materialDirs = existsSync(materialsDir)
    ? readdirSync(materialsDir).map((n) => join(materialsDir, n)).filter((p) => statSync(p).isDirectory())
    : [];
  const matSeen = new Set<string>();
  const materialLits: string[] = [];
  for (const md of materialDirs) {
    const sidecarPath = join(md, 'material.json');
    if (!existsSync(sidecarPath)) continue;
    const meta = readSidecar<MaterialSidecar>(join(md, 'material'));
    if (!meta) continue;
    if (matSeen.has(meta.id)) throw new Error(`duplicate id "${meta.id}" in ${md}`);
    matSeen.add(meta.id);
    const baseUrl = '/' + relative(join(root, 'public'), md).replace(/\\/g, '/');
    materialLits.push(tsLiteralMaterial(meta, baseUrl));
  }

  mkdirSync(join(root, 'src/furniture'), { recursive: true });
  mkdirSync(join(root, 'src/materials'), { recursive: true });

  const furnitureModule = `// AUTO-GENERATED by scripts/asset-pipeline/index-assets.ts. Do not edit.
import type { FurnitureDef } from './types';

export const GENERATED_FURNITURE: FurnitureDef[] = [
${furnitureLits.join('')}];
`;
  const materialModule = `// AUTO-GENERATED by scripts/asset-pipeline/index-assets.ts. Do not edit.
import type { MaterialDef } from './types';

export const GENERATED_MATERIALS: MaterialDef[] = [
${materialLits.join('')}];
`;

  writeFileSync(join(root, 'src/furniture/generatedCatalog.ts'), furnitureModule);
  writeFileSync(join(root, 'src/materials/generatedCatalog.ts'), materialModule);
}
```

- [ ] **Step 4: Run tests, expect passes**

```bash
npx vitest run scripts/asset-pipeline/__tests__/index-assets.test.ts
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/asset-pipeline/index-assets.ts scripts/asset-pipeline/__tests__/index-assets.test.ts
git commit -m "$(cat <<'EOF'
Add asset indexer that emits generated catalog TS modules

Walks public/assets, reads sidecars or derives bbox-based fallbacks,
writes typed GENERATED_FURNITURE / GENERATED_MATERIALS arrays to
src/{furniture,materials}/generatedCatalog.ts. Hard-errors on id
collisions across either catalog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Credits emission

**Files:**
- Create: `scripts/asset-pipeline/emit-credits.ts`
- Test: `scripts/asset-pipeline/__tests__/emit-credits.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitCredits } from '../emit-credits';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'credits-test-'));
  mkdirSync(join(root, 'public/assets'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('emitCredits', () => {
  it('writes CREDITS.json and CREDITS.md from manifest entries', () => {
    emitCredits({
      projectRoot: root,
      furniture: [
        {
          id: 'kenney-armchair',
          name: 'Armchair',
          attribution: 'Kenney',
          sourceUrl: 'https://kenney.nl',
          license: 'CC0',
        },
      ],
      materials: [
        {
          id: 'floor-wood-oak',
          name: 'Oak planks',
          attribution: 'Poly Haven',
          sourceUrl: 'https://polyhaven.com/a/wood_floor_deck',
          license: 'CC0',
        },
      ],
    });
    const json = JSON.parse(readFileSync(join(root, 'public/assets/CREDITS.json'), 'utf8'));
    expect(json.furniture[0].id).toBe('kenney-armchair');
    expect(json.materials[0].id).toBe('floor-wood-oak');
    const md = readFileSync(join(root, 'CREDITS.md'), 'utf8');
    expect(md).toContain('Kenney');
    expect(md).toContain('Poly Haven');
    expect(md).toContain('CC0');
  });
});
```

- [ ] **Step 2: Run tests, expect fails**

```bash
npx vitest run scripts/asset-pipeline/__tests__/emit-credits.test.ts
```

- [ ] **Step 3: Implement `scripts/asset-pipeline/emit-credits.ts`**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CreditEntry {
  id: string;
  name: string;
  attribution: string;
  sourceUrl: string;
  license: 'CC0';
}

export interface EmitCreditsArgs {
  projectRoot: string;
  furniture: CreditEntry[];
  materials: CreditEntry[];
}

export function emitCredits(args: EmitCreditsArgs): void {
  const json = { furniture: args.furniture, materials: args.materials };
  mkdirSync(join(args.projectRoot, 'public/assets'), { recursive: true });
  writeFileSync(
    join(args.projectRoot, 'public/assets/CREDITS.json'),
    JSON.stringify(json, null, 2),
  );

  const lines: string[] = ['# Asset credits', '', 'All bundled assets are CC0.', ''];
  if (args.furniture.length) {
    lines.push('## Furniture', '');
    for (const e of args.furniture) {
      lines.push(`- **${e.name}** (${e.id}) — ${e.attribution}, [source](${e.sourceUrl}), ${e.license}`);
    }
    lines.push('');
  }
  if (args.materials.length) {
    lines.push('## Materials', '');
    for (const e of args.materials) {
      lines.push(`- **${e.name}** (${e.id}) — ${e.attribution}, [source](${e.sourceUrl}), ${e.license}`);
    }
    lines.push('');
  }
  writeFileSync(join(args.projectRoot, 'CREDITS.md'), lines.join('\n'));
}
```

- [ ] **Step 4: Run tests, expect passes**

```bash
npx vitest run scripts/asset-pipeline/__tests__/emit-credits.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add scripts/asset-pipeline/emit-credits.ts scripts/asset-pipeline/__tests__/emit-credits.test.ts
git commit -m "$(cat <<'EOF'
Add CREDITS.json + CREDITS.md emission

Single function takes furniture and material credit entries and writes
both the runtime-fetched JSON (under public/assets/) and a human-
readable CREDITS.md at the repo root.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Top-level CLIs (fetch-assets, index-assets-cli)

**Files:**
- Create: `scripts/fetch-assets.ts`
- Create: `scripts/index-assets-cli.ts`

- [ ] **Step 1: Implement `scripts/index-assets-cli.ts`**

```ts
import { indexAssets } from './asset-pipeline/index-assets';

const projectRoot = process.cwd();
indexAssets({ projectRoot }).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Implement `scripts/fetch-assets.ts`**

```ts
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  furnitureManifestFile,
  materialManifestFile,
  type FurnitureManifestEntry,
  type MaterialManifestEntry,
} from './asset-pipeline/manifest';
import { downloadToCache } from './asset-pipeline/cache';
import { processGlb } from './asset-pipeline/process-glb';
import { processTexture } from './asset-pipeline/process-texture';
import { writeSidecar } from './asset-pipeline/sidecar';
import { indexAssets } from './asset-pipeline/index-assets';
import { emitCredits } from './asset-pipeline/emit-credits';

const args = new Set(process.argv.slice(2));
const QUICK = args.has('--quick');
const projectRoot = process.cwd();
const cacheRoot = join(projectRoot, '.asset-cache');

async function fetchFurniture(entries: FurnitureManifestEntry[]): Promise<void> {
  for (const e of entries) {
    console.log(`[furniture] ${e.id}`);
    const cached = await downloadToCache(cacheRoot, e.downloadUrl);
    const out = join(projectRoot, 'public/assets/furniture', `${e.id}.glb`);
    await processGlb(cached, out, { compress: !QUICK });
    writeSidecar(out, {
      id: e.id,
      name: e.name,
      category: e.category,
      footprint: e.footprint,
      scale: e.scale,
      anchor: e.anchor,
      license: e.license,
      attribution: e.attribution,
      sourceUrl: e.sourceUrl,
    });
  }
}

async function fetchMaterials(entries: MaterialManifestEntry[]): Promise<void> {
  for (const e of entries) {
    console.log(`[material] ${e.id}`);
    const dir = join(projectRoot, 'public/assets/materials', e.id);
    mkdirSync(dir, { recursive: true });
    const channels: Record<string, string> = {};
    for (const [key, url] of Object.entries(e.downloads)) {
      if (!url) continue;
      const cached = await downloadToCache(cacheRoot, url);
      const ext = QUICK ? cached.split('.').pop() ?? 'png' : 'ktx2';
      const outName = `${key}.${ext}`;
      await processTexture(cached, join(dir, outName), {
        compress: !QUICK,
        maxSize: 2048,
      });
      channels[key] = outName;
    }
    writeSidecar(join(dir, 'material'), {
      id: e.id,
      name: e.name,
      category: e.category,
      uvScale: e.uvScale,
      channels,
      license: e.license,
      attribution: e.attribution,
      sourceUrl: e.sourceUrl,
    });
  }
}

async function main(): Promise<void> {
  const furniturePath = join(projectRoot, 'assets/manifest/furniture.json');
  const materialPath = join(projectRoot, 'assets/manifest/materials.json');
  if (!existsSync(furniturePath) || !existsSync(materialPath)) {
    throw new Error(`Missing manifest at ${furniturePath} or ${materialPath}`);
  }
  const furniture = furnitureManifestFile.parse(JSON.parse(readFileSync(furniturePath, 'utf8')));
  const materials = materialManifestFile.parse(JSON.parse(readFileSync(materialPath, 'utf8')));

  await fetchFurniture(furniture);
  await fetchMaterials(materials);

  emitCredits({
    projectRoot,
    furniture: furniture.map((e) => ({
      id: e.id,
      name: e.name,
      attribution: e.attribution,
      sourceUrl: e.sourceUrl,
      license: e.license,
    })),
    materials: materials.map((e) => ({
      id: e.id,
      name: e.name,
      attribution: e.attribution,
      sourceUrl: e.sourceUrl,
      license: e.license,
    })),
  });

  await indexAssets({ projectRoot });
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-assets.ts scripts/index-assets-cli.ts
git commit -m "$(cat <<'EOF'
Add fetch-assets and index-assets CLIs

Top-level entry points wire manifest → download → process → sidecar →
indexer → credits. --quick skips Draco/KTX2 for fast dev iteration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Drop folder structure and gitignore

**Files:**
- Modify: `.gitignore`
- Create: `public/assets/furniture/dropped/.gitkeep`
- Create: `public/assets/furniture/dropped/README.md`
- Create: `public/assets/materials/dropped/.gitkeep`
- Create: `public/assets/materials/dropped/README.md`

- [ ] **Step 1: Update `.gitignore`**

Append to existing `.gitignore`:

```
.asset-cache/
public/assets/furniture/dropped/*
!public/assets/furniture/dropped/.gitkeep
!public/assets/furniture/dropped/README.md
public/assets/materials/dropped/*
!public/assets/materials/dropped/.gitkeep
!public/assets/materials/dropped/README.md
```

- [ ] **Step 2: Create `.gitkeep` placeholders**

Both `public/assets/furniture/dropped/.gitkeep` and `public/assets/materials/dropped/.gitkeep` are empty files.

- [ ] **Step 3: Create `public/assets/furniture/dropped/README.md`**

```markdown
# Dropped furniture

Drop GLB files here to add them to the catalog. Run `npm run index-assets` after dropping new files.

## Sidecar JSON (optional)

Place `<filename>.glb.json` next to each GLB to override defaults:

```json
{
  "id": "my-armchair",
  "name": "My Armchair",
  "category": "seating",
  "footprint": { "w": 0.8, "d": 0.85, "h": 0.95 },
  "scale": 1.0,
  "anchor": "floor-center"
}
```

Without a sidecar, the indexer derives:
- `id`: `dropped-<filename-without-extension>`
- `name`: title-cased filename
- `category`: `decor`
- `footprint`: bounding box from the GLB
- `scale`: `1.0`
- `anchor`: `floor-center`

## 3D-FUTURE / 3D-FRONT

If you've accepted the Alibaba research license and have local copies of 3D-FUTURE GLBs, you can drop them here. The assets and any sidecars stay gitignored — nothing is committed or redistributed.
```

- [ ] **Step 4: Create `public/assets/materials/dropped/README.md`**

```markdown
# Dropped materials

Drop a folder per material with channel images inside (`albedo.png`, optional `normal.png`, `rough.png`, `ao.png`). Run `npm run index-assets` after.

## Sidecar JSON (recommended)

Place `material.json` inside each material folder:

```json
{
  "id": "my-floor",
  "name": "My floor",
  "category": "floor",
  "uvScale": [1.5, 1.5],
  "channels": {
    "albedo": "albedo.png",
    "normal": "normal.png",
    "rough": "rough.png"
  }
}
```

The indexer skips material folders that lack a sidecar — there's no useful fallback for material metadata without one.
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore public/assets/furniture/dropped public/assets/materials/dropped
git commit -m "$(cat <<'EOF'
Add drop folders for user-supplied furniture and materials

Both folders are gitignored except a .gitkeep and a README that
documents the sidecar JSON convention and notes 3D-FUTURE usage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Wire generated catalogs into runtime

**Files:**
- Modify: `src/furniture/catalog.ts`
- Modify: `src/materials/useMaterial.ts`
- Modify: `src/materials/builtinCatalog.ts`
- Test: `src/furniture/catalog.test.ts` (extend existing or create)

- [ ] **Step 1: Seed empty generated modules so imports resolve before first fetch**

Create `src/furniture/generatedCatalog.ts`:

```ts
// AUTO-GENERATED by scripts/asset-pipeline/index-assets.ts. Do not edit.
import type { FurnitureDef } from './types';

export const GENERATED_FURNITURE: FurnitureDef[] = [];
```

Create `src/materials/generatedCatalog.ts`:

```ts
// AUTO-GENERATED by scripts/asset-pipeline/index-assets.ts. Do not edit.
import type { MaterialDef } from './types';

export const GENERATED_MATERIALS: MaterialDef[] = [];
```

- [ ] **Step 2: Modify `src/furniture/catalog.ts` to merge GENERATED_FURNITURE**

Replace the body of `useCatalog`:

```ts
export function useCatalog(): Record<FurnitureType, FurnitureDef> {
  const userFurniture = useStore(useShallow((s) => s.userFurniture));
  const merged: Record<FurnitureType, FurnitureDef> = { ...BUILTIN_CATALOG };
  for (const def of GENERATED_FURNITURE) merged[def.id] = def;
  for (const def of userFurniture) merged[def.id] = def;
  return merged;
}
```

And update `useCatalogByCategory` similarly: after the BUILTIN spread, before the userFurniture loop, add `for (const def of GENERATED_FURNITURE) (out[def.category] ??= []).push(def);`. Add `import { GENERATED_FURNITURE } from './generatedCatalog';` at the top.

- [ ] **Step 3: Modify `src/materials/useMaterial.ts` to merge GENERATED_MATERIALS**

Replace `useMaterials`:

```ts
import { GENERATED_MATERIALS } from './generatedCatalog';

export function useMaterials(): Record<MaterialId, MaterialDef> {
  const userMaterials = useStore(useShallow((s) => s.userMaterials));
  const merged: Record<MaterialId, MaterialDef> = { ...BUILTIN_MATERIALS };
  for (const m of GENERATED_MATERIALS) merged[m.id] = m;
  for (const m of userMaterials) merged[m.id] = m;
  return merged;
}
```

- [ ] **Step 4: Drop the placeholder `texFloor` in `src/materials/builtinCatalog.ts`**

Read the file. Remove the `texFloor` helper function and replace each `'floor-wood-oak': texFloor(...)` etc. with a plain solid def (since the textured versions now come from the generated catalog after fetch). Until `npm run fetch-assets` is run, the picker shows solid swatches under those ids; after fetch, the generated catalog overrides them with textured defs by id.

For each of the eight `texFloor(...)` entries (oak, walnut, white tile, marble, terrazzo, carpet-grey, vinyl-light, terrazzo), replace with:

```ts
'floor-wood-oak': {
  id: 'floor-wood-oak',
  name: 'Oak planks',
  category: 'floor',
  kind: 'solid',
  swatch: '#b88f5d',
},
```

(Use the existing swatch hex from each `texFloor` call.)

- [ ] **Step 5: Run the existing test suite**

```bash
npm test
```

Expected: all existing tests still pass; `useMaterials` and `useCatalog` continue to behave identically since the generated arrays are empty.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/furniture/catalog.ts src/furniture/generatedCatalog.ts src/materials/useMaterial.ts src/materials/builtinCatalog.ts src/materials/generatedCatalog.ts
git commit -m "$(cat <<'EOF'
Wire generated furniture and material catalogs into runtime

useCatalog and useMaterials now merge GENERATED_* arrays between the
builtins and user uploads. Generated modules ship as empty arrays
until npm run fetch-assets populates them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Inspector "Source" line

**Files:**
- Create: `src/ui/inspector/SourceLine.tsx`
- Modify: `src/ui/inspector/InspectorPanel.tsx`
- Test: `src/ui/inspector/SourceLine.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceLine } from './SourceLine';

describe('SourceLine', () => {
  it('renders nothing when there is no attribution', () => {
    const { container } = render(<SourceLine />);
    expect(container.firstChild).toBeNull();
  });

  it('renders attribution and license', () => {
    render(<SourceLine attribution="Kenney" license="CC0" />);
    expect(screen.getByText(/Kenney/)).toBeInTheDocument();
    expect(screen.getByText(/CC0/)).toBeInTheDocument();
  });

  it('renders a link when sourceUrl is present', () => {
    render(<SourceLine attribution="Poly Haven" license="CC0" sourceUrl="https://polyhaven.com/x" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://polyhaven.com/x');
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
npx vitest run src/ui/inspector/SourceLine.test.tsx
```

- [ ] **Step 3: Implement `src/ui/inspector/SourceLine.tsx`**

```tsx
interface SourceLineProps {
  attribution?: string;
  license?: 'CC0';
  sourceUrl?: string;
}

export function SourceLine({ attribution, license, sourceUrl }: SourceLineProps) {
  if (!attribution && !license) return null;
  const text = `Source: ${attribution ?? 'Unknown'}${license ? ` · ${license}` : ''}`;
  return (
    <div className="text-xs text-gray-500 mt-1">
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
          {text}
        </a>
      ) : (
        <span>{text}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
npx vitest run src/ui/inspector/SourceLine.test.tsx
```

- [ ] **Step 5: Wire into InspectorPanel**

Read `src/ui/inspector/InspectorPanel.tsx`. Locate where the selected def is available (the panel already has access to a `def: FurnitureDef`). Just below the title or footprint section, add:

```tsx
{def.kind === 'gltf' && (
  <SourceLine
    attribution={def.attribution}
    license={def.license}
    sourceUrl={def.sourceUrl}
  />
)}
```

Add `import { SourceLine } from './SourceLine';` at the top.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/inspector/SourceLine.tsx src/ui/inspector/SourceLine.test.tsx src/ui/inspector/InspectorPanel.tsx
git commit -m "$(cat <<'EOF'
Add Source attribution line to the inspector panel

Renders attribution + license, with a sourceUrl link when present.
Hidden for parametric defs and any gltf def without attribution data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Credits modal

**Files:**
- Create: `src/ui/CreditsModal.tsx`
- Modify: `src/ui/Toolbar.tsx`
- Test: `src/ui/CreditsModal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CreditsModal } from './CreditsModal';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => ({
      furniture: [
        { id: 'a', name: 'Armchair', attribution: 'Kenney', sourceUrl: 'https://k.nl', license: 'CC0' },
      ],
      materials: [
        { id: 'm', name: 'Oak', attribution: 'Poly Haven', sourceUrl: 'https://p.com', license: 'CC0' },
      ],
    }),
  })));
});

describe('CreditsModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<CreditsModal open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('fetches and displays credits when opened', async () => {
    render(<CreditsModal open={true} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Armchair/)).toBeInTheDocument());
    expect(screen.getByText(/Oak/)).toBeInTheDocument();
    expect(screen.getAllByText(/CC0/).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

- [ ] **Step 3: Implement `src/ui/CreditsModal.tsx`**

```tsx
import { useEffect, useState } from 'react';

interface CreditEntry {
  id: string;
  name: string;
  attribution: string;
  sourceUrl: string;
  license: 'CC0';
}

interface Credits {
  furniture: CreditEntry[];
  materials: CreditEntry[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreditsModal({ open, onClose }: Props) {
  const [credits, setCredits] = useState<Credits | null>(null);
  useEffect(() => {
    if (!open) return;
    fetch('/assets/CREDITS.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setCredits)
      .catch(() => setCredits({ furniture: [], materials: [] }));
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded p-4 max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-2">Asset credits</h2>
        {credits ? (
          <>
            <Section title="Furniture" entries={credits.furniture} />
            <Section title="Materials" entries={credits.materials} />
          </>
        ) : (
          <p>Loading...</p>
        )}
        <button onClick={onClose} className="mt-3 text-sm underline">Close</button>
      </div>
    </div>
  );
}

function Section({ title, entries }: { title: string; entries: CreditEntry[] }) {
  if (!entries.length) return null;
  return (
    <section className="mt-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="text-sm">
        {entries.map((e) => (
          <li key={e.id}>
            <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{e.name}</a>
            {' — '}
            {e.attribution} · {e.license}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run test, expect pass**

- [ ] **Step 5: Wire into Toolbar**

Read `src/ui/Toolbar.tsx`. Add a "Credits" button (matching existing button style) that toggles modal state, and render `<CreditsModal>` controlled by that state.

```tsx
const [creditsOpen, setCreditsOpen] = useState(false);
// ... inside the toolbar render, alongside other buttons:
<button onClick={() => setCreditsOpen(true)} className={existingButtonClass}>Credits</button>
// ... at the end of the toolbar's returned JSX:
<CreditsModal open={creditsOpen} onClose={() => setCreditsOpen(false)} />
```

Add the imports.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/CreditsModal.tsx src/ui/CreditsModal.test.tsx src/ui/Toolbar.tsx
git commit -m "$(cat <<'EOF'
Add Credits modal listing every bundled asset

Modal fetches public/assets/CREDITS.json on open, groups entries by
furniture and materials, and links each name to its sourceUrl.
Toolbar gains a Credits button that toggles it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Populate v1 Starter manifest entries

**Files:**
- Create: `assets/manifest/furniture.json`
- Create: `assets/manifest/materials.json`

This task is data-only. Each entry's `downloadUrl` must be a stable, direct file URL — not a search result. Verify each URL with a HEAD request (or just `curl -I`) before committing.

- [ ] **Step 1: Author `assets/manifest/furniture.json`**

Schema validated by Task 2. Aim for 10 Kenney items + 5 Poly Haven items. For Kenney, the Furniture Kit ships individual GLBs per piece in their pack download; you may need to host them on a CC0 mirror you control if Kenney's pack URL isn't a per-file direct link. If per-file URLs are not available, swap to `kenney-furniture-kit-bundle` as a single archive entry and add an "extract" step to the pipeline (defer to a follow-up; in v1, only include items that have direct GLB URLs).

Concrete starting entries (placeholders; verify each URL before final commit):

```json
[
  {
    "id": "polyhaven-modern-arm-chair",
    "source": "polyhaven",
    "sourceUrl": "https://polyhaven.com/a/modern_arm_chair_01",
    "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/glb/1k/modern_arm_chair_01/modern_arm_chair_01_1k.glb",
    "license": "CC0",
    "attribution": "Poly Haven",
    "name": "Modern armchair",
    "category": "seating",
    "footprint": { "w": 0.85, "d": 0.85, "h": 0.95 }
  },
  {
    "id": "polyhaven-potted-plant",
    "source": "polyhaven",
    "sourceUrl": "https://polyhaven.com/a/potted_plant_01",
    "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/glb/1k/potted_plant_01/potted_plant_01_1k.glb",
    "license": "CC0",
    "attribution": "Poly Haven",
    "name": "Potted plant",
    "category": "decor",
    "footprint": { "w": 0.4, "d": 0.4, "h": 0.8 }
  }
]
```

Add 13 more entries following the same shape, mixing Poly Haven and (where direct URLs exist) Kenney/Quaternius items. If you can only verify 5 entries, commit with 5 and file follow-ups in TODO.md.

- [ ] **Step 2: Author `assets/manifest/materials.json`**

Use the URLs already documented in [src/materials/builtinCatalog.ts](../../../src/materials/builtinCatalog.ts) as the `sourceUrl`. For `downloadUrl`s, Poly Haven exposes `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<slug>/<slug>_<channel>_1k.jpg`. Pin to 1k JPGs as source — the pipeline upscales to KTX2 separately and the source is small.

Starter set (verify URLs):

```json
[
  {
    "id": "floor-wood-oak",
    "source": "polyhaven",
    "sourceUrl": "https://polyhaven.com/a/wood_floor_deck",
    "downloads": {
      "albedo": "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_floor_deck/wood_floor_deck_diff_1k.jpg",
      "normal": "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_floor_deck/wood_floor_deck_nor_gl_1k.jpg",
      "rough": "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_floor_deck/wood_floor_deck_rough_1k.jpg"
    },
    "license": "CC0",
    "attribution": "Poly Haven",
    "name": "Oak planks",
    "category": "floor",
    "uvScale": [1.5, 1.5]
  }
]
```

The id `floor-wood-oak` matches the existing builtin id; the indexer's collision check is per-source, but the runtime merge in Task 11 deliberately overrides BUILTIN with GENERATED, so this is intentional. Add 11 more entries (walnut, white tile, marble, terrazzo, carpet-grey, vinyl-light, plus 4 wall textures with `wall-<name>` ids).

- [ ] **Step 3: Validate manifests parse**

```bash
npx tsx -e "import {furnitureManifestFile,materialManifestFile} from './scripts/asset-pipeline/manifest'; import {readFileSync} from 'node:fs'; furnitureManifestFile.parse(JSON.parse(readFileSync('assets/manifest/furniture.json','utf8'))); materialManifestFile.parse(JSON.parse(readFileSync('assets/manifest/materials.json','utf8'))); console.log('ok');"
```

Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add assets/manifest/furniture.json assets/manifest/materials.json
git commit -m "$(cat <<'EOF'
Add v1 Starter asset manifest

CC0 furniture and material entries pinning stable Poly Haven and
Kenney download URLs. Indexer + fetch script consume this directly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: End-to-end fixture test

**Files:**
- Create: `scripts/asset-pipeline/__tests__/integration.test.ts`
- Create: `scripts/asset-pipeline/__tests__/fixtures/manifest.json`

Goal: exercise manifest → cache → process → sidecar → indexer → credits without network access by pointing at a fixture manifest backed by `file://` URLs to the existing demo Khronos GLBs.

- [ ] **Step 1: Author the fixture manifest**

Create `scripts/asset-pipeline/__tests__/fixtures/manifest.json`:

```json
[
  {
    "id": "fixture-duck",
    "source": "polyhaven",
    "sourceUrl": "https://example.test/duck",
    "downloadUrl": "file://__ABS_DUCK__",
    "license": "CC0",
    "attribution": "Khronos",
    "name": "Fixture duck",
    "category": "decor",
    "footprint": { "w": 0.6, "d": 0.6, "h": 1.0 }
  }
]
```

The placeholder `__ABS_DUCK__` is replaced at test runtime with the absolute path of `public/assets/furniture/demo-duck.glb`. The `cache.ts` downloader uses `fetch` which doesn't natively support `file://`; the integration test patches the cache path directly instead of going through `fetch`.

- [ ] **Step 2: Write the integration test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processGlb } from '../process-glb';
import { writeSidecar } from '../sidecar';
import { indexAssets } from '../index-assets';
import { emitCredits } from '../emit-credits';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'integration-test-'));
  mkdirSync(join(root, 'public/assets/furniture'), { recursive: true });
  mkdirSync(join(root, 'src/furniture'), { recursive: true });
  mkdirSync(join(root, 'src/materials'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('asset pipeline integration', () => {
  it('produces a generated catalog and CREDITS.json from one fixture entry', async () => {
    const src = 'public/assets/furniture/demo-duck.glb';
    const dst = join(root, 'public/assets/furniture/fixture-duck.glb');
    await processGlb(src, dst, { compress: false });
    writeSidecar(dst, {
      id: 'fixture-duck',
      name: 'Fixture duck',
      category: 'decor',
      footprint: { w: 0.6, d: 0.6, h: 1.0 },
      scale: 1.0,
      anchor: 'floor-center',
      license: 'CC0',
      attribution: 'Khronos',
      sourceUrl: 'https://example.test/duck',
    });
    await indexAssets({ projectRoot: root });
    emitCredits({
      projectRoot: root,
      furniture: [{ id: 'fixture-duck', name: 'Fixture duck', attribution: 'Khronos', sourceUrl: 'https://example.test/duck', license: 'CC0' }],
      materials: [],
    });
    const generated = readFileSync(join(root, 'src/furniture/generatedCatalog.ts'), 'utf8');
    expect(generated).toContain("id: 'fixture-duck'");
    const credits = JSON.parse(readFileSync(join(root, 'public/assets/CREDITS.json'), 'utf8'));
    expect(credits.furniture[0].id).toBe('fixture-duck');
  });
});
```

- [ ] **Step 3: Run integration test**

```bash
npx vitest run scripts/asset-pipeline/__tests__/integration.test.ts
```

Expected: 1 pass.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add scripts/asset-pipeline/__tests__/integration.test.ts scripts/asset-pipeline/__tests__/fixtures
git commit -m "$(cat <<'EOF'
Add integration test for the asset pipeline

End-to-end exercise of process → sidecar → index → credits using the
existing demo Khronos GLB. Runs offline in CI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Update TODO.md

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Remove items now satisfied by this plan**

The "Material rendering: solid swatch → KTX2 PBR maps" entry is fulfilled in Task 11 once `fetch-assets` runs. Remove it.

- [ ] **Step 2: Add new items uncovered during planning**

Append:

```markdown
- **Kenney bundle extraction step** — Kenney's furniture kit ships as a single archive, not per-file GLBs. v1 manifest only includes Kenney items if direct per-file URLs are available; otherwise add an extract-from-zip step to the fetch pipeline. See [asset-population plan Task 14](docs/superpowers/plans/2026-04-26-asset-population.md#task-14-populate-v1-starter-manifest-entries).
- **Drop-folder material auto-detection** — current indexer skips material folders without a sidecar. A future improvement could infer channels from filenames (`*_diff.*`, `*_nor.*`, etc.) like the Poly Haven naming convention. See [asset-population plan Task 7](docs/superpowers/plans/2026-04-26-asset-population.md#task-7-indexer).
```

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "$(cat <<'EOF'
Update TODO.md after asset-population plan

Drop the KTX2 placeholder item now scheduled in this plan; add
Kenney-bundle extraction and drop-folder material auto-detection
as follow-ups surfaced during planning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification (after all tasks complete)

- [ ] `npm test` — all unit + integration tests pass.
- [ ] `npx tsc --noEmit` — no type errors.
- [ ] `npm run fetch-assets` — completes without errors; populates `public/assets/furniture/*.glb`, `public/assets/materials/*/`, regenerates `src/{furniture,materials}/generatedCatalog.ts`, writes `CREDITS.json` and `CREDITS.md`.
- [ ] `npm run dev` — start dev server. Verify in browser:
  - Catalog drawer lists generated items alongside built-ins.
  - Inspector panel shows "Source: <attribution> · CC0" with a working link for a selected GLB item.
  - Toolbar Credits button opens the modal; modal lists every entry with working links.
  - Material picker shows textured floors with PBR maps applied.
- [ ] `npm run fetch-assets:quick` — completes without `gltf-transform`'s KTX2 path; output GLBs and texture files are uncompressed but otherwise valid.
- [ ] Drop a stray GLB into `public/assets/furniture/dropped/` without a sidecar. Run `npm run index-assets`. The drawer shows the new item under "decor" with a bbox-derived footprint.

---

## Self-review notes (filled out by the plan author)

- **Spec coverage:** Manifest (T2), fetch script (T9), drop folder (T10), indexer (T7), runtime integration (T11), inspector source line (T12), credits modal (T13), credits emission (T8), sidecar/bbox (T6), 2K KTX2 (T5), Draco (T4), v1 starter contents (T14), failure-mode tests (T2/T3/T7), integration test (T15). All spec sections covered.
- **Placeholder scan:** Manifest entries in T14 are partially representative — some URLs need verification. Plan flags this and points out fallback (commit fewer entries + TODO.md). Acceptable.
- **Type consistency:** `FurnitureSidecar` matches the manifest entry's runtime fields; `MaterialSidecar.channels` is keyed `albedo/normal/rough/ao` consistently across manifest, sidecar, and indexer; runtime catalog uses `albedo/normal/roughness/ao` so the indexer maps `rough → roughness` when it emits TS — this mapping is explicit in `tsLiteralMaterial`.
