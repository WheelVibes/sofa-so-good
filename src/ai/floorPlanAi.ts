/**
 * Experimental AI floor-plan recognition (Workstream E). Sends a floor-plan
 * image (the editor's reference backdrop) to a bring-your-own-key vision model
 * and turns the returned wall segments into an editable draft plan — a starting
 * point the user then corrects. Falls back to manual photo-tracing (Workstream
 * F) when there's no key or the call fails.
 *
 * Uses an OpenAI-compatible chat-completions endpoint (configurable). The pure
 * request builder + the response parser are unit-tested; the live call needs a
 * real key and may hit CORS depending on the provider (surfaced as a clear
 * error). This is best-effort: vision wall extraction is approximate.
 */

const KEY = 'hdb_ai_vision_key'
const URL_KEY = 'hdb_ai_vision_url'
const MODEL_KEY = 'hdb_ai_vision_model'
const DEFAULT_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o-mini'

const ls = {
  get: (k: string, d = '') => {
    try {
      return localStorage.getItem(k) ?? d
    } catch {
      return d
    }
  },
  set: (k: string, v: string) => {
    try {
      if (v) localStorage.setItem(k, v)
      else localStorage.removeItem(k)
    } catch {}
  },
}

export const getVisionKey = () => ls.get(KEY)
export const setVisionKey = (v: string) => ls.set(KEY, v)
export const getVisionUrl = () => ls.get(URL_KEY, DEFAULT_URL) || DEFAULT_URL
export const getVisionModel = () => ls.get(MODEL_KEY, DEFAULT_MODEL) || DEFAULT_MODEL

/** Hosts we recognise as legitimate OpenAI-compatible vision providers. A
 *  request to anything else still works (BYO proxy) but is flagged so the UI can
 *  warn before the user's bearer key leaves for an unfamiliar origin. */
const TRUSTED_VISION_HOSTS = [
  'api.openai.com',
  'openrouter.ai',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api.mistral.ai',
  'api.together.xyz',
  'api.deepseek.com',
]

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

export interface VisionEndpointCheck {
  /** Safe to send the key to: HTTPS (or a localhost proxy over http). */
  secure: boolean
  /** A recognised provider (or localhost) — no warning needed. */
  trusted: boolean
  /** Parsed host (empty if the URL is unparseable). */
  host: string
  /** Human-readable reason when not secure/trusted. */
  reason?: string
}

/**
 * Classify a vision endpoint before the API key is POSTed to it. A bearer token
 * must never travel over plaintext HTTP to a remote host, and the user should be
 * warned when it's bound for an origin that isn't a known provider. Pure +
 * unit-tested.
 */
export function classifyVisionEndpoint(url: string): VisionEndpointCheck {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { secure: false, trusted: false, host: '', reason: 'The endpoint URL is invalid.' }
  }
  const host = parsed.hostname
  const local = isLocalHost(host)
  const https = parsed.protocol === 'https:'
  const secure = https || (local && parsed.protocol === 'http:')
  const trusted = local || TRUSTED_VISION_HOSTS.includes(host)
  if (!secure) {
    return {
      secure: false,
      trusted,
      host,
      reason: `Refusing to send your API key over an insecure connection to ${host}. Use an https:// endpoint.`,
    }
  }
  if (!trusted) {
    return {
      secure: true,
      trusted: false,
      host,
      reason: `${host} is not a recognised vision provider — your API key will be sent there.`,
    }
  }
  return { secure: true, trusted: true, host }
}

export interface AiWall {
  x1: number
  z1: number
  x2: number
  z2: number
  external?: boolean
}

/** A door/window the model spotted, described by its APPROXIMATE centre point
 *  (metres, same image frame as the walls) + width. Placement onto a real wall
 *  (nearest-wall snap → offset) is done separately by `floorPlanAiPlacement.ts`
 *  so this stays a plain, model-shaped description. */
export interface AiOpening {
  kind: 'door' | 'window'
  /** Approx centre of the opening in metres (image frame; origin top-left). */
  x: number
  z: number
  /** Opening width in metres. */
  width: number
}

/** Full recognition result: walls (backward-compatible), any openings the model
 *  proposed, and an optional scale estimate (metres per image pixel). Openings
 *  and scale are best-effort — either may be empty/absent and the caller falls
 *  back to walls-only exactly as before. */
export interface AiPlanResult {
  walls: AiWall[]
  openings: AiOpening[]
  /** Estimated metres per image pixel, if the model could calibrate the plan
   *  (from a dimension label or a known-width heuristic). Absent when unknown. */
  mPerPx?: number
}

/** Default opening widths (m) used when the model omits / mangles a width —
 *  matches the door/window tool defaults in `FloorPlanEditor`. */
const OPENING_WIDTH_DEFAULT: Record<AiOpening['kind'], number> = { door: 0.9, window: 1.2 }
/** Sanity cap on a reported opening width (m) — a wider value is treated as a
 *  mis-read and clamped (a single opening spanning >6 m is not real). */
const MAX_OPENING_WIDTH = 6

export class AiPlanError extends Error {}

const SYSTEM = `You convert a floor-plan image into structured JSON in METRES.
Origin is the image's top-left; x increases right, z increases down.
Estimate real dimensions (a typical room side is 2.5-5 m; an interior door ~0.9 m wide).
Respond with ONLY JSON of this shape (omit any part you cannot determine):
{"walls":[{"x1":,"z1":,"x2":,"z2":,"external":true|false}],
 "openings":[{"kind":"door"|"window","x":,"z":,"width":}],
 "scale":{"metresPerPixel":}}
- walls: mark the outer perimeter external:true, interior partitions external:false.
- openings: x,z are the door/window CENTRE point in metres, on the wall it cuts; width in metres.
- scale: metres per image pixel — estimate from a printed dimension label if visible,
  else from a door width (~0.9 m). You may instead give {"pixels":,"metres":} for a
  reference span you measured. Omit "scale" entirely if you cannot estimate it.`

