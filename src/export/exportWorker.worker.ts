/// <reference lib="webworker" />
/**
 * Off-main-thread whole-scene 3D export (Q-3DEXPORT tail — worker path for
 * very large scenes, see `exportThreshold.ts`). Receives a
 * `marshalSceneForWorker` payload, rebuilds a real three.js `Object3D` tree
 * (`reconstructSceneFromMarshal`), and runs the SAME per-format export
 * functions the main-thread (small-scene) path uses — no export-logic
 * duplication, only the input/output plumbing differs.
 */
import { reconstructSceneFromMarshal } from './sceneMarshal'

export type SceneExportWorkerFormat = 'glb' | 'obj' | 'stl' | 'usdz'

export interface SceneExportWorkerRequest {
  id: number
  json: Record<string, unknown>
  format: SceneExportWorkerFormat
}

export type SceneExportWorkerReply =
  | { id: number; ok: true; format: SceneExportWorkerFormat; data: ArrayBuffer | string }
  | { id: number; ok: false; error: string }

self.onmessage = async (e: MessageEvent<SceneExportWorkerRequest>) => {
  const { id, json, format } = e.data
  const worker = self as unknown as Worker
  try {
    const object = await reconstructSceneFromMarshal(json)
    // Neither exporter updates world matrices itself (they assume a live,
    // already-rendered scene) — the reconstructed tree is never rendered, so
    // this has to happen explicitly (see `sceneMarshal.ts` doc comment).
    object.updateMatrixWorld(true)

    if (format === 'obj') {
      const { exportSceneObj } = await import('./sceneObj')
      const text = await exportSceneObj(object)
      worker.postMessage({ id, ok: true, format, data: text } satisfies SceneExportWorkerReply)
    } else if (format === 'stl') {
      const { exportSceneStl } = await import('./sceneStl')
      const text = await exportSceneStl(object)
      worker.postMessage({ id, ok: true, format, data: text } satisfies SceneExportWorkerReply)
    } else if (format === 'usdz') {
      const { exportSceneUsdz } = await import('./sceneUsdz')
      const bytes = await exportSceneUsdz(object)
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer
      worker.postMessage({ id, ok: true, format, data: buffer } satisfies SceneExportWorkerReply, [
        buffer,
      ])
    } else {
      const { exportGlb } = await import('../furniture/convert/toGlb')
      const buffer = await exportGlb(object)
      worker.postMessage({ id, ok: true, format, data: buffer } satisfies SceneExportWorkerReply, [
        buffer,
      ])
    }
  } catch (err) {
    worker.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies SceneExportWorkerReply)
  }
}
