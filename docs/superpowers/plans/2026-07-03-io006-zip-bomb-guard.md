# IO-006: Zip-Bomb Guard on Decompressed usdz/3mf Payloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject a maliciously-crafted usdz/3mf archive that declares a modest on-disk size but inflates to gigabytes (a zip bomb), *before* the three.js loader unconditionally inflates it — without regressing legitimate large models that the blunt on-disk cap already bounds.

**Architecture:** usdz and 3mf are ZIP containers. Both are inflated inside their three.js loaders (`USDLoader`/`3MFLoader`) via `fflate.unzipSync(bytes)` with no bound, during `loadToObject`. fflate's `unzipSync(data, { filter })` walks the ZIP **central directory** and calls the filter with each entry's declared `originalSize` (uncompressed) / `size` (compressed) / `compression` — and only inflates entries whose filter returns `true`. So a pure guard module reads those declared sizes with an always-`false` filter (enumerate, inflate nothing), applies an entry-count / total-uncompressed / per-entry-ratio policy, and throws. `convertModel` calls the guard for the two ZIP formats right after its existing on-disk size cap and before `loadToObject` runs. A rejection becomes a `ConvertError`, which the existing bulk-import path already collects into the per-file "skipped" list and surfaces through `notify.error`.

**Tech Stack:** React + TypeScript, Vitest, Biome. Uses the already-present root `fflate` package (`unzipSync`/`zipSync`). No new dependency.

## Global Constraints

- Biome style: 2-space indent, 100-col, single quotes, **no semicolons**. Run `npm run check:fix` before committing.
- No React / no store imports in the guard module — it is pure and unit-tested in isolation (mirrors `validate.ts`, `formats.ts`).
- Reuse the root `fflate` package (`import { ... } from 'fflate'`) — the same package `planShare.ts`/`boqXlsx.ts` use. Do NOT import `three/examples/jsm/libs/fflate.module.js`.
- Do not touch the three.js loaders or the loader-invoking `loadToObject.ts`; the guard runs upstream in `convertModel.ts`.
- The guard applies ONLY to the ZIP formats (`'3mf'`, `'usdz'`); the other formats are not ZIP containers and must be untouched.
- Versioning: bump `build` in both `src/version.ts` (`APP_VERSION`) and `package.json`. Current: `0.11.1.3` → target `0.11.1.4`.
- Iterate with targeted `npx vitest --run <path>`; run the full `npm test` + `npx tsc --noEmit` + `npm run check` exactly once right before the final commit. Never pipe test runs through `tail`/`head` — redirect full output to a log file and grep the file.
- Log shipped work in `CHANGELOG.md`. Remove the IO-006 entry from `TASKS.md` when shipped (per the "shipped items leave TASKS.md" policy).

---

### Task 1: Pure zip-bomb guard module

**Files:**
- Create: `src/furniture/convert/zipGuard.ts`
- Test: `src/furniture/convert/zipGuard.test.ts`

**Interfaces:**
- Consumes: `unzipSync` from `fflate`.
- Produces:
  - `class ZipGuardError extends Error {}` — thrown on a policy violation or an unparseable archive; carries a user-facing message.
  - `interface ZipEntryInfo { name: string; size: number; originalSize: number; compression: number }`.
  - Exported policy constants (see values + justification below).
  - `readZipEntries(bytes: Uint8Array): ZipEntryInfo[]` — enumerates every central-directory entry WITHOUT inflating any of them (fflate `unzipSync` with an always-`false` filter that records each `UnzipFileInfo`). Throws `ZipGuardError('… is not a valid archive')` if fflate cannot find the central directory.
  - `assertSafeZip(bytes: Uint8Array, label: string, opts?: { maxEntries?: number; maxTotalUncompressed?: number; maxEntryRatio?: number }): void` — runs `readZipEntries`, applies the policy, throws `ZipGuardError` with a specific message on the first violation; returns void when safe.

