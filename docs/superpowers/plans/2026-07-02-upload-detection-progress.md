# Granular Upload Folder-Detection Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make folder detection in the model-upload dialog give instant, smoothly-animating progress instead of freezing and only surfacing the native browser bulk-file prompt.

**Architecture:** Extract the rAF progress-coalescing pattern already living inline in `runImport.ts` into a reusable helper, then apply it to the drag-scan and metadata-detection counters so thousands of updates collapse to one repaint per frame. Parallelize `detectGroups`' serial metadata reads with a bounded worker pool (mirroring `readDrop.ts`). Acknowledge picker-path file counts instantly, and nudge users toward drag-drop.

**Tech Stack:** React + TypeScript, Vitest, Biome. Browser `requestAnimationFrame`, HTML5 entries API (already in use).

## Global Constraints

- Biome style: 2-space indent, 100-col, single quotes, **no semicolons**. Run `npm run check:fix` before committing.
- **No hardcoded colour** — use the token class vocabulary (`text-[var(--text-2)]`, `text-[var(--text-3)]`, etc.), never literal hex or Tailwind colour utilities.
- Drag-and-drop drop zones stay a `<div>` (never a `<button>`) — unchanged here, do not regress it.
- This upload dialog's visibility is **not** Simple/Pro mode-dependent — no new both-mode tests required, but do not introduce mode-dependent behaviour.
- Versioning: bump `build` in both `src/version.ts` (`APP_VERSION`) and `package.json`. Current: `0.9.0.65` → target `0.9.0.66`.
- Iterate with targeted `npx vitest --run <path>`; run the full `npm test` + `tsc` + `biome` exactly once right before the final commit.
- Log shipped work in `CHANGELOG.md`. Visual verification per `docs/visual-verification-playbook.md` after app changes.

---

### Task 1: Reusable rAF progress coalescer

**Files:**
- Create: `src/furniture/upload/coalesceProgress.ts`
- Test: `src/furniture/upload/coalesceProgress.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `coalesceProgress<T>(sink: (value: T) => void): { push: (value: T) => void; flush: () => void }`
    — `push(v)` stores the latest value and schedules one `requestAnimationFrame` (falling back to
    `setTimeout(cb, 16)` when `requestAnimationFrame` is not a function) that calls `sink` with the
    most recent value; multiple `push` calls before the frame fires collapse to a single `sink`
    call. `flush()` synchronously delivers the latest un-delivered value (if any) and cancels a
    pending frame — used to guarantee the terminal value is not dropped.

- [ ] **Step 1: Write the failing tests**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coalesceProgress } from './coalesceProgress'

describe('coalesceProgress', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('collapses many pushes before the frame into a single sink call with the latest value', () => {
    const sink = vi.fn()
    const c = coalesceProgress<number>(sink)
    c.push(1)
    c.push(2)
    c.push(3)
    expect(sink).not.toHaveBeenCalled() // nothing until the frame fires
    vi.advanceTimersByTime(16) // setTimeout fallback (rAF stubbed undefined)
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenLastCalledWith(3)
  })

  it('flush() delivers the latest value synchronously and cancels the pending frame', () => {
    const sink = vi.fn()
    const c = coalesceProgress<number>(sink)
    c.push(7)
    c.flush()
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenLastCalledWith(7)
    vi.advanceTimersByTime(16) // pending frame was cancelled — no second call
    expect(sink).toHaveBeenCalledTimes(1)
  })

  it('flush() with nothing pending is a no-op', () => {
    const sink = vi.fn()
    const c = coalesceProgress<number>(sink)
    c.flush()
    expect(sink).not.toHaveBeenCalled()
  })

  it('prefers requestAnimationFrame when available', () => {
    const raf = vi.fn((cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const sink = vi.fn()
    const c = coalesceProgress<number>(sink)
    c.push(5)
    expect(raf).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenLastCalledWith(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/furniture/upload/coalesceProgress.test.ts`
