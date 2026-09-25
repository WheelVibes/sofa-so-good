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
import {
  decodePlan,
  designFromRaw,
  encodePlan,
  PlanShareError,
  ShareItemLimitError,
  ShareTooLargeError,
} from './planShare'

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

/**
 * Hash-route that carries a **showroom** (view-only) design: `#/showroom/<code>`.
 *
 * Why a second route rather than reusing `#/design/` with only the in-payload
 * `viewOnly` flag: a build shipped *before* this feature knows nothing about the
 * flag, and zod strips unknown keys — so an old build handed a `#/design/` code
 * carrying `viewOnly: true` would open it as a fully editable copy, silently
 * doing the opposite of what the sender chose. An old build handed
 * `#/showroom/<code>` matches neither of its routes and simply doesn't load the
 * design, which is a visible nothing-happened rather than an invisible
 * capability escalation. See `docs/developer/showroom-links.md`.
 */
const SHOWROOM_ROUTE_RE = /#\/?showroom\/([A-Za-z0-9_-]+)/

/** Extract a design code from a URL hash, or null if it isn't a design route.
 *  Matches both the editable (`#/design/`) and showroom (`#/showroom/`) routes —
 *  which one it was is reported by {@link parseDesignRouteMode}. */
export function parseDesignRoute(hash: string | null | undefined): string | null {
  if (!hash) return null
  const m = DESIGN_ROUTE_RE.exec(hash) ?? SHOWROOM_ROUTE_RE.exec(hash)
  return m ? m[1] : null
}

/** True when the hash is the showroom route (`#/showroom/<code>`). The route
 *  alone is enough to enter view-only mode even if the payload's flag is
 *  missing (a hand-built or truncated link), so the two signals are ORed. */
export function isShowroomRoute(hash: string | null | undefined): boolean {
  return !!hash && SHOWROOM_ROUTE_RE.test(hash)
}

/** The hash fragment for a code: `#/design/<code>`, or `#/showroom/<code>` when
 *  `viewOnly`. */
export function designShareHash(code: string, viewOnly = false): string {
  return viewOnly ? `#/showroom/${code}` : `#/design/${code}`
}

/** A full shareable URL for a code (origin + app base + design hash). */
export function buildDesignShareUrl(code: string, viewOnly = false): string {
  const origin = globalThis.location?.origin ?? ''
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/'
  return `${origin}${base}${designShareHash(code, viewOnly)}`
}

/**
 * The share **envelope**: the serialized design plus the link's capability
 * flags. `viewOnly` is an *envelope* key, deliberately outside
 * `SerializedStateZ` — a capability is a property of the link, not of the
 * design, and keeping it out of the schema means it can never leak into a save
 * slot, the autosave or a `.sofa.json` export (zod strips unknown keys, so the
 * decoded design is byte-for-byte what it always was).
 *
 * The key is **omitted** when false, so an editable link's bytes are identical
 * to the ones this app has always produced — every existing link keeps working
 * and no existing link can be mistaken for a showroom link.
 */
export type DesignSharePayload = SerializedState & { viewOnly?: true }

/**
 * The link payload: the regular save payload minus session noise and minus
 * user-uploaded/IKEA defs (their GLB/texture blobs are IndexedDB-only — a URL
 * cannot carry them, so the defs are stripped here and any items referencing
 * them are dropped, with a count, when the link is opened).
 */
export function buildDesignSharePayload(state: RootState, viewOnly = false): DesignSharePayload {
  return {
    ...serialize(state),
    location: null,
    locationPromptDismissed: false,
    cameraMode: 'orbit',
    userFurniture: [],
    userMaterials: [],
    ...(viewOnly ? { viewOnly: true as const } : {}),
  }
}

/** Encode the current design into a `#/design/` (or `#/showroom/`) code. Throws
 *  {@link DesignShareTooLargeError} past the {@link DESIGN_CODE_BUDGET}. */
export function encodeDesignShareCode(state: RootState, viewOnly = false): string {
  const code = encodePlan(buildDesignSharePayload(state, viewOnly))
  if (code.length > DESIGN_CODE_BUDGET) {
    const kb = (code.length / 1024).toFixed(1)
    const budgetKb = Math.round(DESIGN_CODE_BUDGET / 1024)
    throw new DesignShareTooLargeError(
      `This design is too large for a link (${kb} KB > ${budgetKb} KB). Use Export file (.sofa.json) and share that instead.`,
    )
  }
  return code
}

/** A decoded share link: the validated design plus the link's capabilities. */
export interface DecodedDesignShare {
  design: SerializedState
  /** True when the sender chose a showroom (view-only) link. Honest framing:
   *  this is a **UX capability**, not a security boundary — the whole design
   *  travels in the URL fragment with no server in the loop, so anyone who
   *  wants the editable copy can have it (and the UI offers it outright). It
   *  expresses intent and sets the default experience. */
  viewOnly: boolean
}

/** Read the envelope's `viewOnly` capability off a raw decoded payload. Only
 *  the literal `true` counts — a legacy payload has no key, and a hand-edited
 *  truthy value (`1`, `"yes"`) is not the contract. */
function readViewOnly(raw: unknown): boolean {
  return (
    typeof raw === 'object' && raw !== null && (raw as Record<string, unknown>).viewOnly === true
  )
}

/** Decode + validate a `#/design/` or `#/showroom/` code into a migrated
 *  {@link SerializedState} plus its capability flags. Throws
 *  {@link DesignShareTooLargeError} / {@link DesignShareError} with a
 *  user-facing message. */
export function decodeDesignShareCode(code: string): DecodedDesignShare {
  try {
    const raw = decodePlan(code, {
      maxCodeLength: DESIGN_CODE_BUDGET,
      maxDecompressedBytes: MAX_DESIGN_DECOMPRESSED_BYTES,
    })
    return { design: designFromRaw(raw), viewOnly: readViewOnly(raw) }
  } catch (e) {
    if (e instanceof ShareTooLargeError) {
      throw new DesignShareTooLargeError('That design link is too large to be genuine.')
    }
    // S2: the item-count ceiling carries its own user-facing reason.
    if (e instanceof ShareItemLimitError) throw new DesignShareError(e.message)
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