**Policy values (proposed, consistent with existing caps):**
- `MAX_ZIP_ENTRIES = 4096` — real usdz/3mf archives hold a handful to low-hundreds of parts (meshes + textures + manifest); 4096 is generous headroom while bounding a "many tiny files" bomb.
- `MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024` (512 MB) — the on-disk entry cap is already 80 MB (`MAX_BYTES_BY_FORMAT` usdz/3mf). USDZ is stored uncompressed so its inflated total ≈ its 80 MB on-disk size; a 3mf may legitimately inflate several 4K textures (~64 MB each uncompressed) + mesh XML into a few hundred MB. 512 MB clears legitimate large models yet stops a bomb (which targets GB–TB) before it exhausts memory. Oversize-but-not-bomb output is still re-rejected downstream by the 25 MB `MAX_GLB_BYTES` post-optimize check (`bulkImport.ts:101`), so this guard is specifically the pre-inflation memory-exhaustion guard.
- `MAX_ENTRY_RATIO = 200` and `RATIO_MIN_ORIGINAL_BYTES = 1024 * 1024` (1 MB) — per-entry `originalSize / max(size, 1)` ceiling, applied only to entries whose `originalSize` exceeds 1 MB. Deflate's theoretical max ratio is ~1032:1; real mesh/texture data compresses ~2–10:1, so 200:1 catches the classic single-entry bomb without ever tripping on legitimate content. The 1 MB floor avoids false positives on small, highly-compressible manifest XML (e.g. a 2 KB → 400 KB `[Content_Types].xml`, ratio 200, is harmless).

- [ ] **Step 1: Write the failing tests**

```typescript
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  assertSafeZip,
  MAX_ENTRY_RATIO,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES,
  readZipEntries,
  ZipGuardError,
} from './zipGuard'

// Build a real ZIP whose single entry is a long run of a repeated byte, so
// deflate compresses it far past the ratio ceiling (a miniature zip bomb).
function bombZip(uncompressedBytes: number): Uint8Array {
  const payload = new Uint8Array(uncompressedBytes) // all zeros → tiny deflate output
  return zipSync({ 'bomb.bin': payload }) // fflate deflates by default
}

// A benign archive: a few small, poorly-compressible entries.
function benignZip(): Uint8Array {
  const rnd = (n: number) => {
    const a = new Uint8Array(n)
    for (let i = 0; i < n; i++) a[i] = (i * 2654435761) & 0xff
    return a
  }
  return zipSync({ 'mesh.bin': rnd(4096), 'tex.bin': rnd(8192), 'model.xml': rnd(512) })
}

describe('readZipEntries', () => {
  it('enumerates central-directory entries with declared sizes, inflating nothing', () => {
    const entries = readZipEntries(benignZip())
    expect(entries.map((e) => e.name).sort()).toEqual(['mesh.bin', 'model.xml', 'tex.bin'])
    const mesh = entries.find((e) => e.name === 'mesh.bin')!
    expect(mesh.originalSize).toBe(4096)
    expect(mesh.size).toBeGreaterThan(0)
  })

  it('throws ZipGuardError on bytes that are not a valid archive', () => {
    expect(() => readZipEntries(new Uint8Array([1, 2, 3, 4]))).toThrow(ZipGuardError)
  })
})

describe('assertSafeZip', () => {
  it('passes a benign archive', () => {
    expect(() => assertSafeZip(benignZip(), 'ok.3mf')).not.toThrow()
  })

  it('rejects a single-entry high-ratio bomb', () => {
    // 8 MB of zeros deflates to a few KB → ratio far over the ceiling.
    expect(() => assertSafeZip(bombZip(8 * 1024 * 1024), 'evil.3mf')).toThrow(ZipGuardError)
  })

  it('rejects when total declared uncompressed size exceeds the cap', () => {
    const bytes = bombZip(4 * 1024 * 1024)
    expect(() =>
      // Tiny total cap, generous ratio → only the total-size rule can trip.
      assertSafeZip(bytes, 'big.usdz', {
        maxTotalUncompressed: 1024,
        maxEntryRatio: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(ZipGuardError)
  })

  it('rejects when the entry count exceeds the cap', () => {
    const many: Record<string, Uint8Array> = {}
    for (let i = 0; i < 20; i++) many[`f${i}.bin`] = new Uint8Array([i])
    expect(() => assertSafeZip(zipSync(many), 'many.3mf', { maxEntries: 10 })).toThrow(ZipGuardError)
  })

  it('does not trip the ratio rule on a small highly-compressible entry (under the 1 MB floor)', () => {
    // 100 KB of zeros → high ratio but originalSize is under RATIO_MIN_ORIGINAL_BYTES.
    expect(() => assertSafeZip(bombZip(100 * 1024), 'small.3mf')).not.toThrow()
  })

  it('exports sane default policy constants', () => {
    expect(MAX_ZIP_ENTRIES).toBeGreaterThan(0)
    expect(MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES).toBeGreaterThan(80 * 1024 * 1024)
    expect(MAX_ENTRY_RATIO).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/furniture/convert/zipGuard.test.ts`