Expected: FAIL — `coalesceProgress` is not defined / module not found.

- [ ] **Step 3: Write the implementation**

```typescript
/** Coalesce a high-frequency progress stream to at most one `sink` call per
 *  animation frame. A tight loop (thousands of files) can call `push` far faster
 *  than the screen refreshes; without this, each call is a React setState that
 *  thrashes reconciliation and starves paint, so the counter freezes then jumps.
 *  `push` stores the latest value and schedules a single frame; `flush` delivers
 *  the last value synchronously so a terminal value is never dropped.
 *
 *  Uses `requestAnimationFrame` when available, falling back to a ~16ms timer so
 *  it also works in non-DOM/test environments. */
export function coalesceProgress<T>(sink: (value: T) => void): {
  push: (value: T) => void
  flush: () => void
} {
  const hasRaf = typeof requestAnimationFrame === 'function'
  const schedule = hasRaf
    ? (cb: () => void) => requestAnimationFrame(cb)
    : (cb: () => void) => setTimeout(cb, 16) as unknown as number
  const cancel = hasRaf
    ? (id: number) => cancelAnimationFrame(id)
    : (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)

  let handle: number | null = null
  let latest: T
  let has = false

  const deliver = () => {
    handle = null
    if (!has) return
    has = false
    sink(latest)
  }

  return {
    push(value: T) {
      latest = value
      has = true
      if (handle === null) handle = schedule(deliver)
    },
    flush() {
      if (handle !== null) {
        cancel(handle)
        handle = null
      }
      if (!has) return
      has = false
      sink(latest)
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/furniture/upload/coalesceProgress.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/upload/coalesceProgress.ts src/furniture/upload/coalesceProgress.test.ts
git commit -m "FEAT: reusable rAF progress coalescer for upload flows"
```

---

### Task 2: Refactor runImport to use the coalescer

**Files:**
- Modify: `src/furniture/upload/runImport.ts:139-159`

**Interfaces:**
- Consumes: `coalesceProgress` from Task 1.
- Produces: no API change — `startBackgroundImport` keeps the same signature and behaviour.

**Rationale:** Proves the extracted helper reproduces the existing inline behaviour and removes the duplicated rAF plumbing. `runImport.test.ts` must stay green with no edits.

- [ ] **Step 1: Add the import**

At the top of `src/furniture/upload/runImport.ts`, alongside the existing imports:

```typescript
import { coalesceProgress } from './coalesceProgress'
```

- [ ] **Step 2: Replace the inline rAF coalescing in `startBackgroundImport`**

Replace the block from `let latest = { d: 0, t: planUnits(plan) }` through the end of the `raf`
declaration and the `runImport(plan, (d, t) => {...})` progress callback (currently lines ~139-159)
with:

```typescript
  // Coalesce progress to ~one store write per animation frame: a 3562-group
  // import fires onProgress thousands of times; one notify.update each would
  // re-render the notification (and its subscribers) per group, piling onto the
  // main thread we're trying to keep free.
  const total0 = planUnits(plan)
  const progress = coalesceProgress<{ d: number; t: number }>(({ d, t }) => {
    notify.update(id, {
      progress: t ? d / t : 0,
      message: `${d} / ${t}`,
    })
  })

  return runImport(plan, (d, t) => progress.push({ d, t }))
    .then((outcome) => {
      progress.flush()
```

Note: `total0` documents the initial total; the real values flow through `push`. Keep the rest of
the `.then(...)` body (the summary/notify.success/notify.error logic) and the `.catch(...)`
unchanged, but ensure `progress.flush()` is the first statement inside `.then` so the final
`done / total` shows before the success message replaces it. Remove the now-unused `latest`,
`scheduled`, `pushProgress`, and `raf` declarations.

- [ ] **Step 3: Run runImport tests to verify no regression**

Run: `npx vitest --run src/furniture/upload/runImport.test.ts`
Expected: PASS (unchanged behaviour).

