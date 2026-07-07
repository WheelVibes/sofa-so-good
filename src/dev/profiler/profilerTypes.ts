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
