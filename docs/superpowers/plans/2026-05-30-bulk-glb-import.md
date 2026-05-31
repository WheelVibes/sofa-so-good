# Bulk GLB/glTF Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user import many license-clean GLB/glTF models at once via multi-file selection or folder selection, reusing the existing single-file `persistUserGlb` machinery.

**Architecture:** One new pure orchestration module (`bulkImport.ts`) filters to model files, dedupes display names, and runs `persistUserGlb` over the batch through a bounded concurrency pool, reporting per-file outcomes. The existing `UploadModelDialog` is extended with `multiple` + `webkitdirectory` inputs and a batch-mode summary UI. No downstream systems change.

**Tech Stack:** React + TypeScript, Zustand store (`useStore`), Vitest + `fake-indexeddb` for tests. Existing helpers: `persistUserGlb` (`src/furniture/upload/persist.ts`), `IdbAssetStore`, `validateGlbFile`.

**Spec:** `docs/superpowers/specs/2026-05-30-bulk-glb-import-design.md`

---

## File Structure

- **Create:** `src/furniture/upload/bulkImport.ts` — pure batch orchestration over `persistUserGlb`. One responsibility: turn a `File[]` into a `BulkImportResult`.
- **Create:** `src/furniture/upload/bulkImport.test.ts` — Vitest unit tests with `fake-indexeddb/auto`.
- **Modify:** `src/ui/upload/UploadModelDialog.tsx` — multi-file + folder inputs, batch-mode UI, progress + summary. Routes through `importGlbFiles`.

The dialog is the only React/DOM surface; all batch logic lives in the testable `bulkImport.ts`.

---

## Task 1: Bulk import core — types and model-file filter

**Files:**
- Create: `src/furniture/upload/bulkImport.ts`
- Test: `src/furniture/upload/bulkImport.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/furniture/upload/bulkImport.test.ts
import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { isModelFile, modelName } from './bulkImport';

describe('bulkImport file filtering', () => {
  it('recognises .glb and .gltf case-insensitively, rejects others', () => {
    expect(isModelFile('chair.glb')).toBe(true);
    expect(isModelFile('CHAIR.GLTF')).toBe(true);
    expect(isModelFile('readme.txt')).toBe(false);
    expect(isModelFile('texture.png')).toBe(false);
    expect(isModelFile('noext')).toBe(false);
  });

  it('derives a display name from the basename without extension', () => {
    expect(modelName('chair.glb')).toBe('chair');
    expect(modelName('models/sofas/Big Sofa.gltf')).toBe('Big Sofa');
    expect(modelName('a.b.glb')).toBe('a.b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/furniture/upload/bulkImport.test.ts`
Expected: FAIL — cannot resolve `./bulkImport` / `isModelFile is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/furniture/upload/bulkImport.ts
import type { FurnitureCategory } from '../types';

/** True when the basename ends in .glb or .gltf (case-insensitive). */
export function isModelFile(nameOrPath: string): boolean {
  return /\.(glb|gltf)$/i.test(nameOrPath);
}

/** Basename without the .glb/.gltf extension, for the catalog display name. */
export function modelName(nameOrPath: string): string {
  const base = nameOrPath.split('/').pop() ?? nameOrPath;
  return base.replace(/\.(glb|gltf)$/i, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/furniture/upload/bulkImport.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/upload/bulkImport.ts src/furniture/upload/bulkImport.test.ts
git commit -m "feat: bulk import file filter + name derivation"
```

---

## Task 2: Name dedupe helper

**Files:**
- Modify: `src/furniture/upload/bulkImport.ts`
- Test: `src/furniture/upload/bulkImport.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `bulkImport.test.ts`:

```ts
import { dedupeName } from './bulkImport';