- [ ] **Step 4: Typecheck the touched file’s project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/furniture/upload/runImport.ts
git commit -m "REFACTOR: runImport uses shared coalesceProgress helper"
```

---

### Task 3: Parallelize detectGroups metadata reads

**Files:**
- Modify: `src/furniture/ikea/detectGroups.ts:24-48`
- Test: `src/furniture/ikea/detectGroups.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `DETECT_CONCURRENCY: number` (exported const, value `12`) — max concurrent `metadata.json`
    reads in flight.
  - `detectGroups(files: File[], onProgress?: (parsed: number, totalMetadata: number) => void): Promise<DetectedGroup[]>`
    — unchanged signature. Now reads metadata through a bounded pool; **output order is
    deterministic by original metadata-file order** (results slotted by index), and `onProgress`
    fires once per completed file with a monotonically increasing `parsed`.

- [ ] **Step 1: Write the failing tests**

Add these to `src/furniture/ikea/detectGroups.test.ts` inside the existing
`describe('detectGroups', ...)` block (the `fileAt`/`metaFile` helpers already exist in the file):

```typescript
  it('preserves deterministic dir order regardless of read completion order', async () => {
    // Many groups named so lexical order differs from any completion race.
    const files = Array.from({ length: 30 }, (_, i) => [
      metaFile(`catalog/g${i}/metadata.json`, { group_key: `g${i}`, variants: [] }),
      fileAt(`catalog/g${i}/white.glb`),
    ]).flat()
    const groups = await detectGroups(files)
    expect(groups.map((g) => g.dir)).toEqual(
      Array.from({ length: 30 }, (_, i) => `catalog/g${i}/`),
    )
  })

  it('reports monotonic progress ending at the metadata total', async () => {
    const files = Array.from({ length: 10 }, (_, i) =>
      metaFile(`catalog/g${i}/metadata.json`, { group_key: `g${i}`, variants: [] }),
    )
    const seen: Array<[number, number]> = []
    await detectGroups(files, (parsed, total) => seen.push([parsed, total]))
    expect(seen[0]).toEqual([0, 10]) // denominator known up front
    expect(seen[seen.length - 1]).toEqual([10, 10])
    // parsed never decreases
    for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThanOrEqual(seen[i - 1][0])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest --run src/furniture/ikea/detectGroups.test.ts`
Expected: FAIL — new tests fail (order test may already pass by luck; the progress test's
`[0, 10]` first-call assertion holds, but run to confirm current state before changing code).

- [ ] **Step 3: Rewrite the read loop as a bounded pool**

Replace the body of `detectGroups` (the `let parsed = 0` … `return groups` section, currently lines
36-47) with the pooled version, and add the exported const above the function:

```typescript
/** Max concurrent metadata.json reads (read + JSON.parse) in flight. Parsing is
 *  I/O-bound per file; reading a handful concurrently removes the serial stall on
 *  a folder of thousands of groups, bounded so it can't flood the main thread. */
export const DETECT_CONCURRENCY = 12
```

