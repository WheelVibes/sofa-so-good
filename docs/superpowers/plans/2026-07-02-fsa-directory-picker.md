# FSA Directory Picker with Native Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pick upload folders via the File System Access API on Chromium (no native "Upload N files?" prompt, live scan progress from file #1), transparently falling back to the native `<input webkitdirectory>` on other browsers.

**Architecture:** A new pure `pickDirectory.ts` module detects `showDirectoryPicker` support and walks a picked `FileSystemDirectoryHandle` with a bounded worker pool (mirroring `readDrop.ts`), producing `File[]` with `webkitRelativePath` set so the existing detection/import flow is unchanged. The dialog's "Choose folder…" button routes to it when supported, else clicks the native input.

**Tech Stack:** React + TypeScript, Vitest, Biome. Browser File System Access API (`window.showDirectoryPicker`), `FileSystemDirectoryHandle.entries()`.

## Global Constraints

- Biome style: 2-space indent, 100-col, single quotes, **no semicolons**. Run `npm run check:fix` before committing.
- **No hardcoded colour** — token class vocabulary only (`text-[var(--text-3)]`, etc.).
- No new feature flag — this is a transparent capability upgrade inside the already-flagged `modelUpload` feature (tier `simple`, default on). No both-mode tests required.
- Drag-drop path (`readDrop.ts`) and the native `<input webkitdirectory>` element stay unchanged (the latter is the non-Chromium fallback).
- `webkitRelativePath` convention: full path from the picked root, **no leading slash**, `/`-separated — matches `readDrop.ts`.
- Versioning: bump `build` in `src/version.ts` (`APP_VERSION`). Current: `0.9.0.69` → target `0.9.0.70`. `package.json` stays `0.9.0`.
- Iterate with targeted `npx vitest --run <path>`; full `npm test` + `tsc` + `biome` once before the final commit.
- Log shipped work in `CHANGELOG.md`; update `docs/ARCHITECTURE.md` upload section. Visual verification per `docs/visual-verification-playbook.md`.

---

### Task 1: `pickDirectory.ts` — capability detection + directory walk

**Files:**
- Create: `src/furniture/upload/pickDirectory.ts`
- Test: `src/furniture/upload/pickDirectory.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DIR_READ_CONCURRENCY: number` (exported const, `24`).
  - `supportsDirectoryPicker(): boolean` — `typeof window !== 'undefined' && 'showDirectoryPicker' in window`.
  - `pickDirectoryFiles(onProgress?: (count: number) => void): Promise<File[] | null>` — opens `window.showDirectoryPicker()`, returns `null` on `AbortError` (user cancel), otherwise walks the tree with a bounded pool and resolves `File[]` (each with `webkitRelativePath` set); `onProgress(count)` fires once per file. Non-abort errors propagate.

- [ ] **Step 1: Write the failing tests**

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DIR_READ_CONCURRENCY, pickDirectoryFiles, supportsDirectoryPicker } from './pickDirectory'

// Fakes for the File System Access API handle tree.
function fileHandle(name: string, bytes = 4, getFile?: () => Promise<File>) {
  return {
    kind: 'file' as const,
    name,
    getFile: getFile ?? (async () => new File([new Uint8Array(bytes)], name)),
  }
}
function dirHandle(name: string, children: any[]) {
  return {
    kind: 'directory' as const,
    name,
    async *entries() {
      for (const c of children) yield [c.name, c] as [string, any]
    },
  }
}
function stubPicker(root: any) {
  vi.stubGlobal('window', { showDirectoryPicker: async () => root })
}

afterEach(() => vi.unstubAllGlobals())

describe('supportsDirectoryPicker', () => {
  it('true when window.showDirectoryPicker exists', () => {
    vi.stubGlobal('window', { showDirectoryPicker: () => {} })
    expect(supportsDirectoryPicker()).toBe(true)
  })
  it('false when absent', () => {
    vi.stubGlobal('window', {})
    expect(supportsDirectoryPicker()).toBe(false)
  })
})