describe('bulkImport name dedupe', () => {
  it('returns the name unchanged when unused', () => {
    const used = new Set<string>();
    expect(dedupeName('Chair', used)).toBe('Chair');
  });

  it('suffixes (2), (3) on collision and reserves each result', () => {
    const used = new Set<string>(['Chair']);
    expect(dedupeName('Chair', used)).toBe('Chair (2)');
    expect(dedupeName('Chair', used)).toBe('Chair (3)');
    expect(dedupeName('Sofa', used)).toBe('Sofa');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/furniture/upload/bulkImport.test.ts`
Expected: FAIL — `dedupeName is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `bulkImport.ts`:

```ts
/** Returns `base`, or `base (2)`, `base (3)`… if already in `used`.
 *  Mutates `used` to reserve whatever it returns. */
export function dedupeName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  const result = `${base} (${n})`;
  used.add(result);
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/furniture/upload/bulkImport.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/upload/bulkImport.ts src/furniture/upload/bulkImport.test.ts
git commit -m "feat: bulk import name dedupe helper"
```

---

## Task 3: `importGlbFiles` — orchestration over the batch

**Files:**
- Modify: `src/furniture/upload/bulkImport.ts`
- Test: `src/furniture/upload/bulkImport.test.ts`

This is the core. It reads existing `userFurniture` names to seed dedupe, filters non-model files (recording them as skipped), and runs `persistUserGlb` over the rest through a bounded pool, reporting progress and per-file outcomes.

- [ ] **Step 1: Write the failing test**

Add to the top of `bulkImport.test.ts` (imports + fixture + helpers), and a new describe block. The `duck.glb` fixture and `URL.createObjectURL` stub follow `src/state/storage/hydratePacks.test.ts`.

```ts
import { beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { importGlbFiles } from './bulkImport';
import { useStore } from '../../state/store';
import { IdbAssetStore } from '../../state/storage/IdbAssetStore';

const duckBytes = readFileSync(
  resolve(__dirname, '../../../scripts/asset-pipeline/__tests__/fixtures/duck.glb'),
);

function glbFile(name: string, relPath?: string): File {
  const f = new File([new Uint8Array(duckBytes)], name, { type: 'model/gltf-binary' });
  if (relPath) Object.defineProperty(f, 'webkitRelativePath', { value: relPath });
  return f;
}
function textFile(name: string): File {
  return new File(['hello'], name, { type: 'text/plain' });
}
function badGlb(name: string): File {
  // 12 bytes with the wrong magic number → validateGlbFile rejects it.
  return new File([new Uint8Array(12)], name, { type: 'model/gltf-binary' });
}

describe('importGlbFiles', () => {
  beforeEach(async () => {
    for (const a of await IdbAssetStore.list()) await IdbAssetStore.delete(a.assetId);
    useStore.getState().setUserFurniture([]);
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:test' });
  });

  it('imports every valid model and registers it in the store', async () => {
    const res = await importGlbFiles(
      [glbFile('chair.glb'), glbFile('table.glb')],
      { category: 'seating' },
    );
    expect(res.total).toBe(2);
    expect(res.imported).toBe(2);
    expect(res.skipped).toEqual([]);
    expect(useStore.getState().userFurniture).toHaveLength(2);
    expect(await IdbAssetStore.list()).toHaveLength(2);
  });

  it('skips non-model files and invalid GLBs, importing the rest', async () => {
    const res = await importGlbFiles(
      [glbFile('ok.glb'), textFile('notes.txt'), badGlb('broken.glb')],
      { category: 'decor' },
    );
    expect(res.total).toBe(3);
    expect(res.imported).toBe(1);
    expect(res.skipped).toHaveLength(2);
    expect(res.skipped.find((s) => s.name === 'notes.txt')?.reason).toBe('not-a-model');
    expect(res.skipped.find((s) => s.name === 'broken.glb')?.reason).toBeTruthy();
    expect(useStore.getState().userFurniture).toHaveLength(1);
  });

  it('dedupes names within the batch and against existing furniture', async () => {
    await importGlbFiles([glbFile('Lamp.glb')], { category: 'lighting' });
    const res = await importGlbFiles(
      [glbFile('Lamp.glb'), glbFile('Lamp.glb')],
      { category: 'lighting' },
    );
    const names = useStore.getState().userFurniture.map((d) => d.name).sort();
    expect(names).toEqual(['Lamp', 'Lamp (2)', 'Lamp (3)']);
    expect(res.imported).toBe(2);
  });

  it('uses the webkitRelativePath basename for naming on folder picks', async () => {
    await importGlbFiles(
      [glbFile('blob', 'MyFolder/sub/Side Table.glb')],
      { category: 'tables' },
    );
    expect(useStore.getState().userFurniture[0].name).toBe('Side Table');
  });

  it('reports progress reaching (total, total)', async () => {
    const calls: Array<[number, number]> = [];
    await importGlbFiles(
      [glbFile('a.glb'), textFile('b.txt'), glbFile('c.glb')],
      { category: 'decor' },
      (done, total) => calls.push([done, total]),
    );
    expect(calls.at(-1)).toEqual([3, 3]);
    expect(calls.every(([, t]) => t === 3)).toBe(true);
  });

  it('imports every valid file even when the batch exceeds the pool size', async () => {
    const files = Array.from({ length: 10 }, (_, i) => glbFile(`m${i}.glb`));
    const res = await importGlbFiles(files, { category: 'decor', concurrency: 3 });
    expect(res.imported).toBe(10);
    expect(useStore.getState().userFurniture).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/furniture/upload/bulkImport.test.ts`
Expected: FAIL — `importGlbFiles is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `bulkImport.ts` (keep the helpers from Tasks 1–2):

```ts
import { persistUserGlb } from './persist';
import { useStore } from '../../state/store';

export interface BulkImportOptions {
  category: FurnitureCategory;
  concurrency?: number;
}

export interface SkippedFile {
  name: string;
  reason: string;
}

export interface BulkImportResult {
  total: number;
  imported: number;
  skipped: SkippedFile[];
}

interface PlannedFile {
  file: File;
  display: string; // basename for reporting
  name: string;    // deduped catalog name
}

/** Imports a batch of user-selected files. Filters to .glb/.gltf, dedupes
 *  display names, and runs persistUserGlb through a bounded pool. One bad
 *  file never aborts the batch — it is recorded in `skipped`. */
export async function importGlbFiles(
  files: File[],
  opts: BulkImportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkImportResult> {
  const total = files.length;
  const skipped: SkippedFile[] = [];
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  // Seed dedupe with names already in the catalog.
  const used = new Set(useStore.getState().userFurniture.map((d) => d.name));

  // Partition: non-model files are skipped immediately (and counted).
  const planned: PlannedFile[] = [];
  for (const file of files) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (!isModelFile(path)) {
      skipped.push({ name: file.name, reason: 'not-a-model' });
      tick();
      continue;
    }
    planned.push({ file, display: file.name, name: dedupeName(modelName(path), used) });
  }

  let imported = 0;
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < planned.length) {
      const job = planned[cursor++];
      try {
        const result = await persistUserGlb(job.file, { name: job.name, category: opts.category });
        if (result.ok) imported++;
        else skipped.push({ name: job.display, reason: result.reason });
      } catch (e) {
        skipped.push({ name: job.display, reason: e instanceof Error ? e.message : String(e) });
      }
      tick();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, planned.length) }, () => worker()),
  );

  return { total, imported, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/furniture/upload/bulkImport.test.ts`
Expected: PASS (all `importGlbFiles` tests + the 4 helper tests).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/upload/bulkImport.ts src/furniture/upload/bulkImport.test.ts
git commit -m "feat: importGlbFiles batch orchestration with bounded concurrency"
```

---

## Task 4: Dialog — multi-file + folder inputs and batch state

**Files:**
- Modify: `src/ui/upload/UploadModelDialog.tsx`

This task rewrites the dialog to collect a `File[]` from either a multi-file input or a `webkitdirectory` folder input, keeping the single-file name field only when exactly one model file is chosen. No new test framework — logic is in `bulkImport.ts` (already tested).

- [ ] **Step 1: Replace the component body**

Replace the entire contents of `src/ui/upload/UploadModelDialog.tsx` with:

```tsx
import { useState } from 'react';
import {
  FURNITURE_CATEGORIES,
  type FurnitureCategory,
} from '../../furniture/types';
import { persistUserGlb } from '../../furniture/upload/persist';
import {
  importGlbFiles,
  isModelFile,
  modelName,
  type BulkImportResult,
} from '../../furniture/upload/bulkImport';

interface UploadModelDialogProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  beds: 'Beds',
  seating: 'Seating',
  tables: 'Tables',
  storage: 'Storage',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  appliances: 'Appliances',
  lighting: 'Lighting',
  decor: 'Decor',
};

export function UploadModelDialog({ open, onClose }: UploadModelDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FurnitureCategory>('decor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  if (!open) return null;

  // Files that will actually be imported (folder picks include junk).
  const modelFiles = files.filter((f) => {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    return isModelFile(path);
  });
  const single = modelFiles.length === 1 && files.length === 1;

  const reset = () => {
    setFiles([]);
    setName('');
    setCategory('decor');
    setError(null);
    setBusy(false);
    setProgress(null);
    setResult(null);
    setShowSkipped(false);
  };

  const onPick = (list: FileList | null) => {
    const picked = list ? Array.from(list) : [];
    setFiles(picked);
    setResult(null);
    setError(null);
    const models = picked.filter((f) => {
      const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      return isModelFile(path);
    });
    if (models.length === 1 && picked.length === 1) {
      setName(modelName(picked[0].name));
    } else {
      setName('');
    }
  };

  const submit = async () => {
    if (modelFiles.length === 0) {
      setError('Pick at least one .glb or .gltf file.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);

    if (single) {
      if (!name.trim()) {
        setError('Enter a name.');
        setBusy(false);
        return;
      }
      const r = await persistUserGlb(files[0], { name: name.trim(), category });
      setBusy(false);
      if (!r.ok) {
        setError(r.reason);
        return;
      }
      reset();
      onClose();
      return;
    }

    setProgress({ done: 0, total: files.length });
    const r = await importGlbFiles(files, { category }, (done, total) =>
      setProgress({ done, total }),
    );
    setBusy(false);
    setProgress(null);
    setResult(r);
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg bg-white p-5 text-sm shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-neutral-900">Upload models</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Pick one or more self-contained <span className="font-mono">.glb</span>/
          <span className="font-mono">.gltf</span> files, or a whole folder (max
          25&nbsp;MB each). Files are stored locally in your browser only.
        </p>

        {result ? (
          <div className="space-y-2">
            <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              Imported {result.imported}, skipped {result.skipped.length} of {result.total}.
            </p>
            {result.skipped.length > 0 ? (
              <div className="text-xs">
                <button
                  onClick={() => setShowSkipped((v) => !v)}
                  className="text-neutral-600 underline"
                >
                  {showSkipped ? 'Hide' : 'Show'} skipped files
                </button>
                {showSkipped ? (
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
                    {result.skipped.map((s, i) => (
                      <li key={i} className="text-neutral-500">
                        <span className="font-mono">{s.name}</span> — {s.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-600">Files</span>
              <input
                type="file"
                multiple
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                onChange={(e) => onPick(e.target.files)}
                disabled={busy}
                className="block w-full text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-600">…or a folder</span>
              <input
                type="file"
                // @ts-expect-error non-standard but widely supported folder pick
                webkitdirectory=""
                directory=""
                multiple
                onChange={(e) => onPick(e.target.files)}
                disabled={busy}
                className="block w-full text-xs"
              />
            </label>
            {modelFiles.length > 0 ? (
              <p className="text-xs text-neutral-500">
                {modelFiles.length} model file{modelFiles.length === 1 ? '' : 's'} selected
                {files.length > modelFiles.length
                  ? ` (${files.length - modelFiles.length} non-model ignored)`
                  : ''}
                .
              </p>
            ) : null}
            {single ? (
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-600">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Vintage armchair"
                  className="block w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-600">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FurnitureCategory)}
                disabled={busy}
                className="block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
              >
                {FURNITURE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            {progress ? (
              <p className="text-xs text-neutral-600">
                Importing {progress.done} / {progress.total}…
              </p>
            ) : null}
            {error ? (
              <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</p>
            ) : null}
          </div>
        )}

        <footer className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
            disabled={busy}
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {result ? (
            <button
              onClick={reset}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            >
              Import more
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={busy || modelFiles.length === 0 || (single && !name.trim())}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {busy ? 'Importing…' : single ? 'Save' : `Import ${modelFiles.length}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run build`
Expected: `tsc` passes (no type errors) and Vite build completes. The `webkitdirectory` attribute uses `@ts-expect-error`; if `tsc` reports the directive is *unused* on any line, remove that single directive.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new `bulkImport.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/upload/UploadModelDialog.tsx
git commit -m "feat: bulk + folder model import in upload dialog"
```

---

## Task 5: Manual verification + docs

**Files:**
- Modify: `CLAUDE.md` (the "Adding content" / furniture upload area, if upload is documented there)

- [ ] **Step 1: Manual smoke test in the dev server**

Run: `npm run dev`, open the catalog drawer → "Upload model…".
- Multi-select two `.glb` files → button reads "Import 2" → summary "Imported 2, skipped 0".
- Pick a folder containing GLBs + a README → non-model count shown as ignored; summary lists only the README under skipped (reason `not-a-model`) if it was counted, or simply imports the GLBs.
- Reload the page → imported items still appear in the catalog (hydration works).
- Confirm a single-file pick still shows the Name field and saves as before.

- [ ] **Step 2: Document the feature**

If `CLAUDE.md` documents the user-upload path, add one line noting bulk/folder import. If it does not mention uploads at all, skip this step (do not invent a section). Example addition where uploads are described:

```
  Users can bulk-import many models at once (multi-select or a folder pick)
  via the upload dialog; non-model files are ignored and per-file failures
  are reported (`furniture/upload/bulkImport.ts`).
```

- [ ] **Step 3: Commit (only if CLAUDE.md changed)**

```bash
git add CLAUDE.md
git commit -m "docs: note bulk/folder model import"
```

---

## Self-Review Notes

- **Spec coverage:** multi-file + folder (Task 4) ✓; filter to .glb/.gltf (Task 1) ✓; dedupe names (Task 2) ✓; bounded concurrency, no hard cap (Task 3) ✓; import-all-report-rejects with reasons (Task 3 + summary UI Task 4) ✓; progress reaching total (Task 3 test + Task 4 UI) ✓; single-file path unchanged (Task 4 `single` branch) ✓; persistence/hydration unchanged (no edits to those modules) ✓; tests via fake-indexeddb + duck.glb fixture (Task 3) ✓.
- **No placeholders:** every code step is complete and runnable.
- **Type consistency:** `BulkImportResult`/`SkippedFile`/`BulkImportOptions`, `isModelFile`, `modelName`, `dedupeName`, `importGlbFiles` are defined in Tasks 1–3 and consumed with the same signatures in Task 4. `persistUserGlb`/`PersistResult` and `setUserFurniture` match the existing code read during planning.
