/// <reference lib="webworker" />
import { ConvertError, convertModel } from './convertModel'
import { patchImageLoaderForWorker } from './imageLoaderWorkerPatch'

// Installed once, at worker startup, before any conversion request arrives —
// see imageLoaderWorkerPatch.ts for why this is the only DOM gap in the whole
// convert pipeline.
patchImageLoaderForWorker()

interface Request {
  id: number
  entry: File
  siblings: File[]
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, entry, siblings } = e.data
  const worker = self as unknown as Worker
  try {
    // Reuses the EXACT same conversion function the main thread would have
    // called — no parallel/duplicated conversion logic to keep in sync. The
    // only thing that differs between the two realms is `document`, which the
    // patch above bridges.
    const { glb, format } = await convertModel(entry, siblings)
    const buffer = await glb.arrayBuffer()
    worker.postMessage({ id, ok: true, buffer, format, name: glb.name }, [buffer])
  } catch (err) {
    // `ConvertError` = a genuine validation failure (unsupported format,
    // over-size, zip bomb, …) — the SAME failure would happen again on a
    // main-thread retry, so the caller should surface it as-is rather than
    // re-running. Anything else is an unexpected in-worker failure (e.g. a
    // format edge case this worker's environment can't handle) — the caller
    // falls back to a main-thread `convertModel` call for this file only.
    const expected = err instanceof ConvertError
    worker.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      expected,
    })
  }
}
