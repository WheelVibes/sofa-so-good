/// <reference lib="webworker" />
import { type OptimizeOptions, optimizeGlb } from './optimizeGlb'

interface Request {
  id: number
  input: ArrayBuffer
  opts: OptimizeOptions
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, input, opts } = e.data
  const worker = self as unknown as Worker
  try {
    const { data, report } = await optimizeGlb(new Uint8Array(input), opts)
    // Transfer the result buffer back to avoid a copy.
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    worker.postMessage({ id, ok: true, data: buffer, report }, [buffer])
  } catch (err) {
    worker.postMessage({ id, ok: false, error: String(err) })
  }
}