```typescript
  onProgress?.(0, metaFiles.length)
  // Slot results by original index so output order is deterministic (independent
  // of which read finishes first); a null slot = not-a-group / unparseable.
  const slots: (DetectedGroup | null)[] = new Array(metaFiles.length).fill(null)
  let cursor = 0
  let parsed = 0
  const worker = async (): Promise<void> => {
    while (cursor < metaFiles.length) {
      const i = cursor++
      const f = metaFiles[i]
      try {
        const json = JSON.parse(await f.text())
        if (looksLikeIkeaMetadata(json))
          slots[i] = { dir: dirOf(pathOf(f)), meta: json as Record<string, unknown> }
      } catch {
        // ignore unparseable metadata.json
      }
      onProgress?.(++parsed, metaFiles.length)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(DETECT_CONCURRENCY, metaFiles.length) }, () => worker()),
  )
  for (const g of slots) if (g) groups.push(g)
  return groups
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run src/furniture/ikea/detectGroups.test.ts`
Expected: PASS (all — original 3 detectGroups tests + 2 new + filesUnder/looseModelFiles).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/detectGroups.ts src/furniture/ikea/detectGroups.test.ts
git commit -m "PERF: parallelize detectGroups metadata reads (bounded pool, ordered)"
```

---

### Task 4: Coalesce scan + detect progress in the dialog; instant picker acknowledgement; drag hint

**Files:**
- Modify: `src/ui/upload/UploadModelDialog.tsx`

**Interfaces:**
- Consumes: `coalesceProgress` (Task 1), `detectGroups` (Task 3), `readDroppedItems` (existing).
- Produces: no exported API change — internal UX behaviour of `UploadModelDialog` only.

This task has no unit test (pure React interaction wiring, verified visually in Task 5). Keep each
edit minimal and self-contained.

- [ ] **Step 1: Import the coalescer**

Add to the imports at the top of `src/ui/upload/UploadModelDialog.tsx`:

```typescript
import { coalesceProgress } from '../../furniture/upload/coalesceProgress'
```

- [ ] **Step 2: Coalesce the drop-scan counter**

In `onDrop`, wrap the `setScanCount` progress callback through the coalescer and flush at the end so
the final count is never dropped. Replace the current `onDrop` body’s try/finally:

```typescript
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (busy || scanCount !== null) return
    setScanCount(0)
    const scan = coalesceProgress<number>((n) => setScanCount(n))
    try {
      const picked = await readDroppedItems(e.dataTransfer, (n) => scan.push(n))
      scan.flush()
      if (picked.length > 0) ingest(picked)
    } finally {
      setScanCount(null)
    }
  }
```

- [ ] **Step 3: Coalesce the detect-progress counter in `ingest`**

In `ingest`, route `detectGroups`' progress through the coalescer and flush on completion. Replace
the `setDetectProgress({ parsed: 0, total: 0 })` + `detectGroups(...)` block:

```typescript
    // Auto-detect every model-group folder (each has a metadata.json w/
    // group_key). Reads + parses each metadata.json — report progress for the UI,
    // coalesced to one repaint per frame so thousands of groups don't thrash React.
    setDetectProgress({ parsed: 0, total: 0 })
    const detect = coalesceProgress<{ parsed: number; total: number }>((p) => setDetectProgress(p))
    void detectGroups(picked, (parsed, total) => detect.push({ parsed, total }))
      .then((g) => {
        detect.flush()
        setIkeaGroups(g)
      })
      .finally(() => setDetectProgress(null))