Expected: FAIL — module not found / exports undefined.

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * Zip-bomb guard for the two ZIP-container model formats we ingest (usdz, 3mf).
 *
 * Both are inflated inside their three.js loaders via `fflate.unzipSync(bytes)`
 * with NO size bound (`USDLoader`/`3MFLoader`), so a tiny on-disk archive that
 * declares gigabytes of uncompressed content would expand into memory before
 * anything could stop it. The blunt on-disk cap (`MAX_BYTES_BY_FORMAT`) can't
 * catch this without also rejecting legitimate large models.
 *
 * fflate's `unzipSync(data, { filter })` walks the ZIP central directory and
 * calls `filter({ name, size, originalSize, compression })` per entry — where
 * `originalSize` is the declared *uncompressed* size — and only inflates an
 * entry when its filter returns `true`. We pass an always-`false` filter to
 * enumerate every entry's declared sizes cheaply while inflating nothing, then
 * bound the aggregate + per-entry expansion before the real loader runs.
 */
import { unzipSync } from 'fflate'

/** Thrown on a policy violation or an unparseable archive. */
export class ZipGuardError extends Error {}

export interface ZipEntryInfo {
  name: string
  /** Compressed (on-disk) size, from the central directory. */
  size: number
  /** Declared uncompressed size, from the central directory. */
  originalSize: number
  /** ZIP compression method (0 = stored, 8 = deflate). */
  compression: number
}

/** Max central-directory entries. Real usdz/3mf hold a handful to low hundreds. */
export const MAX_ZIP_ENTRIES = 4096

/** Cap on the SUM of declared uncompressed sizes. Well above the 80 MB on-disk
 *  entry cap so legitimate texture-heavy models pass; a bomb (GB–TB) trips it. */
export const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024

/** Per-entry uncompressed:compressed ratio ceiling (deflate max is ~1032:1;
 *  real mesh/texture data is ~2–10:1). */
export const MAX_ENTRY_RATIO = 200

/** Only apply the ratio rule above this uncompressed size, so a tiny
 *  highly-compressible manifest (e.g. XML) can't false-positive. */
export const RATIO_MIN_ORIGINAL_BYTES = 1024 * 1024

/** Enumerate central-directory entries WITHOUT inflating any of them. */
export function readZipEntries(bytes: Uint8Array): ZipEntryInfo[] {
  const entries: ZipEntryInfo[] = []
  try {
    unzipSync(bytes, {
      filter: (f) => {
        entries.push({
          name: f.name,
          size: f.size,
          originalSize: f.originalSize,
          compression: f.compression,
        })
        return false // record only — never inflate
      },
    })
  } catch (e) {
    throw new ZipGuardError(
      `Could not read the archive (${e instanceof Error ? e.message : String(e)}).`,
    )
  }
  return entries
}

