import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { type Texture, TextureLoader } from 'three'
import { useFeature } from '../features/useFeature'
import { applyLightmapsFromIndex } from './applyVisibilityLightmaps'
import { parseLightmapIndex } from './lightmapIndex'

/**
 * Mount point for item (w)'s baked aperture-visibility maps. Renders nothing.
 *
 * Attaches the maps **once, on mount**, which is deliberate: adding an `aoMap` compiles a new
 * shader variant per material — ~19 across a plan — and doing it mid-session cost a measured
 * **216 ms** frame (`v0.31.7.15`). Mounting inside the scene means that happens while the app's
 * loader is still up, where a compile pause is invisible. Steady-state cost is nil: 60 fps
 * unchanged at `performance` and `medium` with 331 distinct maps attached.
 *
 * **A consequence of that, stated because it looks like a bug otherwise:** toggling the feature
 * flag at runtime will hitch, because the effect re-runs and recompiles. It is a dev/admin
 * override, so that is acceptable — but it is not a defect to chase.
 *
 * Every failure is silent-and-degrading rather than thrown. No index (most deployments, until
 * more plans are baked), a stale index, an unbaked plan — each leaves exactly today's render.
 * The one thing that is *not* silent is a zero hit rate on a plan that should have been covered;
 * see `lightmapIndex.describeHitRate`, because a map that never loads and a correctly-working
 * subtle lighting term are indistinguishable in a screenshot.
 */
export function VisibilityLightmaps() {
  const enabled = useFeature('visibilityLightmap')
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const base = `${import.meta.env.BASE_URL}assets/lightmaps`
    const run = async () => {
      let raw: unknown
      try {
        const res = await fetch(`${base}/index.json`)
        if (!res.ok) return
        raw = await res.json()
      } catch {
        // Offline, 404, or a build without the assets: today's render is the correct fallback.
        return
      }
      if (cancelled) return
      const parsed = parseLightmapIndex(raw)
      if ('error' in parsed) {
        if (import.meta.env.DEV) console.warn(`lightmaps: ${parsed.error}`)
        return
      }
      const loader = new TextureLoader()
      // One Texture per URL: a map is shared by every material whose mesh keys to it, and
      // uploading the same 256 px image twice is pure waste.
      const cache = new Map<string, Texture>()
      const load = (url: string) => {
        const hit = cache.get(url)
        if (hit) return hit
        // `invalidate` on decode because the canvas is `frameloop="demand"` -- without it the
        // maps land in materials that nothing ever redraws, and the feature looks inert.
        const tex = loader.load(url, () => invalidate())
        cache.set(url, tex)
        return tex
      }
      // DEV-only gain override, `?aoGain=<n>`. Exists as a BISECT TOOL: `v0.31.7.32`/`.33`
      // found the mounted path delivering ~40 % of the effect the probe measured with the same
      // maps, the same gain and verifiably identical material state, and the remaining question
      // is whether the patched shader responds to the gain at all. Driving it to an extreme
      // answers that in one run. It doubles as the knob the eventual look call will want.
      const params = new URLSearchParams(window.location.search)
      const gainOverride = import.meta.env.DEV ? Number(params.get('aoGain')) : Number.NaN
      const result = applyLightmapsFromIndex(scene, parsed.index, load, {
        gain: Number.isFinite(gainOverride) && gainOverride > 0 ? gainOverride : undefined,
        // `?aoDebug=1` paints the sampled map instead of shading. Unusable by design.
        debug: import.meta.env.DEV && params.get('aoDebug') === '1',
      })
      if (import.meta.env.DEV || result.suspect) {
        const log = result.suspect ? console.warn : console.info
        log(
          `${result.report} — applied to ${result.applied}/${result.candidates} candidates` +
            ` (plan ${result.context ?? 'unrecognised'})`,
        )
      }
      invalidate()
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [enabled, scene, invalidate])

  return null
}
