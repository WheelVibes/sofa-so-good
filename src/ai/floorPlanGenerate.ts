/**
 * Text → floor-plan GENERATION (marquee L). A natural-language brief ("a 4-room
 * HDB, master with ensuite, open kitchen facing the living room, ~90 sqm") is
 * turned by a bring-your-own-key LLM into wall/opening/room JSON that lands in
 * the 2D plan schema as a NEW editable draft.
 *
 * This is the text-only sibling of `floorPlanAi.ts`'s vision recognition: it
 * reuses the SAME BYO key/endpoint (`hdb_ai_vision_*`), the SAME
 * `classifyVisionEndpoint` security gate, and the SAME
 * `AiPlanResult`-shaped parse/apply machinery (`parseGeneratedPlan` +
 * `usePlanAiWalls.applyAiPlanDraft`). Only the PROMPT and the request payload
 * differ (no image). The pure request builder + the parser are unit-tested; the
 * live call needs a real key and may hit CORS (surfaced as a clear error).
 */
import {
  AiPlanError,
  type AiPlanResult,
  classifyVisionEndpoint,
  extractContent,
  getVisionKey,
  getVisionModel,
  getVisionUrl,
  parseGeneratedPlan,
} from './floorPlanAi'

const GENERATE_SYSTEM = `You are an architect for Singapore homes (HDB flats and condominiums).
Turn the user's brief into a floor plan as STRUCTURED JSON in METRES.
Coordinate frame: origin top-left, x increases right, z increases down. All numbers are metres.

Design rules — follow ALL of them:
- Model each room as a closed, RECTILINEAR (axis-aligned) loop of walls. Rooms tile together
  with NO gaps and NO overlaps.
- SHARE the wall between two adjacent rooms — emit that partition ONCE, never a duplicate pair
  of walls on top of each other.
- Mark the outer perimeter walls external:true; interior partitions external:false.
- Realistic HDB/condo dimensions: a habitable room side is about 2.5-5 m; the whole flat's
  footprint should match the brief's total area (±10%). Honour the brief's room count, ensuites,
  and open/combined spaces (an "open kitchen facing the living room" shares an opening or omits
  the partition between them).
- openings: put a DOOR (width ~0.9 m) on the shared wall between every pair of connected rooms,
  and an entry door on the perimeter. Put at least one WINDOW (width ~1.2 m) on an external wall
  of every habitable room (bedrooms, living, study). x,z are the opening's CENTRE point in metres,
  lying ON the wall it cuts.
- rooms: one entry per room with a human name ("Living", "Master Bedroom", "Kitchen", "Bathroom",
  "Bedroom 2", …) and its axis-aligned rectangle: x,z = the room's TOP-LEFT interior corner,
  width = size along x, depth = size along z.

Respond with ONLY JSON of this shape (no prose, no code fence):
{"walls":[{"x1":,"z1":,"x2":,"z2":,"external":true|false}],
 "openings":[{"kind":"door"|"window","x":,"z":,"width":}],
 "rooms":[{"name":"","x":,"z":,"width":,"depth":}]}`

/** Build an OpenAI-compatible chat request for text→plan generation. Pure — no
 *  network, no key (the caller attaches the bearer). */
export function buildGeneratePlanRequest(brief: string, model = getVisionModel()) {
  return {
    model,
    max_tokens: 3000,
    messages: [
      { role: 'system', content: GENERATE_SYSTEM },
      {
        role: 'user',
        content: `Design a floor plan for this brief:\n\n${brief}`,
      },
    ],
  }
}

/**
 * Generate a plan from a natural-language brief via a BYO-key OpenAI-compatible
 * chat endpoint. Returns an `AiPlanResult` (walls + openings + named rooms) the
 * apply path (`applyAiPlanDraft`) drops in as a fresh draft. Throws `AiPlanError`
 * with a user-facing message on a missing key, an insecure endpoint, a network
 * failure (often CORS), a provider error, or an unusable (wall-less) reply.
 */
export async function generateFloorPlan(
  brief: string,
  { key = getVisionKey(), url = getVisionUrl(), model = getVisionModel() } = {},
): Promise<AiPlanResult> {
  const trimmed = brief.trim()
  if (!trimmed) throw new AiPlanError('Describe the home you want first.')
  if (!key) throw new AiPlanError('Add an LLM API key first.')
  // Never POST the bearer key over an insecure transport — mirrors the vision path.
  const check = classifyVisionEndpoint(url)
  if (!check.secure) throw new AiPlanError(check.reason ?? 'Insecure AI endpoint.')
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(buildGeneratePlanRequest(trimmed, model)),
    })
  } catch {
    throw new AiPlanError('Could not reach the AI provider (often CORS). A local proxy may help.')
  }
  if (res.status === 401) throw new AiPlanError('Invalid API key.')
  if (!res.ok) throw new AiPlanError(`Provider error (${res.status}).`)
  const result = parseGeneratedPlan(extractContent(await res.json()))
  // Walls are the backbone — without them there's no editable shell to draft.
  if (result.walls.length === 0)
    throw new AiPlanError('The model returned no usable walls — try rephrasing the brief.')
  return result
}
