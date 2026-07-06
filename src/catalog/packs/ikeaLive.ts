import { importGroup } from '../../furniture/ikea/importGroup'
import { parseMetadata } from '../../furniture/ikea/metadata'

export interface IkeaProgressEvent {
  phase: string
  group?: string
  finish?: string
  glb?: string
  done?: number
  total?: number
  error?: string
}

/** Extract the JSON object from an SSE `data: …` line, or null for keep-alive
 *  comments / blank lines. */
export function parseSseData(line: string): IkeaProgressEvent | null {
  if (!line.startsWith('data:')) return null
  const json = line.slice('data:'.length).trim()
  if (!json) return null
  try {
    return JSON.parse(json) as IkeaProgressEvent
  } catch {
    return null
  }
}

/** Served URLs for a finished group folder. */
export function groupReadyUrls(group: string): { metadataUrl: string; baseUrl: string } {
  const baseUrl = `/assets/ikea/${group}`
  return { metadataUrl: `${baseUrl}/metadata.json`, baseUrl }
}

// Same-origin: the Vite '/ikea' dev proxy forwards to the local sidecar.
const SIDECAR = ''

export async function sidecarStatus(): Promise<{ running: boolean; runId?: string } | null> {
  try {
    const res = await fetch(`${SIDECAR}/ikea/status`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null // sidecar not running
  }
}

export async function startScrape(limit = 0): Promise<{ runId: string }> {
  const res = await fetch(`${SIDECAR}/ikea/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit }),
  })
  if (!res.ok) throw new Error(`scrape start failed: HTTP ${res.status}`)
  return res.json()
}

/** Fetch a finished group's metadata + finish GLBs over HTTP and register it
 *  as an IkeaGltfDef via the existing importer. Returns true on success. */
export async function registerGroup(group: string): Promise<boolean> {
  const { metadataUrl, baseUrl } = groupReadyUrls(group)
  const metaRes = await fetch(metadataUrl)
  if (!metaRes.ok) return false
  const parsed = parseMetadata(await metaRes.json())
  if (!parsed.ok) return false
  const meta = parsed.data

  const files: File[] = []
  for (const v of meta.variants) {
    if (v.glb) {
      const glbRes = await fetch(`${baseUrl}/${v.glb}`)
      if (glbRes.ok) {
        const blob = await glbRes.blob()
        files.push(new File([blob], v.glb, { type: 'model/gltf-binary' }))
      }
    }
    // Fetch the main product image so the served-asset path produces the same
    // self-contained File[] as the Upload dialog. Only the main image is consumed
    // (buildVariant downscales it into the card thumbnail); the context/lifestyle
    // image is never read and is often missing on disk, so fetching it just 404s.
    if (v.main_image) {
      const imgRes = await fetch(`${baseUrl}/${v.main_image}`)
      if (imgRes.ok) {
        const imgBlob = await imgRes.blob()
        files.push(new File([imgBlob], v.main_image, { type: imgBlob.type || 'image/jpeg' }))
      }
    }
  }
  if (files.length === 0) return false
  const result = await importGroup(meta, files)
  return result.ok
}

/** Open the SSE stream and drive callbacks. Returns a cancel function. */
export function streamProgress(
  onEvent: (ev: IkeaProgressEvent) => void,
  onGroupReady: (group: string) => void,
): () => void {
  const es = new EventSource(`${SIDECAR}/ikea/progress`)
  es.onmessage = (m) => {
    const ev = parseSseData(`data: ${m.data}`)
    if (!ev) return
    onEvent(ev)
    if (ev.phase === 'group_ready' && ev.group) onGroupReady(ev.group)
  }
  // The stream closes naturally at run_complete; the UI reacts to that event.
  es.onerror = () => {
    /* swallow: closure handled via run_complete */
  }
  return () => es.close()
}
