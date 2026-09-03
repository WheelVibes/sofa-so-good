import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { type Texture, TextureLoader } from 'three'
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
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
  // RE-RUN ON PLAN CHANGE. The maps are per-plan (each carries the digest of the plan it was
  // baked from), and the scene is rebuilt when the plan changes — so a mount-only effect leaves
  // the PREVIOUS plan's visibility attached. Measured: switching the 4-Room default to the
  // 5-Room plan kept context `2c1aca20` applied and took that plan's spatial match from 1.53x to
  // 2.25x, i.e. the feature actively degraded every plan except the one loaded first.
  //
  // Re-running costs the ~19 shader compiles again, but a plan change already rebuilds the whole
  // scene behind a loader, so this is the one moment where that cost is already being paid.
  const floorPlan = useStore((s) => s.floorPlan)

  // `floorPlan` below is a deliberate RE-RUN TRIGGER, not a value this body reads. The maps are
  // per-plan and the scene is rebuilt on a plan change, so without it the previous plan's
  // visibility stays attached — measured as the 5-Room plan rendering with the 4-Room context
  // (`v0.31.7.44`). A linter cannot see a dependency whose only purpose is invalidation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: floorPlan is an invalidation key
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const base = `${import.meta.env.BASE_URL}assets/lightmaps`
    const run = async () => {
      let raw: unknown
      try {
        // `no-cache` because `public/` assets are NOT content-hashed by Vite: a returning
        // browser can hold a stale `index.json` indefinitely, and a stale index is not a
        // cosmetic problem — it silently pins the previous asset set, so per-plan means and
        // newly baked plans never arrive. Measured: four substantive code changes in a row
        // produced byte-identical renders because the page kept serving an older index
        // (`v0.31.7.45`). The maps themselves are immutable (their names contain a content
        // digest), so only the index needs this.
        const res = await fetch(`${base}/index.json`, { cache: 'no-cache' })
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
            ` (plan ${result.context ?? 'unrecognised'}` +
            `${result.detached ? `, ${result.detached} detached` : ''})`,
        )
      }
      invalidate()
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [enabled, scene, invalidate, floorPlan])

  return null
}
