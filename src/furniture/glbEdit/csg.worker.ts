/// <reference lib="webworker" />
/**
 * CSG v2 combine worker (Stage 1b). Rebuilds each operand geometry from the
 * transferred typed arrays, runs the SAME `foldCsg` core the main thread would
 * (no parallel CSG logic to keep in sync — three-bvh-csg needs no DOM, so unlike
 * the convert worker there's no ImageLoader gap to bridge), and posts the result
 * attributes back as transferables. A degenerate/empty fold is reported as
 * `ok: false`; the caller then folds on the main thread (which throws the same
 * way) and surfaces the error.
 */
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three'
import type { CsgOperand } from './csgEval'
import { foldCsg } from './csgEval'
import type { CsgWorkerRequest } from './csgWorkerPool'

function operandFromSerialized(o: CsgWorkerRequest['operands'][number]): CsgOperand {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(o.positions, 3))
  if (o.normals) geo.setAttribute('normal', new Float32BufferAttribute(o.normals, 3))
  if (o.uv) geo.setAttribute('uv', new Float32BufferAttribute(o.uv, 2))
  if (o.index) geo.setIndex(new Uint32BufferAttribute(o.index, 1))
  return { geometry: geo, materialIndex: o.materialIndex, role: o.role }
}

self.onmessage = async (e: MessageEvent<CsgWorkerRequest>) => {
  const { id, operands, op } = e.data
  const worker = self as unknown as Worker
  try {
    const csgOperands = operands.map(operandFromSerialized)
    const { geometry, groups } = await foldCsg(csgOperands, op)
    const pos = geometry.getAttribute('position')
    const nor = geometry.getAttribute('normal')
    const uv = geometry.getAttribute('uv')
    const idx = geometry.getIndex()
    if (!pos || pos.count < 3) throw new Error('CSG worker: empty result')
    const positions = new Float32Array(pos.array as ArrayLike<number>)
    const normals = new Float32Array((nor?.array ?? new Float32Array(0)) as ArrayLike<number>)
    const transfer: ArrayBuffer[] = [positions.buffer as ArrayBuffer, normals.buffer as ArrayBuffer]
    const uvArr = uv ? new Float32Array(uv.array as ArrayLike<number>) : undefined
    if (uvArr) transfer.push(uvArr.buffer as ArrayBuffer)
    const idxArr = idx ? new Uint32Array(idx.array as ArrayLike<number>) : undefined
    if (idxArr) transfer.push(idxArr.buffer as ArrayBuffer)
    for (const o of csgOperands) o.geometry.dispose()
    geometry.dispose()
    worker.postMessage(
      { id, ok: true, positions, normals, uv: uvArr, index: idxArr, groups },
      transfer,
    )
  } catch (err) {
    worker.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
