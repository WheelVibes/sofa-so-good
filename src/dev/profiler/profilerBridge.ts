import type { Scene, WebGLRenderer } from 'three'
import type { RenderTier } from '../../scene/quality'
import type { MetricsSample, MetricsSnapshot } from './profilerTypes'

/** Live references registered by the in-Canvas probe. */
interface BridgeRefs {
  gl: WebGLRenderer
  scene: Scene
  invalidate: () => void
}

/** Max samples retained for the sparkline (~2s at 60fps of throttled emits). */
export const HISTORY_LIMIT = 120

/**
 * Dev-only singleton connecting the in-Canvas probe (main window) to the
 * detached profiler window's UI (rendered by the parent's React root into the
 * child DOM, so it runs in the same realm and reads it via `window.__profiler`).
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
