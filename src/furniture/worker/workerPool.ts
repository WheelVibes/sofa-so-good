/**
 * Generic bounded worker-pool primitive: spawn-on-contention, per-worker error
 * retirement, and idle teardown. Factored out of `optimize/runOptimize.ts`
 * (the optimize worker pool, shipped 2026-07-03) so a second pool — the
 * model-convert pool (`convert/runConvert.ts`) — doesn't re-implement the same
 * lifecycle bookkeeping from scratch.
 *
 * `runOptimize.ts` itself is left as its own standalone implementation rather
 * than refactored onto this: it just shipped with its own from-scratch
 * lifecycle code and a test suite (`runOptimize.pool.test.ts`) written against
 * that exact internal shape, and this task's brief explicitly favours NOT
 * destabilizing a just-shipped pool over DRYing it retroactively. New pools
 * should build on this generic version instead of copy-pasting the pattern a
 * third time.
 */

interface PoolEntry<TReply> {
  worker: Worker
  /** In-flight call resolvers keyed by message id (a worker processes serially,
   *  but the pool can have several calls queued on it while busy). */
  pending: Map<number, (r: TReply | null) => void>
  /** Pending idle-teardown timer, armed once `pending` empties; cleared if a
   *  new job claims this worker before the timer fires. */
  idleTimer?: ReturnType<typeof setTimeout>
}

export interface WorkerPoolHooks<TReply> {
  /** Construct a fresh Worker for the pool (e.g.
   *  `new Worker(new URL('./x.worker.ts', import.meta.url), {type:'module'})`).
   *  Return `null` if construction throws (no Worker support in this
   *  environment) — the pool treats that as "no pool available". */
  spawnWorker: () => Worker | null
  /** Decode a raw `message` event's `data` into the call id it answers plus
   *  the parsed reply. Return `reply: null` for a well-formed "this call
   *  failed" answer (falls back for THAT call only — the worker stays in the
   *  pool and keeps serving other calls). */
  parseReply: (data: unknown) => { id: number; reply: TReply | null }
}

export interface WorkerPoolOptions {
  /** Upper bound on pool size (a ceiling — workers spawn lazily, only under
   *  contention, never eagerly up to this number). */
  poolMax: number
  /** How long a worker sits idle (0 pending calls) before it's terminated and
   *  dropped from the pool. */
  idleTeardownMs: number
}

/** One call's outgoing message, built lazily once an id has been assigned
 *  (some protocols embed the id in the payload). */
export interface PoolPost {
  message: unknown
  transfer?: Transferable[]
}

/**
 * A bounded pool of same-purpose Workers. Workers spawn on contention (an
 * idle one is reused first; a new one is only spun up when every existing
 * worker is busy and the pool is under `poolMax`), retire individually on
 * `error`/`messageerror` (falling only THEIR queued calls back to `null`,
 * never touching the rest of the pool), and tear themselves down after
 * `idleTeardownMs` with nothing pending (a fresh one respawns on the next
 * call) so a burst doesn't hold its peak worker count for the rest of the
 * session.
 */
export class WorkerPool<TReply> {
  private pool: PoolEntry<TReply>[] = []
  private broken = false
  private seq = 0

  constructor(
    private readonly hooks: WorkerPoolHooks<TReply>,
    private readonly opts: WorkerPoolOptions,
  ) {}

  /** Best-effort worker termination — never throw out of a teardown path. */
  private terminate(entry: PoolEntry<TReply>): void {
    try {
      entry.worker.terminate()
    } catch {
      // already gone / unsupported — nothing more to do
    }
  }

  private clearIdleTimer(entry: PoolEntry<TReply>): void {
    if (entry.idleTimer === undefined) return
    clearTimeout(entry.idleTimer)
    entry.idleTimer = undefined
  }

  private scheduleIdleTeardown(entry: PoolEntry<TReply>): void {
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = undefined
      if (entry.pending.size > 0) return // claimed again in the meantime
      this.pool = this.pool.filter((p) => p !== entry)
      this.terminate(entry)
    }, this.opts.idleTeardownMs)
  }

  private spawn(): PoolEntry<TReply> | null {
    const worker = this.hooks.spawnWorker()
    if (!worker) return null
    const entry: PoolEntry<TReply> = { worker, pending: new Map() }
    worker.onmessage = (e: MessageEvent<unknown>) => {
      const { id, reply } = this.hooks.parseReply(e.data)
      const resolve = entry.pending.get(id)
      if (!resolve) return
      entry.pending.delete(id)
      resolve(reply)
      if (entry.pending.size === 0) this.scheduleIdleTeardown(entry)
    }
    // Retire only THIS worker on failure: fall its own in-flight calls back to
    // `null` (caller's per-task fallback) and drop it from the pool — a fresh
    // one spawns on demand. `messageerror` fires when a reply can't be
    // structured-cloned; without handling it that call would hang forever.
    const retire = () => {
      this.clearIdleTimer(entry)
      for (const [, resolve] of entry.pending) resolve(null)
      entry.pending.clear()
      this.pool = this.pool.filter((p) => p !== entry)
      this.terminate(entry)
    }
    worker.onerror = retire
    worker.onmessageerror = retire
    return entry
  }

  /**
   * Pick a worker for the next job, growing the pool **on contention**: reuse
   * an idle worker when one exists; otherwise, only if every existing worker
   * is busy AND we're under `poolMax`, spin up another. Falls back to the
   * least-busy worker at the cap. Returns `null` when no worker is available
   * at all (construction failed / pool previously found broken).
   */
  private pick(): PoolEntry<TReply> | null {
    if (this.broken) return null
    let best: PoolEntry<TReply> | null = null
    for (const entry of this.pool) {
      if (best === null || entry.pending.size < best.pending.size) best = entry
    }
    const allBusy = best === null || best.pending.size > 0
    if (allBusy && this.pool.length < this.opts.poolMax) {
      const entry = this.spawn()
      if (entry) {
        this.pool.push(entry)
        return entry
      }
      // Worker construction failed with none yet available → no pool at all.
      if (this.pool.length === 0) {
        this.broken = true
        return null
      }
    }
    // Claiming this worker for a new job — cancel any pending idle-teardown so
    // it isn't terminated out from under the in-flight call.
    if (best) this.clearIdleTimer(best)
    return best
  }

  /**
   * Submit one call to the pool. `post(id)` builds the outgoing message once
   * an id has been assigned. Resolves `null` when no worker is available/
   * usable for this call at all — the caller is expected to fall back (e.g.
   * to a direct main-thread call) in that case.
   */
  call(post: (id: number) => PoolPost): Promise<TReply | null> {
    const entry = this.pick()
    if (!entry) return Promise.resolve(null)
    return new Promise((resolve) => {
      const id = ++this.seq
      entry.pending.set(id, resolve)
      const { message, transfer } = post(id)
      if (transfer && transfer.length > 0) entry.worker.postMessage(message, transfer)
      else entry.worker.postMessage(message)
    })
  }

  /** Current pool size — exposed for tests/observability, not decision logic. */
  get size(): number {
    return this.pool.length
  }
}
