# Dev Profiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dev-only, detached-window ("DevTools-style") performance profiler that shows live render metrics plus an on-demand per-effect cost sweep and per-object GPU breakdown, so a developer can see which graphic-heavy features cause lag.

**Architecture:** A dev-only singleton **bridge** (`window.__profiler`) holds refs to the live `WebGLRenderer` + `Scene` + R3F `invalidate`, a metrics ring buffer, and a pub/sub. A tiny **probe** mounted inside the `<Canvas>` samples per-frame metrics into the bridge. A **detached window** (`window.open`) mounts a separate React root that reads the bridge via `window.opener` and renders a 3-tab UI (Live / Cost / Objects). The **cost sweep** and **object breakdown** are pure, unit-tested modules; the bridge supplies the live glue (driving its own rAF+`invalidate` loop because the Canvas is `frameloop="demand"`).

**Tech Stack:** React 18 + TypeScript, Three.js / @react-three/fiber, Zustand (sliced store), Vitest, Biome.

## Global Constraints

- **Dev-only. Only `npm run dev` may spin it up.** Enforced two ways: the `profiler` feature flag is `devOnly: true` (forced off in prod by `resolveFlags`), AND every wiring point is guarded by `import.meta.env.DEV` so the whole `src/dev/profiler/` subtree tree-shakes out of production builds (Rollup replaces `import.meta.env.DEV` with `false`, eliminates the dead branch, and drops the now-unreferenced imports).
- **Feature flag required + tiered.** `profiler` in `FEATURE_FLAGS`: `{ default: false, devOnly: true, tier: 'pro' }`. Gate React via `useFeature('profiler')`, the ⌘K command via `COMMAND_FLAGS`.
- **Test BOTH Simple and Pro modes** for anything mode-dependent (`resolveFlags(isDev, {}, isAdmin, 'simple')` vs `'pro'`).
- **No hardcoded colour.** The detached UI uses only existing CSS token classes (`.panel`/`.btn`/`.toolbar`/…) — no Tailwind colour utilities, no literals.
- **Biome style:** 2-space indent, 100 col, single quotes, no semicolons.
- **Before the final commit only:** run full `npm test` + `tsc` + `biome` once. While iterating, run targeted `npx vitest --run <path>`. Never pipe test output through `tail`/`head` — redirect to a log file and grep the file.
- **Versioning:** bump `build` in `src/version.ts` and mirror `package.json`.
- New code lives under `src/dev/profiler/` with its own path-scoped `CLAUDE.md`.

---

### Task 1: Feature flag `profiler`

**Files:**
- Modify: `src/features/flags/types.ts` (add `'profiler'` to the `FeatureFlag` union)
- Modify: `src/features/flags/registry.ts` (add the registry entry)
- Test: `src/dev/profiler/profilerFlag.test.ts` (create)

**Interfaces:**
- Consumes: `resolveFlags(isDev, overrides, isAdmin, uiMode)` from `src/features/flags/resolve.ts`, `FEATURE_FLAGS` from `src/features/flags/registry.ts`.
- Produces: the `'profiler'` `FeatureFlag`, gateable via `useFeature('profiler')` / `isFeatureEnabled('profiler')`.

- [ ] **Step 1: Write the failing test**

Create `src/dev/profiler/profilerFlag.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/flags/registry'
import { resolveFlags } from '../../features/flags/resolve'

describe('profiler feature flag', () => {
  it('is registered as a dev-only pro-tier flag, off by default', () => {
    const def = FEATURE_FLAGS.profiler
    expect(def).toBeDefined()
    expect(def.devOnly).toBe(true)
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(false)
  })

  it('is OFF in a production build regardless of mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').profiler).toBe(false)
    expect(resolveFlags(false, {}, false, 'simple').profiler).toBe(false)
  })

  it('is OFF in Simple mode even in dev (pro-tier)', () => {
    expect(resolveFlags(true, {}, false, 'simple').profiler).toBe(false)
  })

  it('is available in dev + Pro mode', () => {
    expect(resolveFlags(true, {}, false, 'pro').profiler).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/dev/profiler/profilerFlag.test.ts`
Expected: FAIL — `FEATURE_FLAGS.profiler` is undefined / type error on `resolveFlags(...).profiler`.

- [ ] **Step 3: Add the flag to the union**

In `src/features/flags/types.ts`, add `'profiler'` to the `FeatureFlag` union (append after the last entry `'catalogResize'`):

```ts
  | 'catalogResize'
  | 'profiler'
```

- [ ] **Step 4: Add the registry entry**

In `src/features/flags/registry.ts`, add an entry inside the `FEATURE_FLAGS` object (place it last, before the closing `}`):

```ts
  profiler: {
    label: 'Profiler',
    description: 'Dev-only detached-window performance profiler (live metrics + cost breakdown)',
    default: false,
    devOnly: true,
    tier: 'pro',
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest --run src/dev/profiler/profilerFlag.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/flags/types.ts src/features/flags/registry.ts src/dev/profiler/profilerFlag.test.ts
git commit -m "feat(profiler): add dev-only pro-tier profiler feature flag"
```

---

### Task 2: Metrics types + bridge (ring buffer + pub/sub + register)

**Files:**
- Create: `src/dev/profiler/profilerTypes.ts`
- Create: `src/dev/profiler/profilerBridge.ts`
- Test: `src/dev/profiler/profilerBridge.test.ts`

**Interfaces:**
- Consumes: `RenderTier` from `src/scene/quality.ts`; `WebGLRenderer`, `Scene` types from `three`.
- Produces:
  - Types: `MetricsSample`, `MetricsSnapshot`, `EffectCost`, `ObjectCost` (in `profilerTypes.ts`).
  - `profilerBridge` singleton with: `register(refs: BridgeRefs): void`, `getRefs(): BridgeRefs | null`, `pushSample(s: MetricsSample): void`, `subscribe(cb: (snap: MetricsSnapshot) => void): () => void`, `getSnapshot(): MetricsSnapshot`, `setTier(t: RenderTier): void`. (Cost/object methods are added in Task 5.)
  - `BridgeRefs = { gl: WebGLRenderer; scene: Scene; invalidate: () => void }`.
  - Constant `HISTORY_LIMIT = 120`.

- [ ] **Step 1: Write the types file**

Create `src/dev/profiler/profilerTypes.ts`:

