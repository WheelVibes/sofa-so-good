/// <reference lib="webworker" />
/**
 * OffscreenCanvas worker for procedural PBR texture generation.
 *
 * Receives a {@link WorkerRequest} and replies with a {@link WorkerReply}
 * that carries three `ImageBitmap`s (transferable, zero-copy back to the
 * main thread). Three.js is NOT imported here — only the pure-computation
 * helpers from noise.ts and the field generators from generators.ts.
 */

import type { ProceduralPattern } from '../types'
import { generateProceduralRaw } from './generators'

export interface WorkerRequest {
  id: number
  /** Material id string — used for seed derivation via hashSeed. */
  matId: string
  pattern: ProceduralPattern
  swatch: string
  /** Target texture size (256 | 512). */
  size: number
}

export interface WorkerReply {
  id: number
  ok: true
  albedo: ImageBitmap
  normal: ImageBitmap
  roughness: ImageBitmap
  metalness: number
}

export interface WorkerError {
  id: number
  ok: false
  error: string
}

/** Wrap a raw RGBA Uint8ClampedArray pixel buffer into an ImageBitmap
 *  using an OffscreenCanvas — no DOM, fully worker-safe. */
async function pixelsToImageBitmap(data: Uint8ClampedArray, size: number): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(size, size)
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  img.data.set(data)
  ctx.putImageData(img, 0, 0)
  return canvas.transferToImageBitmap()
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, matId, pattern, swatch, size } = e.data
  const w = self as unknown as Worker
  try {
    const raw = generateProceduralRaw(matId, pattern, swatch, size)

    const [albedo, normal, roughness] = await Promise.all([
      pixelsToImageBitmap(raw.albedo, size),
      pixelsToImageBitmap(raw.normal, size),
      pixelsToImageBitmap(raw.roughness, size),
    ])

    const reply: WorkerReply = { id, ok: true, albedo, normal, roughness, metalness: raw.metalness }
    w.postMessage(reply, [albedo, normal, roughness])
  } catch (err) {
    const errReply: WorkerError = { id, ok: false, error: String(err) }
    w.postMessage(errReply)
  }
}