/** Throw {@link ZipGuardError} if `bytes` looks like a decompression bomb. */
export function assertSafeZip(
  bytes: Uint8Array,
  label: string,
  opts?: { maxEntries?: number; maxTotalUncompressed?: number; maxEntryRatio?: number },
): void {
  const maxEntries = opts?.maxEntries ?? MAX_ZIP_ENTRIES
  const maxTotal = opts?.maxTotalUncompressed ?? MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES
  const maxRatio = opts?.maxEntryRatio ?? MAX_ENTRY_RATIO

  const entries = readZipEntries(bytes)
  if (entries.length > maxEntries) {
    throw new ZipGuardError(
      `${label} has too many entries (${entries.length} > ${maxEntries}) — refusing as a possible zip bomb.`,
    )
  }

  let total = 0
  for (const e of entries) {
    if (e.originalSize > RATIO_MIN_ORIGINAL_BYTES) {
      const ratio = e.originalSize / Math.max(e.size, 1)
      if (ratio > maxRatio) {
        throw new ZipGuardError(
          `${label} contains a highly-compressed entry (${Math.round(ratio)}:1) — refusing as a possible zip bomb.`,
        )
      }
    }
    total += e.originalSize
    if (total > maxTotal) {
      const mb = (total / 1_048_576).toFixed(0)
      const cap = (maxTotal / 1_048_576).toFixed(0)
      throw new ZipGuardError(
        `${label} would decompress to over ${mb} MB (limit ${cap} MB) — refusing as a possible zip bomb.`,
      )
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/furniture/convert/zipGuard.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/convert/zipGuard.ts src/furniture/convert/zipGuard.test.ts
git commit -m "FEAT(IO-006): pure zip-bomb guard reading fflate central-directory sizes"
```

---

### Task 2: Wire the guard into convertModel for usdz/3mf

**Files:**
- Modify: `src/furniture/convert/convertModel.ts`
- Test: `src/furniture/convert/convertModel.test.ts`

**Interfaces:**
- Consumes: `assertSafeZip`, `ZipGuardError` from Task 1.
- Produces: no signature change to `convertModel`. New behaviour: for a `'3mf'`/`'usdz'` entry, a decompression-bomb archive throws `ConvertError` (carrying the guard message) before any loader inflates it.

**Rationale:** `convertModel` is the single choke point for both the bulk (`bulkImport.ts:92`) and single-file (`prepareModelFile`) conversion paths. Placing the guard here (after the existing on-disk cap, before `loadToObject`) covers every ingest route, and reusing `ConvertError` means the existing `bulkImport.ts:220` catch → `skipped[]` → `notify.error` path surfaces it with zero UI changes.

- [ ] **Step 1: Add the import**

At the top of `src/furniture/convert/convertModel.ts`, alongside the existing imports:

```typescript
import { assertSafeZip, ZipGuardError } from './zipGuard'
```

- [ ] **Step 2: Add a helper + the guard call in `convertModel`**

Add this constant near the top of the file (after the imports):

```typescript
/** Formats that are ZIP containers (inflated inside their three.js loader). */
const ZIP_FORMATS = new Set<ModelFormat>(['3mf', 'usdz'])
```

Then, inside `convertModel`, immediately AFTER the existing on-disk size cap block
(the `if (entry.size > maxBytes) { throw new ConvertError(...) }`) and BEFORE
`const pool = buildPool(...)`, insert:

```typescript
  // IO-006: bound the DECOMPRESSED size of ZIP-container formats before the
  // three.js loader inflates them unconditionally (`fflate.unzipSync` with no
  // bound). The on-disk cap above can't catch a bomb that declares a small
  // archive but gigabytes of uncompressed content. We read the declared
  // central-directory sizes (no inflation) and refuse an implausible expansion.
  if (ZIP_FORMATS.has(format)) {
    try {
      assertSafeZip(new Uint8Array(await entry.arrayBuffer()), entry.name)
    } catch (e) {
      if (e instanceof ZipGuardError) throw new ConvertError(e.message)
      throw e
    }
  }
```

- [ ] **Step 3: Add tests to `convertModel.test.ts`**

Add a `describe` block (import `zipSync` from `'fflate'` at the top of the test file if not already imported, and reuse the existing test's `File` construction style). This exercises the guard through the public `convertModel` API:

```typescript
import { zipSync } from 'fflate'
import { ConvertError, convertModel } from './convertModel'

describe('convertModel zip-bomb guard (IO-006)', () => {
  it('rejects a 3mf whose single entry declares a huge, tiny-compressed payload', async () => {
    // 8 MB of zeros → deflates to a few KB → ratio far over the ceiling.
    const bomb = zipSync({ '3D/3dmodel.model': new Uint8Array(8 * 1024 * 1024) })
    const file = new File([bomb], 'evil.3mf', { type: 'application/octet-stream' })
    await expect(convertModel(file, [])).rejects.toBeInstanceOf(ConvertError)
    await expect(convertModel(file, [])).rejects.toThrow(/zip bomb/i)
  })

  it('rejects a usdz with the same bomb shape', async () => {
    const bomb = zipSync({ 'model.usda': new Uint8Array(8 * 1024 * 1024) })
    const file = new File([bomb], 'evil.usdz', { type: 'application/octet-stream' })
    await expect(convertModel(file, [])).rejects.toThrow(/zip bomb/i)
  })
})
```

Note: these files never reach `loadToObject` — the guard throws first — so the tests do not need the three.js loaders to parse the (otherwise invalid) contents. Do not add a "benign archive passes" case here: a truly-valid usdz/3mf fixture would then hit the real loaders (heavy, and out of scope); the benign path is already covered by `zipGuard.test.ts` Task 1.

- [ ] **Step 4: Run the convert tests to verify they pass**

Run: `npx vitest --run src/furniture/convert/convertModel.test.ts src/furniture/convert/zipGuard.test.ts`
Expected: PASS (existing convertModel tests unchanged + the two new bomb cases).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/furniture/convert/convertModel.ts src/furniture/convert/convertModel.test.ts
git commit -m "FEAT(IO-006): guard usdz/3mf decompression size in convertModel before inflation"
```

---

### Task 3: Docs, version bump, changelog, TASKS.md, full verification

**Files:**
- Modify: `src/version.ts`, `package.json` (version field), `CHANGELOG.md`, `TASKS.md`
- Possibly modify: `docs/ARCHITECTURE.md` (if the convert pipeline section enumerates its guards — add the zip-bomb guard there)

**Interfaces:** none.

- [ ] **Step 1: Bump the version**

Edit `src/version.ts` `APP_VERSION` to `'0.11.1.4'`. Edit `package.json` `version` to `0.11.1` (the first three parts; build is not carried in package.json semver).

- [ ] **Step 2: Update CHANGELOG.md**

Add an entry under the current version line: IO-006 — zip-bomb guard on decompressed usdz/3mf payloads. Note it reads fflate central-directory sizes (no inflation) and enforces an entry-count ceiling (4096), a total-uncompressed cap (512 MB, above the 80 MB on-disk cap so legit large models pass), and a per-entry ratio ceiling (200:1 above a 1 MB floor); runs in `convertModel` before the loader inflates; rejection surfaces through the existing per-file skipped/notify path.

- [ ] **Step 3: Remove the IO-006 entry from TASKS.md**

Delete the `- [ ] IO-006: …` bullet from `TASKS.md` (shipped items leave the backlog; the record now lives in CHANGELOG.md).

- [ ] **Step 4: Update ARCHITECTURE.md if it lists convert-pipeline guards**

`grep -n "IO-002\|MAX_BYTES_BY_FORMAT\|convertModel\|convert" docs/ARCHITECTURE.md`; if the model-conversion pipeline / its size guards are described, add a one-line mention of the IO-006 zip-bomb guard and `zipGuard.ts`. If not described there, skip (no doc change needed).

- [ ] **Step 5: Full verification sweep (run once)**

Run: `npm test > /tmp/vitest.log 2>&1; echo done` then `npx tsc --noEmit` then `npm run check`. Grep `/tmp/vitest.log` for failures. Expected: all green.

Note: this change has no rendering surface — it only refuses a malicious file earlier and surfaces an existing-style error toast — so no screenshot pass is required; the unit tests are the verification. If exercising manually, drop a crafted bomb archive and confirm the upload reports it as skipped with a "possible zip bomb" reason.

- [ ] **Step 6: Commit**

```bash
git add src/version.ts package.json CHANGELOG.md TASKS.md docs/ARCHITECTURE.md
git commit -m "CHORE(IO-006): changelog, version v0.11.1.4, close task"
```

---

## Self-Review

**Spec coverage:**
- Locate the unzip path (fflate `unzipSync` inside three loaders, invoked via `loadToObject` from `convertModel`) → Architecture + Task 2. ✓
- Prefer the library route over a hand-rolled parser (fflate exposes central-directory `originalSize`/`size`/`compression` via the `filter` callback) → Task 1 `readZipEntries`. ✓
- Guard policy: total-uncompressed cap + per-entry ratio ceiling + entry-count ceiling → Task 1 constants + `assertSafeZip`. ✓
- Runs before inflation → Task 2 places the call before `loadToObject`, using declared sizes (no inflation). ✓
- User-facing error path via existing notify/toast conventions → `ConvertError` → `bulkImport` skipped[] → `notify.error` (no new UI). ✓
- Cap values consistent with existing caps (80 MB on-disk, 25 MB GLB, 50 MB decompressed precedent) → justified in Task 1. ✓
- Plan format matches sibling plans (Goal/Architecture/Global Constraints header, bite-sized TDD tasks with exact paths, inline test code, run/commit commands, self-review). ✓

**Placeholder scan:** No TBD/TODO/"similar to" — all code is inline. ✓

**Type consistency:** `assertSafeZip(bytes, label, opts?)` and `ZipGuardError` are defined in Task 1 and used identically in Task 2. `ZipEntryInfo` fields mirror fflate's `UnzipFileInfo`. ✓
