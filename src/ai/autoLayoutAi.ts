/**
 * AI auto-furnish (PARITY-AILAYOUT). Given the rooms + an allowed catalog and a
 * free-text brief, asks an OpenAI-compatible chat model to propose furniture
 * placements, then validates them. Reuses the same BYO-key endpoint config as
 * the floor-plan vision feature (`floorPlanAi`) — no key is ever bundled; the
 * live call degrades gracefully without one.
 *
 * The prompt builder + response parser are PURE (unit-tested); only
 * `requestAutoLayout` touches the network.
 */

import {
  AiPlanError,
  classifyVisionEndpoint,
  extractContent,
  getVisionKey,
  getVisionModel,
  getVisionUrl,
} from './floorPlanAi'

/** A model-proposed furniture placement (world metres, radians). */
export interface AiPlacement {
  defId: string
  /** Target room name (must match a plan room). */
  room: string
  x: number
  z: number
  rotation: number
}

/** Room summary handed to the model (name + interior size in metres). */
export interface AiRoomBrief {
  name: string
  w: number
  d: number
}

const SYSTEM = `You are an interior layout assistant for a Singapore HDB flat.
Given a list of rooms (with size in metres) and a catalog of allowed furniture ids,
place suitable furniture to satisfy the user's brief. Use ONLY the given ids and
room names. Keep pieces inside their room and avoid obvious overlaps.
Respond with ONLY JSON: {"items":[{"defId":"","room":"","x":0,"z":0,"rotation":0}]}
where x,z are metres from the flat origin and rotation is radians (0 faces +Z).`

/** Build the OpenAI-compatible chat request body. Pure. */
export function buildLayoutRequest(
  rooms: AiRoomBrief[],
  defIds: string[],
  brief: string,
  model = getVisionModel(),
) {
  const roomList = rooms.map((r) => `${r.name} (${r.w.toFixed(1)}×${r.d.toFixed(1)} m)`).join('; ')
  const user = `Rooms: ${roomList}.
Allowed furniture ids: ${defIds.join(', ')}.
Brief: ${brief || 'Furnish the home sensibly for everyday living.'}`
  return {
    model,
    max_tokens: 1800,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
  }
}

/**
 * Parse placements out of the model's reply (tolerant of code fences / prose).
 * Drops any item whose `defId` isn't allowed, whose `room` isn't a real room, or
 * whose coordinates aren't finite. Returns `[]` if nothing usable. Pure.
 */
export function parseLayoutResponse(
  text: string,
  opts: { validDefIds: ReadonlySet<string>; validRooms: ReadonlySet<string> },
): AiPlacement[] {
  if (!text) return []
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  let obj: unknown
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  const raw = (obj as { items?: unknown })?.items
  if (!Array.isArray(raw)) return []
  const out: AiPlacement[] = []
  for (const it of raw) {
    const p = it as Partial<AiPlacement>
    if (typeof p?.defId !== 'string' || !opts.validDefIds.has(p.defId)) continue
    if (typeof p?.room !== 'string' || !opts.validRooms.has(p.room)) continue
    const x = Number(p.x)
    const z = Number(p.z)
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue
    const rotation = Number(p.rotation)
    out.push({
      defId: p.defId,
      room: p.room,
      x,
      z,
      rotation: Number.isFinite(rotation) ? rotation : 0,
    })
  }
  return out
}

/**
 * Live BYO-key call: ask the model to furnish the rooms, returning validated
 * placements. Mirrors `recognizeFloorPlan`'s key/endpoint guards + error mapping.
 */
export async function requestAutoLayout(
  rooms: AiRoomBrief[],
  defIds: string[],
  brief: string,
  opts: {
    validRooms: ReadonlySet<string>
    key?: string
    url?: string
    model?: string
  },
): Promise<AiPlacement[]> {
  const key = opts.key ?? getVisionKey()
  const url = opts.url ?? getVisionUrl()
  const model = opts.model ?? getVisionModel()
  if (!key) throw new AiPlanError('Add a model API key first.')
  const check = classifyVisionEndpoint(url)
  if (!check.secure) throw new AiPlanError(check.reason ?? 'Insecure endpoint.')
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(buildLayoutRequest(rooms, defIds, brief, model)),
    })
  } catch {
    throw new AiPlanError('Could not reach the AI provider (often CORS). A local proxy may help.')
  }
  if (res.status === 401) throw new AiPlanError('Invalid API key.')
  if (!res.ok) throw new AiPlanError(`Provider error (${res.status}).`)
  const placements = parseLayoutResponse(extractContent(await res.json()), {
    validDefIds: new Set(defIds),
    validRooms: opts.validRooms,
  })
  if (placements.length === 0)
    throw new AiPlanError('No usable layout returned — try a clearer brief.')
  return placements
}
