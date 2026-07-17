/**
 * CSG v2 worker offload (Stage 1b) — evaluates a combine group's boolean off the
 * main thread so a heavy multi-operand three-bvh-csg fold never stalls the
 * designer's render loop. This is the THIRD pooled worker in the app and BUILDS
 * ON the generic `furniture/worker/workerPool.ts` (like `convert/runConvert.ts`)
 * rather than re-implementing the spawn-on-contention / per-worker-retire /
 * idle-teardown lifecycle — see that file's header for why `runOptimize.ts`
 * itself wasn't refactored onto it.
 *
 * Transferables: each operand's geometry attributes (position/normal/uv/index)
 * are posted as their backing `ArrayBuffer`s (zero-copy), and the result comes
 * back the same way. When no Worker can be constructed (the Node/happy-dom test
 * env, or a worker crash) `runCombineOnPool` resolves `null` and the caller
 * (`csgEval.combineGroupToMeshPart`) folds on the main thread instead — the
 * exact same `foldCsg` code path, so results are identical either way.
 */

import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three'
import { computePoolMax } from '../optimize/runOptimize'
import { WorkerPool } from '../worker/workerPool'
import type { CsgGroupRange, CsgOperand } from './csgEval'
import type { CombineOp } from './editSpec'

/** Serialised operand geometry crossing the worker boundary. Typed-array fields
 *  are transferred (their buffers move, not copy). */
interface SerializedOperand {
  positions: Float32Array
  normals?: Float32Array
  uv?: Float32Array
  index?: Uint32Array
  materialIndex: number
  role: 'solid' | 'hole'
}

export interface CsgWorkerRequest {
  id: number
  operands: SerializedOperand[]
  op: CombineOp
}

interface CsgWorkerOkReply {
  id: number
  ok: true
  positions: Float32Array
  normals: Float32Array
  uv?: Float32Array
  index?: Uint32Array
  groups: CsgGroupRange[]
}
interface CsgWorkerErrReply {
  id: number
  ok: false
  error: string
}
type CsgWorkerReply = CsgWorkerOkReply | CsgWorkerErrReply

/** Same core-count/RAM heuristic the other two pools use, so "capable machine"
 *  stays consistent across the app. */
function poolMax(): number {
  if (typeof navigator === 'undefined') return 4
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4
  return computePoolMax(cores, nav.deviceMemory)
}

/** How long an idle CSG worker survives before teardown — matches the convert
 *  pool. Each worker keeps the three-bvh-csg module resident. */
const IDLE_TEARDOWN_MS = 30_000

let pool: WorkerPool<CsgWorkerReply> | null = null

function getPool(): WorkerPool<CsgWorkerReply> {
  if (!pool) {
    pool = new WorkerPool<CsgWorkerReply>(
      {
        spawnWorker: () => {
          try {
            return new Worker(new URL('./csg.worker.ts', import.meta.url), { type: 'module' })
          } catch {
            return null
          }
        },
        parseReply: (data) => {
          const d = data as CsgWorkerReply
          return { id: d.id, reply: d }
        },
      },
      { poolMax: poolMax(), idleTeardownMs: IDLE_TEARDOWN_MS },
    )
  }
  return pool
}

/** Serialise a `CsgOperand`'s geometry to transferable typed arrays + collect
 *  the transfer list (the backing buffers). */
function serializeOperand(o: CsgOperand): { operand: SerializedOperand; transfer: ArrayBuffer[] } {
  const pos = o.geometry.getAttribute('position')
  const nor = o.geometry.getAttribute('normal')
  const uv = o.geometry.getAttribute('uv')
  const idx = o.geometry.getIndex()
  const positions = new Float32Array(pos.array as ArrayLike<number>)
  const transfer: ArrayBuffer[] = [positions.buffer as ArrayBuffer]
  const operand: SerializedOperand = {
    positions,
    materialIndex: o.materialIndex,
    role: o.role,
  }
  if (nor) {
    operand.normals = new Float32Array(nor.array as ArrayLike<number>)
    transfer.push(operand.normals.buffer as ArrayBuffer)
  }
  if (uv) {
    operand.uv = new Float32Array(uv.array as ArrayLike<number>)
    transfer.push(operand.uv.buffer as ArrayBuffer)
  }
  if (idx) {
    operand.index = new Uint32Array(idx.array as ArrayLike<number>)
    transfer.push(operand.index.buffer as ArrayBuffer)
  }
  return { operand, transfer }
}

/** Rebuild a result `BufferGeometry` from a worker's ok reply (no groups applied
 *  here — the caller re-adds them from `reply.groups`). */
function deserializeReply(reply: CsgWorkerOkReply): BufferGeometry {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(reply.positions, 3))
  geo.setAttribute('normal', new Float32BufferAttribute(reply.normals, 3))
  if (reply.uv) geo.setAttribute('uv', new Float32BufferAttribute(reply.uv, 2))
  if (reply.index) geo.setIndex(new Uint32BufferAttribute(reply.index, 1))
  return geo
}

/**
 * Evaluate a combine fold on the shared worker pool. Resolves the result
 * geometry + groups, or `null` when no worker is available/usable for this call
 * (caller folds on the main thread) or the worker reported a genuine failure
 * (degenerate result — also handled by the main-thread fallback, which will
 * throw the same way). Consumes (does NOT dispose) the operand geometries —
 * `combineGroupToMeshPart` owns their disposal.
 */
export async function runCombineOnPool(
  operands: CsgOperand[],
  op: CombineOp,
): Promise<{ geometry: BufferGeometry; groups: CsgGroupRange[] } | null> {
  const serialized = operands.map(serializeOperand)
  const reply = await getPool().call((id) => ({
    message: {
      id,
      op,
      operands: serialized.map((s) => s.operand),
    } satisfies CsgWorkerRequest,
    transfer: serialized.flatMap((s) => s.transfer),
  }))
  if (reply === null) return null // no worker → main-thread fallback
  if (!reply.ok) return null // degenerate/failed → let the main-thread fold throw
  return { geometry: deserializeReply(reply), groups: reply.groups }
}