```ts
import type { RenderTier } from '../../scene/quality'

/** One per-frame metrics reading pushed by the probe. */
export interface MetricsSample {
  /** performance.now() timestamp (ms). */
  t: number
  /** Instantaneous frames/sec (1000 / frameMs). */
  fps: number
  /** Wall-clock frame time (ms) = rAF delta. */
  frameMs: number
  /** Draw calls last frame (gl.info.render.calls). */
  calls: number
  triangles: number
  lines: number
  points: number
  /** Geometries resident on the GPU (gl.info.memory.geometries). */
  geometries: number
  textures: number
  /** JS heap in MB (Chromium `performance.memory` only; null elsewhere). */
  heapMB: number | null
  /** Point/spot lights currently in the scene graph. */
  lights: number
  /** Was the render pump driving continuous frames (vs a one-off demand frame). */
  continuous: boolean
}

/** What a UI subscriber receives on each throttled emit. */
export interface MetricsSnapshot {
  latest: MetricsSample | null
  /** Oldest → newest ring buffer for the sparkline. */
  history: MetricsSample[]
  tier: RenderTier
}

/** One effect's measured per-frame cost from the sweep. */
export interface EffectCost {
  /** QualitySettings key that was toggled. */
  key: string
  label: string
  /** Avg frame time with the effect at its baseline (ms). */
  baselineMs: number
  /** Avg frame time with the effect disabled (ms). */
  disabledMs: number
  /** baselineMs - disabledMs — how much the effect costs per frame (ms). */
  deltaMs: number
  /** FPS you'd gain by disabling it (1000/disabledMs - 1000/baselineMs). */
  fpsGain: number
}

/** Per-furniture-item GPU cost from the object breakdown. */
export interface ObjectCost {
  itemId: string
  name: string
  triangles: number
  /** Mesh count (≈ draw calls contributed by this item). */
  meshes: number
  /** Distinct materials used by this item. */
  materials: number
}
```

- [ ] **Step 2: Write the failing bridge test**

Create `src/dev/profiler/profilerBridge.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_LIMIT, profilerBridge } from './profilerBridge'
import type { MetricsSample } from './profilerTypes'

function sample(t: number): MetricsSample {
  return {
    t,
    fps: 60,
    frameMs: 16.7,
    calls: 100,
    triangles: 5000,
    lines: 0,
    points: 0,
    geometries: 40,
    textures: 20,
    heapMB: 128,
    lights: 3,
    continuous: true,
  }
}

describe('profilerBridge', () => {
  beforeEach(() => profilerBridge.__resetForTest())

  it('stores the latest sample and exposes it via getSnapshot', () => {
    profilerBridge.pushSample(sample(1))
    profilerBridge.pushSample(sample(2))
    const snap = profilerBridge.getSnapshot()
    expect(snap.latest?.t).toBe(2)
    expect(snap.history.length).toBe(2)
    expect(snap.history[0].t).toBe(1)
  })

  it('caps history at HISTORY_LIMIT, keeping the newest', () => {
    for (let i = 0; i < HISTORY_LIMIT + 25; i++) profilerBridge.pushSample(sample(i))
    const snap = profilerBridge.getSnapshot()
    expect(snap.history.length).toBe(HISTORY_LIMIT)
    expect(snap.history[snap.history.length - 1].t).toBe(HISTORY_LIMIT + 24)
    expect(snap.history[0].t).toBe(25)
  })

  it('notifies subscribers on push and stops after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = profilerBridge.subscribe(cb)
    profilerBridge.pushSample(sample(1))
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
    profilerBridge.pushSample(sample(2))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('reflects the tier set via setTier', () => {
    profilerBridge.setTier('high')
    expect(profilerBridge.getSnapshot().tier).toBe('high')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest --run src/dev/profiler/profilerBridge.test.ts`
Expected: FAIL — cannot import `profilerBridge` (module missing).

- [ ] **Step 4: Implement the bridge**

Create `src/dev/profiler/profilerBridge.ts`:

```ts
import type { Scene, WebGLRenderer } from 'three'
import type { RenderTier } from '../../scene/quality'
import type { MetricsSample, MetricsSnapshot } from './profilerTypes'

/** Live references registered by the in-Canvas probe. */
export interface BridgeRefs {
  gl: WebGLRenderer
  scene: Scene
  invalidate: () => void
}

/** Max samples retained for the sparkline (~2s at 60fps of throttled emits). */
export const HISTORY_LIMIT = 120

/**
 * Dev-only singleton connecting the in-Canvas probe (main window) to the
 * detached profiler window (which reads it via `window.opener.__profiler`).
 * Holds live renderer/scene refs, a bounded metrics history, and a pub/sub.
 * Cost-sweep / object-breakdown methods are attached in `profilerEngine.ts`.
 */
class ProfilerBridge {
  private refs: BridgeRefs | null = null
  private history: MetricsSample[] = []
  private subscribers = new Set<(snap: MetricsSnapshot) => void>()
  private tier: RenderTier = 'performance'

  register(refs: BridgeRefs): void {
    this.refs = refs
  }

  getRefs(): BridgeRefs | null {
    return this.refs
  }

  setTier(t: RenderTier): void {
    this.tier = t
  }

  pushSample(s: MetricsSample): void {
    this.history.push(s)
    if (this.history.length > HISTORY_LIMIT) {
      this.history.splice(0, this.history.length - HISTORY_LIMIT)
    }
    const snap = this.getSnapshot()
    for (const cb of this.subscribers) cb(snap)
  }

  subscribe(cb: (snap: MetricsSnapshot) => void): () => void {
    this.subscribers.add(cb)
    return () => {
      this.subscribers.delete(cb)
    }
  }

  getSnapshot(): MetricsSnapshot {
    return {
      latest: this.history.length ? this.history[this.history.length - 1] : null,
      history: this.history.slice(),
      tier: this.tier,
    }
  }

  /** Test-only: clear all state between cases. */
  __resetForTest(): void {
    this.refs = null
    this.history = []
    this.subscribers.clear()
    this.tier = 'performance'
  }
}

export const profilerBridge = new ProfilerBridge()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest --run src/dev/profiler/profilerBridge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/dev/profiler/profilerTypes.ts src/dev/profiler/profilerBridge.ts src/dev/profiler/profilerBridge.test.ts
git commit -m "feat(profiler): metrics types + cross-window bridge (ring buffer + pub/sub)"
```

---

### Task 3: Cost-sweep orchestration (pure, injectable measurement)

**Files:**
- Create: `src/dev/profiler/costBreakdown.ts`
- Test: `src/dev/profiler/costBreakdown.test.ts`

**Interfaces:**
- Consumes: `QualitySettings` from `src/scene/quality.ts`; `EffectCost` from `./profilerTypes`.
- Produces:
  - `COST_SWEEP: SweepStep[]` — the ordered effects to toggle.
  - `SweepStep = { key: keyof QualitySettings; label: string; disabledValue: QualitySettings[keyof QualitySettings] }`.
  - `runSweep(steps: SweepStep[], measure: MeasureFn, onProgress?: (done: number, total: number, label: string) => void): Promise<EffectCost[]>` where `MeasureFn = (override?: { key: keyof QualitySettings; value: QualitySettings[keyof QualitySettings] }) => Promise<number>` returns average frame ms. Baseline is `measure()` with no override; each step is `measure({key, value})`. Results are sorted by `deltaMs` descending.

- [ ] **Step 1: Write the failing test**