describe('pickDirectoryFiles', () => {
  it('recurses the picked tree, preserving relative paths', async () => {
    stubPicker(
      dirHandle('root', [
        dirHandle('malm', [fileHandle('white.glb'), fileHandle('metadata.json')]),
        fileHandle('loose.glb'),
      ]),
    )
    const files = await pickDirectoryFiles()
    const paths = (files ?? [])
      .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath)
      .sort()
    expect(paths).toEqual(['loose.glb', 'malm/metadata.json', 'malm/white.glb'])
  })

  it('reports progress once per file ending at the total', async () => {
    const kids = Array.from({ length: 30 }, (_, i) => fileHandle(`f${i}.glb`))
    stubPicker(dirHandle('root', [dirHandle('big', kids)]))
    const seen: number[] = []
    const files = await pickDirectoryFiles((n) => seen.push(n))
    expect(files).toHaveLength(30)
    expect(seen).toHaveLength(30)
    expect(Math.max(...seen)).toBe(30)
  })

  it('returns null when the user cancels (AbortError)', async () => {
    vi.stubGlobal('window', {
      showDirectoryPicker: async () => {
        throw new DOMException('cancelled', 'AbortError')
      },
    })
    expect(await pickDirectoryFiles()).toBeNull()
  })

  it('propagates non-abort errors', async () => {
    vi.stubGlobal('window', {
      showDirectoryPicker: async () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    await expect(pickDirectoryFiles()).rejects.toThrow('blocked')
  })

  it('bounds concurrency — never more than the cap of reads in flight', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const slow = (name: string) =>
      fileHandle(name, 4, () => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        return Promise.resolve()
          .then(() => Promise.resolve())
          .then(() => {
            inFlight--
            return new File([new Uint8Array(2)], name)
          })
      })
    const kids = Array.from({ length: 100 }, (_, i) => slow(`f${i}.glb`))
    stubPicker(dirHandle('root', [dirHandle('big', kids)]))
    const files = await pickDirectoryFiles()
    expect(files).toHaveLength(100)
    expect(maxInFlight).toBeGreaterThan(1)
    expect(maxInFlight).toBeLessThanOrEqual(DIR_READ_CONCURRENCY)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest --run src/furniture/upload/pickDirectory.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Write the implementation**

```typescript
/** Max concurrent File System Access reads (getFile / entries) in flight at
 *  once. The walk is async-I/O-bound per entry, so reading siblings concurrently
 *  is a big speedup on large folders; bounded so a folder with thousands of files
 *  can't spike memory or open handles. Mirrors readDrop.ts's READ_CONCURRENCY. */
export const DIR_READ_CONCURRENCY = 24

/** True when the browser exposes the File System Access directory picker
 *  (Chromium). Other browsers (Firefox/Safari) return false → callers fall back
 *  to the native <input webkitdirectory>. */
export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

// Minimal shape of the File System Access handles we touch (lib.dom types for
// these are not present in every TS target).
interface FsFileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
}
interface FsDirHandle {
  kind: 'directory'
  name: string
  entries(): AsyncIterableIterator<[string, FsFileHandle | FsDirHandle]>
}
type FsHandle = FsFileHandle | FsDirHandle

/** Open the FSA directory picker and read every file out of the chosen folder,
 *  recursing into subfolders. Each File gets its `webkitRelativePath` set to its
 *  path from the picked root (no leading slash) so IKEA group detection sees the
 *  folder structure — identical to the drag-drop path. Returns `null` if the user
 *  cancels the picker (AbortError). The walk runs a bounded worker pool
 *  (DIR_READ_CONCURRENCY): entries are read concurrently rather than one-at-a-time.
 *  `onProgress(count)` fires as each file is read so the UI can show the scan
 *  advancing from the first file — no native "Upload N files?" prompt. */
export async function pickDirectoryFiles(
  onProgress?: (count: number) => void,
): Promise<File[] | null> {
  let root: FsDirHandle
  try {
    root = (await (window as unknown as {
      showDirectoryPicker: () => Promise<FsDirHandle>
    }).showDirectoryPicker()) as FsDirHandle
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }

  const out: File[] = []
  // A work queue of pending handles + a fixed set of workers draining it.
  // Expanding a directory enqueues its children, so the queue grows as we descend
  // and the pool stays saturated up to DIR_READ_CONCURRENCY across the whole tree.
  const queue: { handle: FsHandle; path: string }[] = [{ handle: root, path: '' }]
  let active = 0
  let drained: () => void
  const done = new Promise<void>((r) => {
    drained = r
  })

  const pump = () => {
    if (queue.length === 0 && active === 0) {
      drained()
      return
    }
    while (active < DIR_READ_CONCURRENCY && queue.length > 0) {
      const task = queue.shift()!
      active++
      void process(task).finally(() => {
        active--
        pump()
      })
    }
  }

  const process = async ({ handle, path }: { handle: FsHandle; path: string }): Promise<void> => {
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      if (!('webkitRelativePath' in file) || !file.webkitRelativePath)
        Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true })
      out.push(file)
      onProgress?.(out.length)
    } else {
      for await (const [name, child] of handle.entries()) {
        queue.push({ handle: child, path: path ? `${path}/${name}` : name })
        pump() // new work available — saturate the pool as children surface
      }
    }
  }

  pump()
  await done
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/furniture/upload/pickDirectory.test.ts`
Expected: PASS (all 6+ tests).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/upload/pickDirectory.ts src/furniture/upload/pickDirectory.test.ts
git commit -m "FEAT: File System Access directory picker walker (Chromium)"
```

---

### Task 2: Wire the dialog's "Choose folder…" to the FSA picker with native fallback

**Files:**
- Modify: `src/ui/upload/UploadModelDialog.tsx`

**Interfaces:**
- Consumes: `supportsDirectoryPicker`, `pickDirectoryFiles` (Task 1); `coalesceProgress`, `ingest`, `setScanCount`, `setError`, `folderInput` (existing).
- Produces: no exported API change — internal `chooseFolder` handler only.

No unit test (React interaction wiring, verified visually in Task 3). Each edit is minimal.

- [ ] **Step 1: Add the import**

Add alongside the existing `readDrop` import in `src/ui/upload/UploadModelDialog.tsx`:

```typescript
import { pickDirectoryFiles, supportsDirectoryPicker } from '../../furniture/upload/pickDirectory'
```

- [ ] **Step 2: Add a `chooseFolder` handler after `onDrop`**

Insert immediately after the `onDrop` function (currently ends at line ~248, before `const submit`):

```typescript
  // "Choose folder…" — on Chromium, use the File System Access picker (no native
  // "Upload N files?" prompt; live scan progress from the first file). Elsewhere,
  // or if the picker is blocked at call time, fall back to the native
  // <input webkitdirectory>.
  const chooseFolder = async () => {
    if (busy || scanCount !== null) return
    if (!supportsDirectoryPicker()) {
      folderInput.current?.click()
      return
    }
    setScanCount(0)
    const scan = coalesceProgress<number>((n) => setScanCount(n))
    try {
      const picked = await pickDirectoryFiles((n) => scan.push(n))
      scan.flush()
      if (picked && picked.length > 0) ingest(picked)
    } catch (e) {
      // Picker unavailable/blocked (e.g. non-secure context) → native fallback;
      // any other failure surfaces as an error.
      const name = e instanceof DOMException ? e.name : ''
      if (name === 'SecurityError' || name === 'NotAllowedError') folderInput.current?.click()
      else setError(e instanceof Error ? e.message : String(e))
    } finally {
      setScanCount(null)
    }
  }
```

- [ ] **Step 3: Point the button at `chooseFolder`**

Replace the button's `onClick` (line ~380):

```tsx
                    onClick={chooseFolder}
```

(was `onClick={() => folderInput.current?.click()}`)

- [ ] **Step 4: Make the drag hint conditional**

The existing hint tells users to drag for live progress + to skip the native prompt. On Chromium the
"Choose folder…" button now gives both too, so the hint only applies when the FSA picker is NOT
available. Wrap it. Replace the hint span (lines ~386-389):

```tsx
                  {!supportsDirectoryPicker() ? (
                    <span className="mt-1 block text-[10px] text-[var(--text-3)]">
                      Tip: drag a folder in for live progress (skips the browser’s “upload N files?”
                      prompt).
                    </span>
                  ) : null}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npm run check:fix`
Expected: no type errors; Biome formats cleanly.

- [ ] **Step 6: Commit**

```bash
git add src/ui/upload/UploadModelDialog.tsx
git commit -m "FEAT: route Choose folder to FSA picker on Chromium, native fallback elsewhere"
```

---

### Task 3: Visual verification, docs, version bump, full sweep

**Files:**
- Modify: `src/version.ts:14`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`
- Possibly modify: `docs/visual-verification-playbook.md`

**Interfaces:** none.

- [ ] **Step 1: Read the playbook**

Read `docs/visual-verification-playbook.md` (lazy-modal + temp-hook rules; the upload dialog is lazy).

- [ ] **Step 2: Direct-mount the dialog with a fake directory handle**

The real OS picker can't open headless. In `src/main.tsx`, inside a TEMP `import.meta.env.DEV &&
location.search.includes('__uploadverify')` block, mount `<UploadModelDialog open onClose={()=>{}}/>`
into a body node AND stub `window.showDirectoryPicker` to resolve a fake handle tree (several
`metadata.json`+`glb` groups). Then a scenario clicks "Choose folder…", waits for "Scanning folder…"
then "model group" text, and screenshots. (Same temp-hook approach used for the detection-progress
verification.)

- [ ] **Step 3: Run the scenario and review pixels**

Start a dev server on a fixed port, run `node scripts/shot.mjs --scenario <file> --out-dir /tmp/fsa`.
Confirm: (a) clicking "Choose folder…" drives the "Scanning folder… N files" UI (no native prompt),
(b) groups then detect and render, (c) the drag hint is hidden when the picker is supported. Report
what you saw. Add any new harness gotcha (e.g. stubbing `showDirectoryPicker`) to the playbook.

- [ ] **Step 4: Revert temp hooks + confirm clean tree**

Run: `git checkout src/main.tsx && rm -f scripts/scenarios/<temp scenario>` then `git status` — nothing
of yours left behind (per playbook rule 3).

- [ ] **Step 5: Bump version**

Edit `src/version.ts` line 14: `export const APP_VERSION = '0.9.0.70'` (package.json stays `0.9.0`).

- [ ] **Step 6: Update CHANGELOG.md + ARCHITECTURE.md**

Add a CHANGELOG entry (v0.9.0.70): FSA directory picker on Chromium (no native "Upload N files?"
prompt, live scan progress from file #1) with native `<input webkitdirectory>` fallback on other
browsers; new `pickDirectory.ts` bounded-pool walker; drag hint hidden when the picker is supported.
Add a one-line note to the upload section of `docs/ARCHITECTURE.md` describing the two folder-pick
paths.

- [ ] **Step 7: Full verification sweep**

Run: `npm test && npx tsc --noEmit && npm run check`
Expected: green (note: any failures outside `upload/`/`ikea/` are unrelated concurrent work — verify
they are not in files this plan touched).

- [ ] **Step 8: Commit**

```bash
git add src/version.ts CHANGELOG.md docs/ARCHITECTURE.md docs/visual-verification-playbook.md
git commit -m "CHORE: FSA directory picker — docs, changelog, v0.9.0.70"
```

---

## Self-Review

**Spec coverage:**
- `pickDirectory.ts` (`supportsDirectoryPicker`, `pickDirectoryFiles`, `DIR_READ_CONCURRENCY`, bounded pool, `webkitRelativePath`, progress, abort→null) → Task 1. ✓
- Dialog wiring (FSA when supported, native fallback, coalesced scan UI) → Task 2 steps 2-3. ✓
- Error handling (AbortError→null in Task 1; SecurityError/NotAllowedError→native, else setError in Task 2) → Task 1 step 3 + Task 2 step 2. ✓
- Drag hint conditional on capability → Task 2 step 4. ✓
- No new flag / no both-mode tests → Global Constraints. ✓
- Native input stays as fallback → unchanged in Task 2. ✓
- Testing (unit + visual) → Task 1 unit; Task 3 visual + full sweep. ✓
- Docs (changelog, version, architecture, playbook) → Task 3. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — all code inline. ✓

**Type consistency:** `pickDirectoryFiles(onProgress?)` → `Promise<File[] | null>` used identically in Task 2. `supportsDirectoryPicker(): boolean` used in Task 2 handler + hint. `DIR_READ_CONCURRENCY` defined/used in Task 1. ✓
