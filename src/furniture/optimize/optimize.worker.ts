/// <reference lib="webworker" />
import { generateLodVariants } from './lodVariants'
import { type OptimizeOptions, optimizeGlb } from './optimizeGlb'

interface Request {
  id: number
  input: ArrayBuffer
  opts: OptimizeOptions
  /** Also generate -low/-medium LOD variants from the optimized output. */
  lodTiers?: boolean
}

/** Slice a Uint8Array view to a transferable ArrayBuffer. */
function toBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, input, opts, lodTiers } = e.data
  const worker = self as unknown as Worker
  try {
    const { data, report } = await optimizeGlb(new Uint8Array(input), opts)
    // Tier generation is best-effort (generateLodVariants never throws): a
    // failure just means the reply carries no variants.
    const lods = lodTiers ? await generateLodVariants(data) : undefined
    // Transfer all result buffers back to avoid copies.
    const buffer = toBuffer(data)
    const lodLow = lods?.low ? toBuffer(lods.low) : undefined
    const lodMedium = lods?.medium ? toBuffer(lods.medium) : undefined
    const transfer = [buffer, ...(lodLow ? [lodLow] : []), ...(lodMedium ? [lodMedium] : [])]
    worker.postMessage({ id, ok: true, data: buffer, report, lodLow, lodMedium }, transfer)
  } catch (err) {
    worker.postMessage({ id, ok: false, error: String(err) })
  }
}