Create `src/dev/profiler/costBreakdown.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { COST_SWEEP, runSweep, type SweepStep } from './costBreakdown'

describe('COST_SWEEP', () => {
  it('covers the heavy render effects', () => {
    const keys = COST_SWEEP.map((s) => s.key)
    expect(keys).toContain('shadowMapSize')
    expect(keys).toContain('postprocessing')
    expect(keys).toContain('ibl')
    expect(keys).toContain('maxFixtureLights')
    expect(keys).toContain('dprMax')
  })
  it('disables shadows/lights by dropping them to 0', () => {
    expect(COST_SWEEP.find((s) => s.key === 'shadowMapSize')?.disabledValue).toBe(0)
    expect(COST_SWEEP.find((s) => s.key === 'maxFixtureLights')?.disabledValue).toBe(0)
    expect(COST_SWEEP.find((s) => s.key === 'postprocessing')?.disabledValue).toBe(false)
  })
})

describe('runSweep', () => {
  const steps: SweepStep[] = [
    { key: 'postprocessing', label: 'Post', disabledValue: false },
    { key: 'ibl', label: 'IBL', disabledValue: false },
  ]

  it('ranks effects by frame-time saved, computes deltas + fps gain', async () => {
    // Baseline 20ms/frame (50fps). Disabling Post → 10ms (100fps); IBL → 18ms.
    const measure = vi.fn(async (override?: { key: string }) => {
      if (!override) return 20
      if (override.key === 'postprocessing') return 10
      if (override.key === 'ibl') return 18
      return 20
    })
    const out = await runSweep(steps, measure)
    expect(out.map((e) => e.key)).toEqual(['postprocessing', 'ibl']) // sorted desc by cost
    expect(out[0]).toMatchObject({ label: 'Post', baselineMs: 20, disabledMs: 10, deltaMs: 10 })
    // fpsGain = 1000/10 - 1000/20 = 100 - 50 = 50
    expect(out[0].fpsGain).toBeCloseTo(50, 5)
    expect(out[1]).toMatchObject({ key: 'ibl', deltaMs: 2 })
  })

  it('measures baseline once and each step once', async () => {
    const measure = vi.fn(async () => 16)
    await runSweep(steps, measure)
    expect(measure).toHaveBeenCalledTimes(3) // baseline + 2 steps
  })

  it('reports progress per step', async () => {
    const measure = async () => 16
    const onProgress = vi.fn()
    await runSweep(steps, measure, onProgress)
    expect(onProgress).toHaveBeenCalledWith(1, 2, 'Post')
    expect(onProgress).toHaveBeenCalledWith(2, 2, 'IBL')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/dev/profiler/costBreakdown.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the sweep**

Create `src/dev/profiler/costBreakdown.ts`:

```ts
import type { QualitySettings } from '../../scene/quality'
import type { EffectCost } from './profilerTypes'

export interface SweepStep {
  key: keyof QualitySettings
  label: string
  /** The value to force the setting to in order to DISABLE the effect. */
  disabledValue: QualitySettings[keyof QualitySettings]
}

/** Heavy render effects, toggled one at a time and ranked by measured cost. */
export const COST_SWEEP: SweepStep[] = [
  { key: 'postprocessing', label: 'Post-processing (bloom/AO/SMAA)', disabledValue: false },
  { key: 'shadowMapSize', label: 'Sun shadows', disabledValue: 0 },
  { key: 'ibl', label: 'IBL reflections', disabledValue: false },
  { key: 'dof', label: 'Depth of field', disabledValue: false },
  { key: 'contactShadows', label: 'Contact shadows', disabledValue: false },
  { key: 'cornerAo', label: 'Corner AO', disabledValue: false },
  { key: 'maxFixtureLights', label: 'Fixture lights', disabledValue: 0 },
  { key: 'geometryDetail', label: 'Geometry detail', disabledValue: 0.5 },
  { key: 'dprMax', label: 'Pixel ratio (DPR)', disabledValue: 1 },
]

export type MeasureFn = (override?: {
  key: keyof QualitySettings
  value: QualitySettings[keyof QualitySettings]
}) => Promise<number>

/**
 * Measure a baseline average frame time, then for each step measure with just
 * that effect disabled, and rank the effects by how much frame time they cost
 * (largest saving first). All live state handling (applying/restoring the
 * override, driving frames) lives in `measure`; this function is pure
 * orchestration + arithmetic so it is deterministically testable.
 */