```

- [ ] **Step 4: Instant file-count acknowledgement on the picker path**

The picker’s native enumeration is uninstrumentable, but the instant `onChange` fires we hold the
count. `ingest` already runs synchronously up to `setDetectProgress`, so the "Detecting model
groups…" row appears immediately — reinforce it by showing the received count in that row. Update the
detect-progress UI (currently around lines 388-407) so the label always shows the file count even
before the metadata denominator is known:

```tsx
            {detectProgress ? (
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                  <Spinner small />
                  {detectProgress.total > 0
                    ? `Detecting model groups… ${detectProgress.parsed} / ${detectProgress.total}`
                    : `Reading ${files.length} file${files.length === 1 ? '' : 's'}…`}
                </p>
                {detectProgress.total > 0 ? (
                  <div className="h-1 w-full overflow-hidden rounded bg-[var(--surface-3)]">
                    <div
                      className="h-full bg-[var(--accent)] transition-all"
                      style={{
                        width: `${(detectProgress.parsed / detectProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
```

Note: `ingest` calls `setFiles(picked)` before scheduling detection, so `files.length` reflects the
picked count on the render where `detectProgress` first becomes non-null.

- [ ] **Step 5: Add the drag-preference hint under "Choose folder…"**

Immediately after the `Choose folder…` `<button>` (still inside the same non-scanning branch, after
line ~362), add a hint line:

```tsx
                  <span className="mt-1 block text-[10px] text-[var(--text-3)]">
                    Tip: drag a folder in for live progress (skips the browser’s
                    “upload N files?” prompt).
                  </span>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/upload/UploadModelDialog.tsx
git commit -m "FEAT: smooth coalesced scan/detect progress + instant file-count feedback + drag hint"
```

---

### Task 5: Visual verification, full test sweep, version bump, changelog

**Files:**
- Modify: `src/version.ts:14`, `package.json` (version field), `CHANGELOG.md`
- Possibly modify: `docs/visual-verification-playbook.md` (if a new gotcha surfaces)

**Interfaces:** none.

- [ ] **Step 1: Read the visual-verification playbook**

Run: read `docs/visual-verification-playbook.md` for harness rules, gotchas, and the scenario
template before driving the app.

- [ ] **Step 2: Exercise the upload dialog with a large synthetic folder drop**

Start the dev server (`npm run dev`) and use `node scripts/shot.mjs --scenario <file>` (or
`window.__store` + a drop simulation per the playbook) to open the upload dialog and feed a
many-file synthetic folder. Screenshot the **scanning** state and the **detecting** state.

- [ ] **Step 3: Visually review the screenshots**

Confirm: (a) the counter appears immediately, (b) it climbs smoothly rather than freezing then
jumping, (c) the "Reading N files…" / "Detecting model groups… P / T" copy renders correctly in the
token colours, (d) the drag hint reads correctly. Report what you saw. If a new harness gotcha
surfaced, append it to `docs/visual-verification-playbook.md`.

- [ ] **Step 4: Bump the version**

Edit `src/version.ts` line 14:

```typescript
export const APP_VERSION = '0.9.0.66'
```

Edit `package.json` `version` field to `0.9.0.66` (mirrors the first three parts — build not carried
in package.json semver; keep it at `0.9.0`).

- [ ] **Step 5: Update CHANGELOG.md**

Add an entry under the current version line describing: reusable rAF progress coalescer; smooth
coalesced scan + detect progress in the upload dialog; parallelized `detectGroups`; instant
file-count acknowledgement on the picker path; drag-preference hint. Note the native browser
"upload N files?" prompt remains browser-controlled and cannot be suppressed.

- [ ] **Step 6: Full verification sweep (run once)**

Run: `npm test && npx tsc --noEmit && npm run check`
Expected: all green. (Do not run this concurrently with the screenshot harness.)

- [ ] **Step 7: Commit**

```bash
git add src/version.ts package.json CHANGELOG.md docs/visual-verification-playbook.md
git commit -m "CHORE: upload detection progress — visual verify, changelog, v0.9.0.66"
```

---

## Self-Review

**Spec coverage:**
- rAF coalescer helper → Task 1. ✓
- Applied to scanCount (drop) + detectProgress (both) → Task 4 steps 2-3. ✓
- runImport reuses helper → Task 2. ✓
- Instant picker file-count acknowledgement → Task 4 step 4. ✓
- Parallelized detectGroups, deterministic order, tests updated → Task 3. ✓
- Drag-preference hint → Task 4 step 5. ✓
- Out of scope (native prompt, import phase) → not touched; changelog notes the prompt limitation. ✓
- Testing/verification (unit + visual + both-mode note) → Tasks 1,3 unit; Task 5 visual + full sweep;
  mode-agnostic noted in Global Constraints. ✓
- Docs (changelog, version, playbook) → Task 5. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" — all code is inline. ✓

**Type consistency:** `coalesceProgress<T>(sink)` returning `{ push, flush }` is used identically in
Tasks 2 and 4. `DETECT_CONCURRENCY` defined and used in Task 3. `detectGroups` signature unchanged
across Tasks 3-4. `setDetectProgress` shape `{ parsed, total }` consistent. ✓
