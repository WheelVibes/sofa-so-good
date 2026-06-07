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
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import { type SerializedState, SerializedStateZ, serialize } from '../state/schema'
import { migrate } from '../state/storage/migrations'
import type { RootState } from '../state/store'

export class PlanShareError extends Error {}

/** Reject an oversized code before inflating (cheap zip-bomb / DoS guard). A
 *  real design compresses to well under this. */
export const MAX_CODE_LENGTH = 2_000_000

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
    return JSON.parse(strFromU8(inflateSync(fromBase64Url(trimmed))))
  } catch {
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