export async function runSweep(
  steps: SweepStep[],
  measure: MeasureFn,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<EffectCost[]> {
  const baselineMs = await measure()
  const out: EffectCost[] = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const disabledMs = await measure({ key: step.key, value: step.disabledValue })
    const deltaMs = baselineMs - disabledMs
    const fpsGain = 1000 / disabledMs - 1000 / baselineMs
    out.push({ key: String(step.key), label: step.label, baselineMs, disabledMs, deltaMs, fpsGain })
    onProgress?.(i + 1, steps.length, step.label)
  }
  return out.sort((a, b) => b.deltaMs - a.deltaMs)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/dev/profiler/costBreakdown.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/dev/profiler/costBreakdown.ts src/dev/profiler/costBreakdown.test.ts
git commit -m "feat(profiler): pure cost-sweep orchestration (rank effects by frame-time cost)"
```

---

### Task 4: Per-object GPU breakdown (pure scene traversal)

**Files:**
- Create: `src/dev/profiler/objectBreakdown.ts`
- Test: `src/dev/profiler/objectBreakdown.test.ts`

**Interfaces:**
- Consumes: `Object3D` from `three`; `ObjectCost` from `./profilerTypes`.
- Produces: `buildObjectBreakdown(root: Object3D, nameFor: (itemId: string) => string): ObjectCost[]` — traverses `root`, groups meshes by the nearest ancestor carrying `userData.itemId`, sums triangles / mesh count / distinct materials, and returns them sorted by triangles descending.

- [ ] **Step 1: Write the failing test**

Create `src/dev/profiler/objectBreakdown.test.ts`:

```ts
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { buildObjectBreakdown } from './objectBreakdown'

/** A furniture item root (userData.itemId) with `meshCount` boxes under it. */
function itemGroup(id: string, meshCount: number, sharedMat = true): Group {
  const g = new Group()
  g.userData.itemId = id
  const mat = new MeshBasicMaterial()
  for (let i = 0; i < meshCount; i++) {
    // Box = 12 triangles (index-less BoxGeometry has 36 position verts → 12 tris).
    g.add(new Mesh(new BoxGeometry(1, 1, 1), sharedMat ? mat : new MeshBasicMaterial()))
  }
  return g
}

describe('buildObjectBreakdown', () => {
  it('groups meshes by ancestor itemId and sums triangles + mesh count', () => {
    const root = new Object3D()
    root.add(itemGroup('a', 2)) // 24 tris, 2 meshes
    root.add(itemGroup('b', 1)) // 12 tris, 1 mesh
    const out = buildObjectBreakdown(root, (id) => `name-${id}`)
    expect(out.map((o) => o.itemId)).toEqual(['a', 'b']) // sorted desc by triangles
    expect(out[0]).toMatchObject({ itemId: 'a', name: 'name-a', triangles: 24, meshes: 2 })
    expect(out[1]).toMatchObject({ itemId: 'b', triangles: 12, meshes: 1 })
  })

  it('counts distinct materials per item (shared material counts once)', () => {
    const root = new Object3D()
    root.add(itemGroup('shared', 3, true))
    root.add(itemGroup('distinct', 3, false))
    const byId = Object.fromEntries(buildObjectBreakdown(root, (id) => id).map((o) => [o.itemId, o]))
    expect(byId.shared.materials).toBe(1)
    expect(byId.distinct.materials).toBe(3)
  })

  it('ignores meshes with no itemId ancestor', () => {
    const root = new Object3D()
    root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial())) // orphan, no itemId
    root.add(itemGroup('a', 1))
    const out = buildObjectBreakdown(root, (id) => id)
    expect(out).toHaveLength(1)
    expect(out[0].itemId).toBe('a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/dev/profiler/objectBreakdown.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the traversal**

Create `src/dev/profiler/objectBreakdown.ts`:

```ts
import type { BufferGeometry, Material, Mesh, Object3D } from 'three'
import type { ObjectCost } from './profilerTypes'

/** Triangle count of a geometry (indexed or not). 0 if unknown. */
function triCount(geom: BufferGeometry | undefined): number {
  if (!geom) return 0
  const index = geom.index
  if (index) return Math.floor(index.count / 3)
  const pos = geom.attributes.position
  return pos ? Math.floor(pos.count / 3) : 0
}

/** Walk up from `obj` to the nearest ancestor carrying `userData.itemId`. */
function itemIdOf(obj: Object3D): string | null {
  let cur: Object3D | null = obj
  while (cur) {
    const id = cur.userData?.itemId
    if (typeof id === 'string') return id
    cur = cur.parent
  }
  return null
}

interface Acc {
  triangles: number
  meshes: number
  materials: Set<Material>
}

/**
 * Rank placed furniture items by GPU cost. Traverses `root`, attributes each
 * mesh to the nearest ancestor with `userData.itemId` (set on furniture roots
 * in `furniture/Furniture.tsx`), and sums triangles, mesh count (≈ draw calls),
 * and distinct materials. Pure — no side effects, deterministic ordering.
 */
export function buildObjectBreakdown(
  root: Object3D,
  nameFor: (itemId: string) => string,
): ObjectCost[] {
  const byItem = new Map<string, Acc>()
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return
    const itemId = itemIdOf(obj)
    if (!itemId) return
    let acc = byItem.get(itemId)
    if (!acc) {
      acc = { triangles: 0, meshes: 0, materials: new Set() }
      byItem.set(itemId, acc)
    }
    acc.triangles += triCount(mesh.geometry as BufferGeometry)
    acc.meshes += 1
    const mat = mesh.material
    if (Array.isArray(mat)) for (const m of mat) acc.materials.add(m)
    else if (mat) acc.materials.add(mat)
  })
  const out: ObjectCost[] = []
  for (const [itemId, acc] of byItem) {
    out.push({
      itemId,
      name: nameFor(itemId),
      triangles: acc.triangles,
      meshes: acc.meshes,
      materials: acc.materials.size,
    })
  }
  return out.sort((a, b) => b.triangles - a.triangles)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/dev/profiler/objectBreakdown.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/dev/profiler/objectBreakdown.ts src/dev/profiler/objectBreakdown.test.ts
git commit -m "feat(profiler): pure per-object GPU breakdown (group scene meshes by item)"
```

---

### Task 5: Benchmark signal + live glue engine (attach cost/object methods to bridge)

**Files:**
- Create: `src/dev/profiler/benchmarkSignal.ts`
- Create: `src/dev/profiler/profilerEngine.ts`
- Modify: `src/scene/QualityController.tsx` (skip auto-downgrade during a benchmark)
- Test: `src/dev/profiler/benchmarkSignal.test.ts`

**Interfaces:**
- Consumes: `profilerBridge`, `BridgeRefs` (Task 2); `runSweep`, `COST_SWEEP` (Task 3); `buildObjectBreakdown` (Task 4); `useStore` from `src/state/store`; `resolveQuality`, `QualitySettings` from `src/scene/quality`; `FURNITURE`/catalog name lookup via the store.
- Produces:
  - `benchmarkSignal.ts`: `setProfilerBenchmarkActive(v: boolean): void`, `isProfilerBenchmarkActive(): boolean`.
  - `profilerEngine.ts`: `runCostBreakdown(onProgress?): Promise<EffectCost[]>` and `getObjectBreakdown(): ObjectCost[]` — free functions the bridge/UI call. Constants `SETTLE_FRAMES = 20`, `SAMPLE_FRAMES = 60`.

- [ ] **Step 1: Write the failing benchmark-signal test**

Create `src/dev/profiler/benchmarkSignal.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  isProfilerBenchmarkActive,
  setProfilerBenchmarkActive,
} from './benchmarkSignal'

describe('benchmarkSignal', () => {
  it('defaults to inactive and toggles', () => {
    expect(isProfilerBenchmarkActive()).toBe(false)
    setProfilerBenchmarkActive(true)
    expect(isProfilerBenchmarkActive()).toBe(true)
    setProfilerBenchmarkActive(false)
    expect(isProfilerBenchmarkActive()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/dev/profiler/benchmarkSignal.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the signal**

Create `src/dev/profiler/benchmarkSignal.ts`:

```ts
/**
 * Module singleton: is the profiler running a cost sweep right now? The sweep
 * mutates quality overrides frame-by-frame; the adaptive FPS guard in
 * `QualityController` reads this and skips its auto-downgrade so it doesn't
 * fight the sweep. Same plain-signal pattern as `renderPumpSignal`.
 */
let active = false

export function setProfilerBenchmarkActive(v: boolean): void {
  active = v
}

export function isProfilerBenchmarkActive(): boolean {
  return active
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/dev/profiler/benchmarkSignal.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Guard the QualityController auto-downgrade**

In `src/scene/QualityController.tsx`, import the signal and bail the FPS guard while a benchmark runs. Add the import near the other `./` imports:

```ts
import { isProfilerBenchmarkActive } from '../dev/profiler/benchmarkSignal'
```

Then in the `useFrame` guard, extend the early-return condition (currently `if (!isRenderingContinuously())`):

```ts
    // Skip while idle (demand mode) OR while the profiler sweep is toggling
    // quality overrides — the sweep must not trigger a spurious tier downgrade.
    if (!isRenderingContinuously() || isProfilerBenchmarkActive()) {
      a.t = 0
      a.frames = 0
      return
    }
```

> Note: `src/dev/profiler/benchmarkSignal.ts` is dependency-free and dev-only in intent, but this import is unconditional. That is fine — the module is a couple of lines with no heavy deps; it does not pull the rest of `src/dev/profiler/` into the prod bundle (Rollup only bundles what's reachable, and nothing prod-reachable imports the bridge/UI).

- [ ] **Step 6: Implement the engine**

Create `src/dev/profiler/profilerEngine.ts`:

```ts
import type { QualitySettings } from '../../scene/quality'
import { resolveQuality } from '../../scene/quality'
import { useStore } from '../../state/store'
import { setProfilerBenchmarkActive } from './benchmarkSignal'
import { profilerBridge } from './profilerBridge'
import { COST_SWEEP, runSweep } from './costBreakdown'
import { buildObjectBreakdown } from './objectBreakdown'
import type { EffectCost, ObjectCost } from './profilerTypes'

/** Frames to let the pipeline settle after changing an override. */
export const SETTLE_FRAMES = 20
/** Frames averaged per measurement. */
export const SAMPLE_FRAMES = 60

/** Await `n` rendered frames, driving the demand-mode canvas via invalidate. */
function driveFrames(invalidate: () => void, n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0
    const tick = () => {
      invalidate()
      if (++count >= n) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** Average frame time (ms) over `n` frames, driving the canvas each frame. */
function measureAvgFrameMs(invalidate: () => void, n: number): Promise<number> {
  return new Promise((resolve) => {
    let count = 0
    let total = 0
    let last = performance.now()
    const tick = (now: number) => {
      total += now - last
      last = now
      invalidate()
      if (++count >= n) resolve(total / count)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame((now) => {
      last = now
      requestAnimationFrame(tick)
    })
  })
}

/**
 * Run the effect-cost sweep against the live pipeline. Snapshots quality
 * overrides, and for each effect: applies a disabling override, settles,
 * measures, and restores the exact prior overrides. The adaptive FPS guard is
 * suspended for the whole run via the benchmark signal.
 */
export async function runCostBreakdown(
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<EffectCost[]> {
  const refs = profilerBridge.getRefs()
  if (!refs) return []
  const { invalidate } = refs
  const snapshot: Partial<QualitySettings> = { ...useStore.getState().qualityOverrides }
  setProfilerBenchmarkActive(true)
  try {
    return await runSweep(
      COST_SWEEP,
      async (override) => {
        if (override) {
          useStore.setState({ qualityOverrides: { ...snapshot, [override.key]: override.value } })
        } else {
          useStore.setState({ qualityOverrides: { ...snapshot } })
        }
        await driveFrames(invalidate, SETTLE_FRAMES)
        return measureAvgFrameMs(invalidate, SAMPLE_FRAMES)
      },
      onProgress,
    )
  } finally {
    // Restore the exact pre-sweep overrides and re-enable the guard.
    useStore.setState({ qualityOverrides: { ...snapshot } })
    setProfilerBenchmarkActive(false)
    invalidate()
  }
}

/** Snapshot per-item GPU cost from the live scene. */
export function getObjectBreakdown(): ObjectCost[] {
  const refs = profilerBridge.getRefs()
  if (!refs) return []
  const items = useStore.getState().items
  const labelFor = (id: string) => {
    const it = items.find((i) => i.id === id)
    return it?.label ?? it?.defId ?? id
  }
  return buildObjectBreakdown(refs.scene, labelFor)
}

/** Current effective quality settings (for the Live tab's tier readout). */
export function currentEffectiveQuality(): QualitySettings {
  const s = useStore.getState()
  return resolveQuality(s.qualityTier, s.qualityOverrides)
}
```

- [ ] **Step 7: Run targeted tests + typecheck the new subtree**

Run: `npx vitest --run src/dev/profiler/ && npx tsc --noEmit`
Expected: PASS for all `src/dev/profiler/` tests; no type errors. (The engine has no unit test — it is thin glue over the already-tested pure modules and the live pipeline; it is exercised in the visual verification in Task 10.)

- [ ] **Step 8: Commit**

```bash
git add src/dev/profiler/benchmarkSignal.ts src/dev/profiler/benchmarkSignal.test.ts src/dev/profiler/profilerEngine.ts src/scene/QualityController.tsx
git commit -m "feat(profiler): benchmark signal + live cost-sweep/object-breakdown engine"
```

---

### Task 6: In-Canvas metrics probe

**Files:**
- Create: `src/dev/profiler/ProfilerProbe.tsx`
- Modify: `src/scene/Scene.tsx` (mount the probe, dev+flag gated)

**Interfaces:**
- Consumes: `useThree`, `useFrame` from `@react-three/fiber`; `profilerBridge` + `MetricsSample` (Task 2); `isRenderingContinuously` from `src/scene/renderPumpSignal`; `useFeature` from `src/features/useFeature`; `currentEffectiveQuality` is NOT used here (tier comes from the store slice via the bridge `setTier`).
- Produces: `<ProfilerProbe />` — renders nothing; registers refs + pushes `MetricsSample`s.

- [ ] **Step 1: Implement the probe**

Create `src/dev/profiler/ProfilerProbe.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useStore } from '../../state/store'
import { isRenderingContinuously } from '../../scene/renderPumpSignal'
import { profilerBridge } from './profilerBridge'
import type { MetricsSample } from './profilerTypes'

/** How often to push a sample to the bridge (ms) — ~10 Hz keeps the UI cheap. */
const EMIT_INTERVAL = 100

/**
 * Dev-only. Mounted inside the main `<Canvas>`; registers the renderer/scene/
 * invalidate with the bridge and, throttled to ~10 Hz, pushes a metrics sample
 * read from `gl.info`. Renders nothing.
 *
 * `gl.info.autoReset` is turned OFF so counts are read-then-reset here: reading
 * in `useFrame` (which runs before R3F's `gl.render`) yields the previous
 * frame's fully-accumulated counts, then we reset for the next. Restored on
 * unmount.
 */
export function ProfilerProbe() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const tier = useStore((s) => s.qualityTier)

  useEffect(() => {
    profilerBridge.register({ gl, scene, invalidate })
    const prevAuto = gl.info.autoReset
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = prevAuto
    }
  }, [gl, scene, invalidate])

  useEffect(() => {
    profilerBridge.setTier(tier)
  }, [tier])

  const last = useRef(0)
  useFrame((_, dt) => {
    const now = performance.now()
    const render = gl.info.render
    const memory = gl.info.memory
    if (now - last.current >= EMIT_INTERVAL) {
      last.current = now
      let lights = 0
      scene.traverse((o) => {
        const l = o as unknown as { isPointLight?: boolean; isSpotLight?: boolean; visible: boolean }
        if ((l.isPointLight || l.isSpotLight) && l.visible) lights++
      })
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      const sample: MetricsSample = {
        t: now,
        fps: dt > 0 ? 1 / dt : 0,
        frameMs: dt * 1000,
        calls: render.calls,
        triangles: render.triangles,
        lines: render.lines,
        points: render.points,
        geometries: memory.geometries,
        textures: memory.textures,
        heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        lights,
        continuous: isRenderingContinuously(),
      }
      profilerBridge.pushSample(sample)
    }
    // Read-then-reset so each frame's gl.info counts are isolated.
    gl.info.reset()
  })

  return null
}
```

- [ ] **Step 2: Mount the probe in the main Canvas (dev+flag gated)**

In `src/scene/Scene.tsx`, add the import (top, with the other scene imports):

```tsx
import { ProfilerProbe } from '../dev/profiler/ProfilerProbe'
```

Then inside the `<Canvas>` children, next to `<QualityController />` (around line 143), add a dev+flag-gated mount. Because the whole `<Canvas>` is a component, read the flag with `useFeature` at the top of the component and render conditionally. Add near the other `useFeature` reads in the component, then in JSX:

```tsx
        {import.meta.env.DEV && profilerEnabled ? <ProfilerProbe /> : null}
```

where `profilerEnabled` is declared at the top of the `Scene` component body:

```tsx
  const profilerEnabled = useFeature('profiler')
```

(If `useFeature` is not already imported in `Scene.tsx`, add `import { useFeature } from '../features/useFeature'`.)

> Prod tree-shaking: `import.meta.env.DEV` → `false` in prod, so Rollup eliminates the JSX branch; `ProfilerProbe` becomes unreferenced and is dropped, taking `profilerBridge`/`profilerTypes` with it (nothing else prod-reachable imports them). `profilerEnabled` is also always `false` in prod (devOnly flag) as a second guard.

- [ ] **Step 3: Typecheck + run scene tests**

Run: `npx tsc --noEmit && npx vitest --run src/scene/`
Expected: no type errors; scene tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/dev/profiler/ProfilerProbe.tsx src/scene/Scene.tsx
git commit -m "feat(profiler): in-Canvas metrics probe wired into the main scene (dev-gated)"
```

---

### Task 7: Detached-window host

**Files:**
- Create: `src/dev/profiler/openProfilerWindow.ts`

**Interfaces:**
- Consumes: `createRoot` from `react-dom/client`; `ProfilerApp` (Task 8 — forward reference; this task creates the opener, Task 8 the component. Implement the opener importing `./ProfilerApp`, and stub `ProfilerApp` minimally in this task so it compiles, then flesh it out in Task 8).
- Produces: `openProfilerWindow(): void` — opens/focuses the detached window and mounts the React root.

- [ ] **Step 1: Create a minimal ProfilerApp stub (fleshed out in Task 8)**

Create `src/dev/profiler/ProfilerApp.tsx`:

```tsx
/** Placeholder — implemented in Task 8. */
export function ProfilerApp() {
  return <div className="panel">Profiler loading…</div>
}
```

- [ ] **Step 2: Implement the opener**

Create `src/dev/profiler/openProfilerWindow.ts`:

```ts
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { ProfilerApp } from './ProfilerApp'

let win: Window | null = null
let root: Root | null = null

/** Copy the parent's stylesheets + theme attributes into the child document so
 *  token classes resolve. Cloned styles do NOT hot-reload (dev-tool limitation). */
function cloneStyles(doc: Document): void {
  for (const node of Array.from(
    document.head.querySelectorAll('style, link[rel="stylesheet"]'),
  )) {
    doc.head.appendChild(node.cloneNode(true))
  }
  // Mirror theme + light/dark class/attributes from the parent <html>.
  const src = document.documentElement
  doc.documentElement.className = src.className
  for (const attr of Array.from(src.attributes)) {
    if (attr.name.startsWith('data-')) doc.documentElement.setAttribute(attr.name, attr.value)
  }
  doc.body.className = document.body.className
}

/**
 * Open (or focus) the detached profiler window and mount a separate React root
 * into it. Dev-only — callers guard with `import.meta.env.DEV`.
 */
export function openProfilerWindow(): void {
  if (win && !win.closed) {
    win.focus()
    return
  }
  const w = window.open('', 'sofa-profiler', 'width=460,height=760')
  if (!w) {
    // eslint-disable-next-line no-console
    console.warn('[profiler] popup blocked — allow popups for this origin')
    return
  }
  win = w
  w.document.title = 'Sofa Profiler'
  cloneStyles(w.document)
  const mount = w.document.createElement('div')
  mount.className = 'profiler-root'
  w.document.body.appendChild(mount)
  root = createRoot(mount)
  root.render(createElement(ProfilerApp))

  const cleanup = () => {
    root?.unmount()
    root = null
    win = null
  }
  w.addEventListener('beforeunload', cleanup)
  // Close the child if the parent unloads so it never orphans.
  window.addEventListener('beforeunload', () => {
    if (win && !win.closed) win.close()
  })
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/dev/profiler/openProfilerWindow.ts src/dev/profiler/ProfilerApp.tsx
git commit -m "feat(profiler): detached-window host (popup + style clone + React root)"
```

---

### Task 8: Profiler UI (Live / Cost / Objects tabs)

**Files:**
- Modify: `src/dev/profiler/ProfilerApp.tsx` (replace the stub)
- Create: `src/dev/profiler/profiler.css`
- Modify: `src/dev/profiler/openProfilerWindow.ts` (inject the profiler stylesheet into the child)

**Interfaces:**
- Consumes: `profilerBridge` (via `window.opener` bridge is the parent's module singleton — since the child window shares the same JS origin/bundle, import `profilerBridge`, `runCostBreakdown`, `getObjectBreakdown`, `currentEffectiveQuality` directly; the modules are singletons in the parent's realm, but the child gets its own module instance. **Therefore the child must reach the parent's singleton via `window.opener`.** Expose the API on `window.__profiler` in Task 9 and read `(window.opener as any).__profiler` here.)
- Produces: the full `ProfilerApp` UI.

> **Cross-realm note:** a `window.open('')` child runs the same origin but a **separate module realm**, so importing `profilerBridge` in the child would give a *different* instance than the parent's probe writes to. The child MUST read the parent's singleton through `window.opener.__profiler` (registered in Task 9). This task codes against a small `ProfilerApi` interface read from `window.opener`.

- [ ] **Step 1: Define the API shape the child consumes**

Append this interface to `src/dev/profiler/profilerTypes.ts` (it references `MetricsSnapshot`, `EffectCost`, `ObjectCost`, all already declared in that file — no import needed):

```ts
/** The surface the parent exposes on `window.__profiler` for the detached UI. */
export interface ProfilerApi {
  subscribe: (cb: (snap: MetricsSnapshot) => void) => () => void
  getSnapshot: () => MetricsSnapshot
  runCostBreakdown: (
    onProgress?: (done: number, total: number, label: string) => void,
  ) => Promise<EffectCost[]>
  getObjectBreakdown: () => ObjectCost[]
  /** Select an item in the main window (for the Objects tab click-through). */
  selectItem: (id: string) => void
}
```

- [ ] **Step 2: Write the profiler stylesheet**

Create `src/dev/profiler/profiler.css` (token-class-friendly; no colour literals — inherit from the cloned app tokens, only layout here):

```css
.profiler-root {
  font: 12px/1.4 system-ui, sans-serif;
  padding: 8px;
}
.profiler-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}
.profiler-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
}
.profiler-grid dt {
  opacity: 0.7;
}
.profiler-grid dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.profiler-bar {
  height: 10px;
  border-radius: 3px;
  background: currentColor;
  opacity: 0.35;
}
.profiler-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 3px 0;
}
.profiler-spark {
  width: 100%;
  height: 40px;
}
```

- [ ] **Step 3: Inject the profiler stylesheet into the child**

In `src/dev/profiler/openProfilerWindow.ts`, import the CSS as a raw string and add a `<style>` to the child after `cloneStyles`. At the top:

```ts
import profilerCss from './profiler.css?inline'
```

After `cloneStyles(w.document)`:

```ts
  const styleEl = w.document.createElement('style')
  styleEl.textContent = profilerCss
  w.document.head.appendChild(styleEl)
```

- [ ] **Step 4: Implement the full ProfilerApp**

Replace `src/dev/profiler/ProfilerApp.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { EffectCost, MetricsSnapshot, ObjectCost, ProfilerApi } from './profilerTypes'

function api(): ProfilerApi | null {
  return ((window.opener as unknown as { __profiler?: ProfilerApi })?.__profiler) ?? null
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

/** Tiny inline SVG sparkline of recent frame times. */
function Sparkline({ history }: { history: MetricsSnapshot['history'] }) {
  const pts = useMemo(() => {
    if (history.length < 2) return ''
    const vals = history.map((h) => h.frameMs)
    const max = Math.max(33, ...vals)
    return history
      .map((h, i) => {
        const x = (i / (history.length - 1)) * 100
        const y = 40 - (h.frameMs / max) * 40
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [history])
  return (
    <svg className="profiler-spark" viewBox="0 0 100 40" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function LiveTab({ snap }: { snap: MetricsSnapshot | null }) {
  const s = snap?.latest
  if (!s) return <p>Waiting for frames… interact with the scene to sample.</p>
  return (
    <div>
      <Sparkline history={snap!.history} />
      <dl className="profiler-grid">
        <Metric label="Tier" value={snap!.tier} />
        <Metric label="FPS" value={s.continuous ? Math.round(s.fps) : 'idle'} />
        <Metric label="Frame" value={`${s.frameMs.toFixed(1)} ms`} />
        <Metric label="Draw calls" value={s.calls} />
        <Metric label="Triangles" value={s.triangles.toLocaleString()} />
        <Metric label="Geometries" value={s.geometries} />
        <Metric label="Textures" value={s.textures} />
        <Metric label="Lights" value={s.lights} />
        <Metric label="JS heap" value={s.heapMB == null ? 'n/a' : `${s.heapMB} MB`} />
      </dl>
    </div>
  )
}

function CostTab() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [rows, setRows] = useState<EffectCost[]>([])
  const run = async () => {
    const a = api()
    if (!a) return
    setRunning(true)
    setRows([])
    try {
      const out = await a.runCostBreakdown((done, total, label) =>
        setProgress(`${done}/${total} — ${label}`),
      )
      setRows(out)
    } finally {
      setRunning(false)
      setProgress('')
    }
  }
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.deltaMs)))
  return (
    <div>
      <button type="button" className="btn" disabled={running} onClick={run}>
        {running ? `Running… ${progress}` : 'Run cost breakdown'}
      </button>
      <p style={{ opacity: 0.7 }}>The viewport will flicker while each effect is toggled.</p>
      {rows.map((r) => (
        <div key={r.key} className="profiler-row">
          <span>{r.label}</span>
          <span>
            {r.deltaMs >= 0 ? '−' : '+'}
            {Math.abs(r.deltaMs).toFixed(1)} ms/frame ({r.fpsGain >= 0 ? '+' : ''}
            {Math.round(r.fpsGain)} fps)
          </span>
          <div className="profiler-bar" style={{ width: `${(Math.abs(r.deltaMs) / max) * 100}%` }} />
        </div>
      ))}
    </div>
  )
}

function ObjectsTab() {
  const [rows, setRows] = useState<ObjectCost[]>([])
  const scan = () => setRows(api()?.getObjectBreakdown() ?? [])
  return (
    <div>
      <button type="button" className="btn" onClick={scan}>
        Scan scene objects
      </button>
      {rows.map((r) => (
        <button
          type="button"
          key={r.itemId}
          className="profiler-row"
          onClick={() => api()?.selectItem(r.itemId)}
          title="Select in main window"
        >
          <span>{r.name}</span>
          <span>
            {r.triangles.toLocaleString()} tris · {r.meshes} mesh · {r.materials} mat
          </span>
        </button>
      ))}
    </div>
  )
}

export function ProfilerApp() {
  const [tab, setTab] = useState<'live' | 'cost' | 'objects'>('live')
  const [snap, setSnap] = useState<MetricsSnapshot | null>(null)

  useEffect(() => {
    const a = api()
    if (!a) return
    setSnap(a.getSnapshot())
    return a.subscribe(setSnap)
  }, [])

  return (
    <div>
      <div className="profiler-tabs">
        {(['live', 'cost', 'objects'] as const).map((t) => (
          <button
            type="button"
            key={t}
            className="btn"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'live' ? <LiveTab snap={snap} /> : null}
      {tab === 'cost' ? <CostTab /> : null}
      {tab === 'objects' ? <ObjectsTab /> : null}
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/dev/profiler/ProfilerApp.tsx src/dev/profiler/profiler.css src/dev/profiler/openProfilerWindow.ts src/dev/profiler/profilerTypes.ts
git commit -m "feat(profiler): detached-window UI (Live / Cost / Objects tabs)"
```

---

### Task 9: Wire `window.__profiler` + ⌘K entry point

**Files:**
- Create: `src/dev/profiler/installProfiler.ts`
- Modify: `src/App.tsx` (install the API on `window.__profiler`, dev+flag gated)
- Modify: `src/ui/CommandPalette.tsx` (add the dev-only "Open Profiler" command + `COMMAND_FLAGS` mapping)

**Interfaces:**
- Consumes: `profilerBridge` (Task 2); `runCostBreakdown`, `getObjectBreakdown` (Task 5); `useStore` from `src/state/store`.
- Produces: `installProfilerApi(): void` sets `window.__profiler: ProfilerApi`; a ⌘K command id `open-profiler` that calls `openProfilerWindow()`.

- [ ] **Step 1: Implement the installer**

Create `src/dev/profiler/installProfiler.ts`:

```ts
import { useStore } from '../../state/store'
import { profilerBridge } from './profilerBridge'
import { getObjectBreakdown, runCostBreakdown } from './profilerEngine'
import type { ProfilerApi } from './profilerTypes'

/** Expose the profiler API on `window.__profiler` so the detached window
 *  (a separate module realm) can reach the parent's singletons. Dev-only. */
export function installProfilerApi(): void {
  const apiObj: ProfilerApi = {
    subscribe: (cb) => profilerBridge.subscribe(cb),
    getSnapshot: () => profilerBridge.getSnapshot(),
    runCostBreakdown: (onProgress) => runCostBreakdown(onProgress),
    getObjectBreakdown: () => getObjectBreakdown(),
    selectItem: (id) => useStore.getState().selectItem(id),
  }
  ;(window as unknown as { __profiler?: ProfilerApi }).__profiler = apiObj
}
```

> Store selection action confirmed: `selectItem(id: string | null)` in `src/state/slices/selectionSlice.ts`.

- [ ] **Step 2: Install it from App (dev+flag gated)**

In `src/App.tsx`, add a dev-only effect. Near the top-level app component body, add:

```tsx
  const profilerOn = useFeature('profiler')
  useEffect(() => {
    if (!import.meta.env.DEV || !profilerOn) return
    void import('./dev/profiler/installProfiler').then((m) => m.installProfilerApi())
  }, [profilerOn])
```

(Use a dynamic import so the profiler modules stay out of the prod bundle; `import.meta.env.DEV` guards the branch. If `useFeature`/`useEffect` are not imported in `App.tsx`, add them.)

- [ ] **Step 3: Add the dev-only ⌘K command**

In `src/ui/CommandPalette.tsx`, add the `COMMAND_FLAGS` mapping entry (inside the `COMMAND_FLAGS` object):

```ts
  'open-profiler': 'profiler',
```

Then in the `base` command array (inside the `useMemo`), append a dev-only command. Since `base` is a plain array, add it via a spread guarded by `import.meta.env.DEV`:

```ts
      ...(import.meta.env.DEV
        ? [
            {
              id: 'open-profiler',
              group: 'Tools & panels',
              label: 'Open profiler (dev)',
              icon: 'Cube' as IconName,
              run: () => {
                void import('../dev/profiler/openProfilerWindow').then((m) => m.openProfilerWindow())
              },
            } satisfies Command,
          ]
        : []),
```

> The `profiler` flag is `devOnly` + `pro`, so `COMMAND_FLAGS` hides this command in prod and in Simple mode automatically; the extra `import.meta.env.DEV` spread guard keeps the dynamic import out of the prod bundle graph entry.

- [ ] **Step 4: Typecheck + run command-palette tests**

Run: `npx tsc --noEmit && npx vitest --run src/ui/CommandPalette`
Expected: no type errors; existing command-palette tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/dev/profiler/installProfiler.ts src/App.tsx src/ui/CommandPalette.tsx
git commit -m "feat(profiler): expose window.__profiler + dev-only ⌘K entry point"
```

---

### Task 10: Docs, path-scoped rules, version bump, visual verification

**Files:**
- Create: `src/dev/profiler/CLAUDE.md`
- Create: `docs/developer/profiler.md`
- Modify: `docs/ARCHITECTURE.md` (dev-tooling entry)
- Modify: `src/version.ts` + `package.json` (build bump)
- Modify: `CHANGELOG.md`
- Modify: `TODO.md` (remove the profiler active block once shipped)

- [ ] **Step 1: Write the path-scoped CLAUDE.md**

Create `src/dev/profiler/CLAUDE.md`:

```markdown
# src/dev/profiler — dev-only performance profiler

Detached-window ("DevTools-style") profiler. **Dev-only**: gated by the
`profiler` feature flag (`devOnly: true`, `tier: 'pro'`) AND `import.meta.env.DEV`
at every wiring point, so it tree-shakes out of production.

- **Bridge is a singleton reached cross-realm.** The detached window is a
  separate module realm — it must read the parent's bridge via
  `window.opener.__profiler` (installed by `installProfiler.ts`), never by
  importing `profilerBridge` directly (that would be a different instance).
- **The Canvas is `frameloop="demand"`.** The cost sweep drives its own
  `requestAnimationFrame` + `invalidate()` loop to force continuous frames while
  measuring; the live probe marks samples `continuous:false` when idle (shown as
  "idle" FPS).
- **Suspend the FPS guard during a sweep** via `benchmarkSignal` — the sweep
  mutates quality overrides, which would otherwise trip `QualityController`'s
  auto-downgrade.
- **Pure logic is unit-tested** (`costBreakdown.ts`, `objectBreakdown.ts`,
  `profilerBridge.ts`); the live glue (`profilerEngine.ts`, probe, window, UI) is
  verified by running the app.
- **No colour literals** in the UI — inherit cloned app token classes.
```

- [ ] **Step 2: Write the developer doc**

Create `docs/developer/profiler.md` documenting: what it is, how to open (⌘K → "Open profiler (dev)"), the three tabs, the cost-sweep methodology + caveats (viewport flicker, demand-mode idle FPS, cloned-CSS no-hot-reload), and that it's dev-only.

- [ ] **Step 3: Add an ARCHITECTURE.md dev-tooling entry**

In `docs/ARCHITECTURE.md`, add a short entry under the dev-tooling / scripts section pointing to `docs/developer/profiler.md` and `src/dev/profiler/`.

- [ ] **Step 4: Bump the version**

In `src/version.ts`, bump the `build` component of `APP_VERSION` by 1 (e.g. `0.16.1.5` → `0.16.1.6`) and mirror the first three parts in `package.json` `version`.

- [ ] **Step 5: Update CHANGELOG + TODO**

Add a `CHANGELOG.md` entry describing the dev profiler. In `TODO.md`, remove the "Active — dev profiler" block (shipped).

- [ ] **Step 6: Full verification pass (once)**

Run the full suite + typecheck + lint, redirecting to a log file (never pipe through `tail`):

```bash
npx vitest --run > /tmp/claude-1000/-home-cwlroda-projects-sofa-so-good/e92d84be-9553-4339-a13f-757f1fd221a9/scratchpad/vitest.log 2>&1; echo "exit=$?"
npx tsc --noEmit
npx biome check src/dev/profiler
```
Expected: all pass. Grep the log file for failures.

- [ ] **Step 7: Visual verification (dev app)**

Read `docs/visual-verification-playbook.md` first. Then:
1. `npm run dev`, open the app, switch to Pro mode.
2. ⌘K → "Open profiler (dev)" → confirm the detached window opens and is themed.
3. Orbit/drag the scene → confirm the Live tab shows non-idle FPS, draw calls, triangles updating; idle shows "idle".
4. Raise the render tier to High (Graphics panel), then Cost tab → Run → confirm the viewport flickers through effects and a ranked list appears (post-processing/shadows should be near the top on High).
5. Objects tab → Scan → confirm items are ranked by triangles and clicking one selects it in the main window.
6. Build the production bundle and confirm the profiler is absent:

```bash
npm run build && grep -rl "installProfilerApi\|profilerBridge" dist/ || echo "profiler absent from prod bundle (expected)"
```

Report what you saw (screenshots per the playbook).

- [ ] **Step 8: Commit**

```bash
git add src/dev/profiler/CLAUDE.md docs/developer/profiler.md docs/ARCHITECTURE.md src/version.ts package.json CHANGELOG.md TODO.md
git commit -m "docs(profiler): dev docs + path-scoped rules; bump build"
```

---

## Self-Review

**Spec coverage:**
- Live metrics dashboard → Task 6 (probe) + Task 8 (Live tab). ✅
- Effect-cost sweep → Task 3 (pure) + Task 5 (glue) + Task 8 (Cost tab). ✅
- Per-object GPU breakdown → Task 4 (pure) + Task 5 (glue) + Task 8 (Objects tab). ✅
- Detached window (`window.open`) → Task 7 + Task 8. ✅
- Dev-only (flag + `import.meta.env.DEV`) → Task 1 + guards in Tasks 6/9 + prod-absence check in Task 10. ✅
- Feature flag `devOnly`+`pro`, tested both modes → Task 1. ✅
- No colour literals → Task 8 CSS (layout only, inherits tokens). ✅
- `userData.itemId` prerequisite → already present (Furniture.tsx:391); no change needed. ✅ (spec's "add if missing" resolved to "already there".)
- Docs + version bump → Task 10. ✅

**Cross-realm correctness:** The detached window reads the parent singleton via `window.opener.__profiler` (Tasks 8–9), not a direct import — the one subtlety that would silently break a naive implementation, called out explicitly.

**Type consistency:** `MetricsSample`/`MetricsSnapshot`/`EffectCost`/`ObjectCost`/`ProfilerApi` defined once in `profilerTypes.ts`; `BridgeRefs` in `profilerBridge.ts`; `SweepStep`/`MeasureFn` in `costBreakdown.ts`. `runCostBreakdown`/`getObjectBreakdown` signatures match between `profilerEngine.ts`, `installProfiler.ts`, and `ProfilerApi`.

**Resolved verification items:** store single-select action confirmed as `selectItem(id: string | null)` (`selectionSlice.ts`); `userData.itemId` confirmed present on furniture roots (`Furniture.tsx:391`).
