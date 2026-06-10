/**
 * Plan sharing via a self-contained link — no backend. A design is serialized
 * (the same payload as a save slot / `.sofa.json`), deflated (fflate) and
 * base64url-encoded into a code that rides in the URL hash (`#/plans/<code>`),
 * so opening that link on any instance reconstructs the exact design. Like
 * Excalidraw/tldraw's default share, the "UID" *is* the encoded plan — short
 * vanity codes would need a server-side store.
 *
 * The codec is pure + synchronous (fflate) so it's unit-testable; the
 * schema-tied wrappers reuse `migrate` + `SerializedStateZ`, so a hand-edited or
 * older link is migrated + validated, never blindly trusted.
 */
import { deflateSync, Inflate, strFromU8, strToU8 } from 'fflate'
import { type SerializedState, SerializedStateZ, serialize } from '../state/schema'
import { migrate } from '../state/storage/migrations'
import type { RootState } from '../state/store'

export class PlanShareError extends Error {}

/** Hash-route that carries a shared plan: `#/plans/<code>` (also tolerates
 *  `#plans/<code>`). Hash routing works on static hosting with no SPA fallback. */
const PLAN_ROUTE_RE = /#\/?plans\/([A-Za-z0-9_-]+)/

/** Extract a plan code from a URL hash, or null if it isn't a plan route. */
export function parsePlanRoute(hash: string | null | undefined): string | null {
  if (!hash) return null
  const m = PLAN_ROUTE_RE.exec(hash)
  return m ? m[1] : null
}

/** The hash fragment for a code (`#/plans/<code>`). */
export function planShareHash(code: string): string {
  return `#/plans/${code}`
}

/** A full shareable URL for a code (origin + app base + plan hash). */
export function buildPlanShareUrl(code: string): string {
  const origin = globalThis.location?.origin ?? ''
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/'
  return `${origin}${base}${planShareHash(code)}`
}

/** Reject an oversized code before inflating (cheap first-line DoS guard). A
 *  real design compresses to well under this. */
export const MAX_CODE_LENGTH = 2_000_000

/** Cap on the *decompressed* payload. The compressed-size limit alone is not a
 *  zip-bomb guard — deflate easily expands 2 MB into gigabytes — so inflation is
 *  bounded to this many bytes and aborted past it. A real design's JSON is a few
 *  MB even with thousands of items, well under this ceiling (which mirrors the
 *  `.sofa.json` import limit so both untrusted paths refuse the same oversize). */
export const MAX_DECOMPRESSED_BYTES = 50 * 1024 * 1024

class DecompressionLimitError extends Error {}

/** Inflate `bytes`, aborting if the output would exceed `maxBytes`. Feeds the
 *  deflate stream to fflate in small slices so a malicious payload is stopped
 *  near the cap instead of fully expanding into memory first (a single
 *  `inflateSync` allocates the entire output before we could check its size). */
function inflateBounded(bytes: Uint8Array, maxBytes: number): Uint8Array {
  const parts: Uint8Array[] = []
  let total = 0
  const inf = new Inflate((chunk) => {
    total += chunk.length
    if (total > maxBytes) throw new DecompressionLimitError('decompressed payload too large')
    // Copy: fflate may reuse its internal output buffer across pushes.
    parts.push(chunk.slice())
  })
  const STEP = 16_384
  for (let i = 0; i < bytes.length; i += STEP) {
    const final = i + STEP >= bytes.length
    inf.push(bytes.subarray(i, Math.min(i + STEP, bytes.length)), final)
    if (total > maxBytes) throw new DecompressionLimitError('decompressed payload too large')
  }
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(code: string): Uint8Array {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Encode any JSON-serialisable value to a URL-safe, deflated code. */
export function encodePlan(payload: unknown): string {
  const json = JSON.stringify(payload)
  return toBase64Url(deflateSync(strToU8(json), { level: 6 }))
}

/** Decode a code produced by {@link encodePlan} back to its value. Throws
 *  {@link PlanShareError} on a malformed/oversized code. */
export function decodePlan(code: string): unknown {
  const trimmed = code.trim()
  if (!trimmed) throw new PlanShareError('Empty plan link.')
  if (trimmed.length > MAX_CODE_LENGTH) throw new PlanShareError('Plan link is too large.')
  try {
    return JSON.parse(strFromU8(inflateBounded(fromBase64Url(trimmed), MAX_DECOMPRESSED_BYTES)))
  } catch (e) {
    if (e instanceof DecompressionLimitError) throw new PlanShareError('Plan link is too large.')
    throw new PlanShareError('That plan link is invalid or corrupted.')
  }
}

/** Encode the current design into a shareable code (same payload as a save). */
export function encodeDesignToCode(state: RootState): string {
  return encodePlan(serialize(state))
}

/**
 * Decode a share code into a validated, migrated {@link SerializedState} ready
 * for `applySerialized`. Throws {@link PlanShareError} with a user-facing
 * message on a bad code, an unsupported version, or a schema mismatch.
 */
export function decodeCodeToDesign(code: string): SerializedState {
  const raw = decodePlan(code) // throws PlanShareError on a bad code
  let migrated: unknown
  try {
    migrated = migrate(raw)
  } catch (e) {
    throw new PlanShareError(`Unsupported plan version: ${(e as Error).message}`)
  }
  const result = SerializedStateZ.safeParse(migrated)
  if (!result.success) throw new PlanShareError("That link doesn't contain a valid plan.")
  return result.data as SerializedState
}
