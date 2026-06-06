/**
 * Bring-your-own-key AI client for the two experimental AI features:
 *  - photoreal export (image-to-image over the current render) — Workstream D
 *  - floor-plan recognition (a vision model → wall segments)    — Workstream E
 *
 * The API key is pasted by the user and kept in localStorage — never bundled,
 * never sent anywhere but the configured provider. Everything fails soft: with
 * no key (or any error) the caller keeps working without AI.
 *
 * Default provider is Replicate (well-documented predictions API). Because a
 * browser call to a third-party API can hit CORS depending on the provider, the
 * client surfaces a clear, actionable error rather than throwing opaquely; the
 * pure request/response helpers are unit-tested so the contract is pinned even
 * though the live round-trip needs a real key.
 */

const KEY_STORAGE = 'hdb_ai_key'
const MODEL_STORAGE = 'hdb_ai_img_model'

/** Default Replicate img2img model version (SDXL img2img). Overridable. */
export const DEFAULT_IMG_MODEL = '39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b'

export function getAiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}
export function setAiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {}
}
export function getImgModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE) || DEFAULT_IMG_MODEL
  } catch {
    return DEFAULT_IMG_MODEL
  }
}
export function setImgModel(v: string): void {
  try {
    if (v) localStorage.setItem(MODEL_STORAGE, v)
    else localStorage.removeItem(MODEL_STORAGE)
  } catch {}
}

export interface PhotorealOptions {
  /** PNG data URL of the current scene. */
  image: string
  /** Style prompt (room type + chosen style). */
  prompt: string
  /** How strongly to restyle (0..1); lower keeps more structure. */
  strength?: number
}

/** Build the Replicate `predictions` request body for img2img. Pure. */
export function buildReplicateImg2ImgBody(opts: PhotorealOptions, model: string) {
  return {
    version: model,
    input: {
      image: opts.image,
      prompt: opts.prompt,
      // Keep room geometry: modest denoise + a structure-preserving negative.
      prompt_strength: typeof opts.strength === 'number' ? opts.strength : 0.45,
      negative_prompt:
        'deformed walls, distorted perspective, extra rooms, text, watermark, blurry',
      num_outputs: 1,
    },
  }
}

/** Extract the first output image URL from a finished Replicate prediction. Pure. */
export function parseReplicateOutput(prediction: unknown): string | null {
  const p = prediction as { status?: string; output?: unknown; error?: unknown } | null
  if (p?.status !== 'succeeded') return null
  const out = p.output
  if (typeof out === 'string') return out
  if (Array.isArray(out) && typeof out[0] === 'string') return out[0]
  return null
}

export class AiError extends Error {}

const REPLICATE = 'https://api.replicate.com/v1/predictions'
const REPLICATE_ORIGIN = 'https://api.replicate.com'

/** Only trust a provider-supplied poll URL if it's on the expected host —
 *  otherwise a tampered response could exfiltrate the API key via the
 *  Authorization header we attach. Falls back to the canonical URL. */
export function safePollUrl(getUrl: string | undefined, id: string): string {
  if (getUrl) {
    try {
      if (new URL(getUrl).origin === REPLICATE_ORIGIN) return getUrl
    } catch {
      // malformed URL — fall through to the canonical one
    }
  }
  return `${REPLICATE}/${id}`
}

/**
 * Run img2img on the current render via Replicate, polling to completion.
 * Returns the output image URL. Throws AiError with a user-facing message.
 */
export async function generatePhotoreal(
  opts: PhotorealOptions,
  {
    key = getAiKey(),
    model = getImgModel(),
    signal,
  }: { key?: string; model?: string; signal?: AbortSignal } = {},
): Promise<string> {
  if (!key) throw new AiError('Add your Replicate API key first.')
  let res: Response
  try {
    res = await fetch(REPLICATE, {
      method: 'POST',
      headers: { authorization: `Token ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(buildReplicateImg2ImgBody(opts, model)),
      signal,
    })
  } catch {
    throw new AiError(
      'Could not reach the AI provider from the browser (often CORS). Try a provider that allows browser requests, or a local proxy.',
    )
  }
  if (res.status === 401) throw new AiError('Invalid API key.')
  if (!res.ok) throw new AiError(`Provider error (${res.status}).`)
  let pred = (await res.json()) as { id: string; status: string; urls?: { get: string } }
  const getUrl = pred.urls?.get
  // Poll until terminal (succeeded/failed/canceled).
  const deadline = Date.now() + 120_000
  while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
    if (Date.now() > deadline) throw new AiError('Timed out waiting for the AI result.')
    await new Promise((r) => setTimeout(r, 2000))
    if (signal?.aborted) throw new AiError('Cancelled.')
    const r = await fetch(safePollUrl(getUrl, pred.id), {
      headers: { authorization: `Token ${key}` },
      signal,
    })
    pred = await r.json()
  }
  const url = parseReplicateOutput(pred)
  if (!url) throw new AiError('The AI run finished without an image.')
  return url
}
