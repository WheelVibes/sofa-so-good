/**
 * Shareable interactive 3D design link — `#/design/<code>`, no backend.
 *
 * Same codec as plan sharing (`planShare.ts`: deflate → base64url in the URL
 * hash) but tuned for a *link you'd paste in a chat*: the serialized design is
 * stripped of session noise (device location, camera mode, prompt-dismissed
 * flags) and of user-uploaded/IKEA defs — their binaries live in this
 * browser's IndexedDB and cannot travel in a URL — then hard-capped at a
 * {@link DESIGN_CODE_BUDGET} code length. Oversized designs get a clear
 * "use the .sofa.json export" error instead of a 100 KB URL that messaging
 * apps will truncate.
 *
 * Decoding reuses the bounded inflate (zip-bomb guard) with tighter caps, the
 * `migrate` chain and the zod schema; items whose defId is unknown on the
 * receiving instance (e.g. they referenced the sender's uploads) are dropped
 * with a count via {@link applySharedDesign}.
 */
import { applySerialized, type SerializedState, serialize } from '../state/schema'
import type { RootState } from '../state/store'
import { decodeCodeToDesign, encodePlan, PlanShareError, ShareTooLargeError } from './planShare'

export class DesignShareError extends Error {}
export class DesignShareTooLargeError extends DesignShareError {}

/** Hard budget for the encoded code (chars ≈ bytes in the URL). ~16 KB keeps
 *  the full URL well inside what browsers/chat apps handle reliably. */
export const DESIGN_CODE_BUDGET = 16 * 1024

/** Cap on the decompressed payload for a design link. A legitimate ≤16 KB
 *  code inflates to a few hundred KB of JSON at most; deflate's theoretical
 *  ~1032:1 ceiling can't exceed ~17 MB, and this stops a crafted bomb far
 *  earlier (same bounded-inflate mechanism as plan links, tighter cap). */
const MAX_DESIGN_DECOMPRESSED_BYTES = 4 * 1024 * 1024

/** Hash-route that carries a shared design: `#/design/<code>` (also tolerates
 *  `#design/<code>`). Distinct from `#/plans/<code>` so each route keeps its
 *  own guards + toasts. */
const DESIGN_ROUTE_RE = /#\/?design\/([A-Za-z0-9_-]+)/

/** Extract a design code from a URL hash, or null if it isn't a design route. */
export function parseDesignRoute(hash: string | null | undefined): string | null {
  if (!hash) return null
  const m = DESIGN_ROUTE_RE.exec(hash)
  return m ? m[1] : null
}

/** The hash fragment for a code (`#/design/<code>`). */
export function designShareHash(code: string): string {
  return `#/design/${code}`
}

/** A full shareable URL for a code (origin + app base + design hash). */
export function buildDesignShareUrl(code: string): string {
  const origin = globalThis.location?.origin ?? ''
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/'
  return `${origin}${base}${designShareHash(code)}`
}

/**
 * The link payload: the regular save payload minus session noise and minus
 * user-uploaded/IKEA defs (their GLB/texture blobs are IndexedDB-only — a URL
 * cannot carry them, so the defs are stripped here and any items referencing
 * them are dropped, with a count, when the link is opened).
 */
export function buildDesignSharePayload(state: RootState): SerializedState {
  return {
    ...serialize(state),
    location: null,
    locationPromptDismissed: false,
    cameraMode: 'orbit',
    userFurniture: [],
    userMaterials: [],
  }
}

/** Encode the current design into a `#/design/` code. Throws
 *  {@link DesignShareTooLargeError} past the {@link DESIGN_CODE_BUDGET}. */
export function encodeDesignShareCode(state: RootState): string {
  const code = encodePlan(buildDesignSharePayload(state))
  if (code.length > DESIGN_CODE_BUDGET) {
    const kb = (code.length / 1024).toFixed(1)
    const budgetKb = Math.round(DESIGN_CODE_BUDGET / 1024)
    throw new DesignShareTooLargeError(
      `This design is too large for a link (${kb} KB > ${budgetKb} KB). Use Export file (.sofa.json) and share that instead.`,
    )
  }
  return code
}

/** Decode + validate a `#/design/` code into a migrated {@link SerializedState}.
 *  Throws {@link DesignShareTooLargeError} / {@link DesignShareError} with a
 *  user-facing message. */
export function decodeDesignShareCode(code: string): SerializedState {
  try {
    return decodeCodeToDesign(code, {
      maxCodeLength: DESIGN_CODE_BUDGET,
      maxDecompressedBytes: MAX_DESIGN_DECOMPRESSED_BYTES,
    })
  } catch (e) {
    if (e instanceof ShareTooLargeError) {
      throw new DesignShareTooLargeError('That design link is too large to be genuine.')
    }
    if (e instanceof PlanShareError) {
      throw new DesignShareError(
        e.message.includes('version') ? e.message : 'That design link is invalid or corrupted.',
      )
    }
    throw e
  }
}

/**
 * Build the store patch for a decoded shared design, counting the items that
 * had to be dropped because their defId is unknown here (typically the
 * sender's user uploads / IKEA imports, which can't travel in a URL).
 */
export function applySharedDesign(
  design: SerializedState,
  knownDefIds: Set<string>,
): { patch: Partial<RootState>; droppedCount: number } {
  const droppedCount = design.items.filter((it) => !knownDefIds.has(it.defId)).length
  return { patch: applySerialized(design, knownDefIds), droppedCount }
}
