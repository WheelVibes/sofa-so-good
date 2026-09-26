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

/** Thrown when a code (or its decompressed payload) exceeds the size limits —
 *  distinguishable from "corrupt" so callers can offer a fallback (e.g. the
 *  `.sofa.json` export) instead of "invalid link". */
export class ShareTooLargeError extends PlanShareError {}

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
const MAX_CODE_LENGTH = 2_000_000

/** Cap on the *decompressed* payload. The compressed-size limit alone is not a
 *  zip-bomb guard — deflate easily expands 2 MB into gigabytes — so inflation is
 *  bounded to this many bytes and aborted past it. A real design's JSON is a few
 *  MB even with thousands of items, well under this ceiling (which mirrors the
 *  `.sofa.json` import limit so both untrusted paths refuse the same oversize). */
const MAX_DECOMPRESSED_BYTES = 50 * 1024 * 1024

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

/** Optional overrides for {@link decodePlan}'s size guards — a stricter route
 *  (e.g. the `#/design/<code>` link with its hard URL budget) reuses the same
 *  codec + bounded inflate with tighter caps. */
export interface DecodeLimits {
  maxCodeLength?: number
  maxDecompressedBytes?: number
}

/** Decode a code produced by {@link encodePlan} back to its value. Throws
 *  {@link ShareTooLargeError} on an oversized code/payload and
 *  {@link PlanShareError} on a malformed one. */
export function decodePlan(code: string, limits?: DecodeLimits): unknown {
  const trimmed = code.trim()
  if (!trimmed) throw new PlanShareError('Empty plan link.')
  const maxCode = limits?.maxCodeLength ?? MAX_CODE_LENGTH
  const maxBytes = limits?.maxDecompressedBytes ?? MAX_DECOMPRESSED_BYTES
  if (trimmed.length > maxCode) throw new ShareTooLargeError('Plan link is too large.')
  try {
    return JSON.parse(strFromU8(inflateBounded(fromBase64Url(trimmed), maxBytes)))
  } catch (e) {
    if (e instanceof DecompressionLimitError)
      throw new ShareTooLargeError('Plan link is too large.')
    throw new PlanShareError('That plan link is invalid or corrupted.')
  }
}

/** Encode the current design into a shareable code (same payload as a save). */
export function encodeDesignToCode(state: RootState): string {
  return encodePlan(serialize(state))
}

/**
 * Migrate + validate an already-decoded payload into a {@link SerializedState}.
 *
 * Split out of {@link decodeCodeToDesign} so a caller that needs to read an
 * *envelope* field the schema doesn't model (the showroom link's `viewOnly`
 * capability flag — zod strips unknown keys, so it has to be read off the raw
 * object before this runs) can decode once and validate once, rather than
 * inflating the same code twice.
 */
export function designFromRaw(raw: unknown): SerializedState {
  // Count check on the RAW payload, before migrate + zod walk every item: the
  // `#/plans/` route admits a 2 MB code, which is enough to make validation
  // itself the expensive step.
  assertItemCount(raw)
  let migrated: unknown
  try {
    migrated = migrate(raw)
  } catch (e) {
    throw new PlanShareError(`Unsupported plan version: ${(e as Error).message}`)
  }
  const result = SerializedStateZ.safeParse(migrated)
  if (!result.success) throw new PlanShareError("That link doesn't contain a valid plan.")
  return dedupeItemIds(result.data as SerializedState)
}

/**
 * Most items a SHARED design may carry (security review R7, finding S2).
 *
 * Measured 2026-09-25 on this build before choosing it: the default move-in flat
 * is 87 items; the largest design the app's own furnish path produces is 149
 * (`furnishPlanItems` over every one of the 19 `PLAN_TEMPLATES` x 17
 * `LAYOUT_PRESETS`, max = HDB Maisonette / move-in), whose `#/design/` code is
 * 10.3 KB — so an honest 3D link already tops out near ~240 items at the 16 KB
 * code budget. 2,000 is 13x the largest furnished template and 23x the default,
 * so no design a person builds here comes near it, while a crafted payload (a
 * 16 KB link inflated to ~2,900 unique / ~6,300 duplicate-id items; a 2 MB
 * `#/plans/` code, ~100x that) is refused before a single item is mounted.
 *
 * Scoped to share links ONLY — not `SerializedStateZ` — so the user's own
 * autosave, save slots and `.sofa.json` files are never rejected by it.
 */
export const MAX_SHARED_ITEMS = 2000

/** A share payload over {@link MAX_SHARED_ITEMS}. Its message is user-facing. */
export class ShareItemLimitError extends PlanShareError {}

function rawItemCount(list: unknown): number {
  return Array.isArray(list) ? list.length : 0
}

function assertItemCount(raw: unknown): void {
  if (typeof raw !== 'object' || raw === null) return
  const r = raw as { items?: unknown; tenderedSnapshot?: { items?: unknown } | null }
  const n = Math.max(rawItemCount(r.items), rawItemCount(r.tenderedSnapshot?.items))
  if (n > MAX_SHARED_ITEMS) {
    throw new ShareItemLimitError(
      `That link holds ${n.toLocaleString('en')} items — more than the ${MAX_SHARED_ITEMS.toLocaleString('en')} a shared design can carry, so it wasn't opened. Ask the sender to share the design as a .sofa.json file instead.`,
    )
  }
}

/** Keep the first item for each id. The app never produces two items with one
 *  id (every placement mints a fresh one), and every by-id path — selection,
 *  the inspector, undo, pinned comments — assumes uniqueness. */
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((it) => {
    if (seen.has(it.id)) return false
    seen.add(it.id)
    return true
  })
}

function dedupeItemIds(design: SerializedState): SerializedState {
  const items = dedupeById(design.items)
  const tendered = design.tenderedSnapshot
  const tItems = tendered ? dedupeById(tendered.items) : undefined
  if (items.length === design.items.length && tItems?.length === tendered?.items.length) {
    return design
  }
  return {
    ...design,
    items,
    ...(tendered && tItems ? { tenderedSnapshot: { ...tendered, items: tItems } } : {}),
  }
}

/**
 * Decode a share code into a validated, migrated {@link SerializedState} ready
 * for `applySerialized`. Throws {@link PlanShareError} with a user-facing
 * message on a bad code, an unsupported version, or a schema mismatch.
 */
export function decodeCodeToDesign(code: string, limits?: DecodeLimits): SerializedState {
  return designFromRaw(decodePlan(code, limits)) // throws PlanShareError on a bad code
}