/** Build an OpenAI-compatible chat request for plan recognition. Pure. */
export function buildVisionRequest(imageDataUrl: string, model = getVisionModel()) {
  return {
    model,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract the walls, doors/windows, and scale from this floor plan.',
          },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
  }
}

/** Grab the first {...} block from a reply (tolerant of code fences / prose) and
 *  JSON-parse it. Returns null if there's nothing usable. Pure. */
function parseJsonBlock(text: string): Record<string, unknown> | null {
  if (!text) return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(text.slice(start, end + 1))
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Extract wall segments from an already-parsed `walls` value. Drops degenerate
 *  + malformed segments. Pure. */
function wallsFromRaw(raw: unknown): AiWall[] {
  if (!Array.isArray(raw)) return []
  const walls: AiWall[] = []
  for (const w of raw) {
    const x1 = Number((w as AiWall)?.x1)
    const z1 = Number((w as AiWall)?.z1)
    const x2 = Number((w as AiWall)?.x2)
    const z2 = Number((w as AiWall)?.z2)
    if (![x1, z1, x2, z2].every(Number.isFinite)) continue
    if (Math.hypot(x2 - x1, z2 - z1) < 0.1) continue // skip degenerate
    walls.push({ x1, z1, x2, z2, external: Boolean((w as AiWall)?.external) })
  }
  return walls
}

/** Extract openings from an already-parsed `openings` value. Drops entries with
 *  an unknown kind or a non-finite centre; a missing/invalid width falls back to
 *  the kind default (never dropped just for a bad width). Pure. */
function openingsFromRaw(raw: unknown): AiOpening[] {
  if (!Array.isArray(raw)) return []
  const out: AiOpening[] = []
  for (const o of raw) {
    const rec = o as Record<string, unknown>
    const kind = rec?.kind
    if (kind !== 'door' && kind !== 'window') continue
    const x = Number(rec?.x)
    const z = Number(rec?.z)
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue
    const w = Number(rec?.width)
    const width =
      Number.isFinite(w) && w > 0 ? Math.min(w, MAX_OPENING_WIDTH) : OPENING_WIDTH_DEFAULT[kind]
    out.push({ kind, x, z, width })
  }
  return out
}

/** Extract a metres-per-pixel scale from an already-parsed `scale` value —
 *  either a direct `metresPerPixel`/`mPerPx`, or a reference span
 *  (`pixels`+`metres`). Returns undefined when unusable. Pure. */
function scaleFromRaw(raw: unknown): number | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const rec = raw as Record<string, unknown>
  const direct = Number(rec.metresPerPixel ?? rec.mPerPx)
  if (Number.isFinite(direct) && direct > 0) return direct
  const px = Number(rec.pixels ?? rec.referencePixels)
  const m = Number(rec.metres ?? rec.meters ?? rec.referenceMetres)
  if (Number.isFinite(px) && px > 0 && Number.isFinite(m) && m > 0) return m / px
  return undefined
}

/** Parse wall segments out of the model's reply (tolerant of code fences and
 *  prose around the JSON). Returns [] if nothing usable. Pure. Kept for the
 *  walls-only callers/tests; new code uses `parseVisionResponse`. */
export function parseWallsResponse(text: string): AiWall[] {
  const obj = parseJsonBlock(text)
  return obj ? wallsFromRaw(obj.walls) : []
}

/** Parse the full recognition payload (walls + openings + optional scale) out of
 *  the model's reply. Defensive: any missing/malformed part degrades to
 *  empty/absent, never throws. Pure. */
export function parseVisionResponse(text: string): AiPlanResult {
  const obj = parseJsonBlock(text)
  if (!obj) return { walls: [], openings: [] }
  const mPerPx = scaleFromRaw(obj.scale)
  return {
    walls: wallsFromRaw(obj.walls),
    openings: openingsFromRaw(obj.openings),
    ...(mPerPx !== undefined ? { mPerPx } : {}),
  }
}

/** Extract the assistant text from an OpenAI-compatible response. Pure. */
export function extractContent(json: unknown): string {
  const c = (json as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]
    ?.message?.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : (p?.text ?? ''))).join('')
  return ''
}

export async function recognizeFloorPlan(
  imageDataUrl: string,
  { key = getVisionKey(), url = getVisionUrl(), model = getVisionModel() } = {},
): Promise<AiPlanResult> {
  if (!key) throw new AiPlanError('Add a vision-model API key first.')
  // Never POST the bearer key over an insecure transport (plaintext to a remote
  // host) — that would leak it on the wire. Untrusted-but-HTTPS hosts are allowed
  // here; the UI warns + confirms before reaching this point.
  const check = classifyVisionEndpoint(url)
  if (!check.secure) throw new AiPlanError(check.reason ?? 'Insecure vision endpoint.')
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(buildVisionRequest(imageDataUrl, model)),
    })
  } catch {
    throw new AiPlanError(
      'Could not reach the vision provider (often CORS). A local proxy may be needed.',
    )
  }
  if (res.status === 401) throw new AiPlanError('Invalid API key.')
  if (!res.ok) throw new AiPlanError(`Provider error (${res.status}).`)
  const result = parseVisionResponse(extractContent(await res.json()))
  // Walls are the backbone: without them there's nothing to draft (and openings
  // have no host wall), so fall back to manual tracing — openings/scale ride
  // along only when walls came back.
  if (result.walls.length === 0)
    throw new AiPlanError('No walls recognised — trace manually instead.')
  return result
}
