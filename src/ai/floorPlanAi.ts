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

export interface AiWall {
  x1: number
  z1: number
  x2: number
  z2: number
  external?: boolean
}

export class AiPlanError extends Error {}

const SYSTEM = `You convert a floor-plan image into wall segments in METRES.
Origin is the image's top-left; x increases right, z increases down.
Estimate real dimensions (a typical room side is 2.5-5 m).
Respond with ONLY JSON: {"walls":[{"x1":,"z1":,"x2":,"z2":,"external":true|false}]}.
Mark the outer perimeter walls external:true, interior partitions external:false.`

/** Build an OpenAI-compatible chat request for wall extraction. Pure. */
export function buildVisionRequest(imageDataUrl: string, model = getVisionModel()) {
  return {
    model,
    max_tokens: 1500,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the walls from this floor plan.' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
  }
}

/** Parse wall segments out of the model's reply (tolerant of code fences and
 *  prose around the JSON). Returns [] if nothing usable. Pure. */
export function parseWallsResponse(text: string): AiWall[] {
  if (!text) return []
  // Grab the first {...} block (handles ```json fences / surrounding prose).
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  let obj: unknown
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  const raw = (obj as { walls?: unknown })?.walls
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
): Promise<AiWall[]> {
  if (!key) throw new AiPlanError('Add a vision-model API key first.')
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
  const walls = parseWallsResponse(extractContent(await res.json()))
  if (walls.length === 0) throw new AiPlanError('No walls recognised — trace manually instead.')
  return walls
}
