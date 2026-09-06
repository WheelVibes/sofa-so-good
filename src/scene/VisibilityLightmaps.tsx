import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { type Texture, TextureLoader } from 'three'
import { useFeature } from '../features/useFeature'
import { pointInBuilding, type WallSeg } from '../floorplan/footprint'
import { useStore } from '../state/store'
import { applyLightmapsFromIndex, detachAllVisibilityLightmaps } from './applyVisibilityLightmaps'
import { lampDensityLookup } from './lampBounce'
import { daylightFromAltitude } from './lighting/altitudeCurve'
import { useSunPosition } from './lighting/useSunPosition'
import { parseLightmapIndex } from './lightmapIndex'
import { setExteriorBoostLevel, setLampBounce } from './visibilityLightmap'

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
  const flagOn = useFeature('visibilityLightmap')
  // GLAZING-LIGHTMAP: window panes are excluded from the material patch by default (glass has
  // ~no diffuse irradiance to bake — see `applyVisibilityLightmaps.ts:isCandidate`). Read as a
  // live value and included in the attach effect's deps below so a QA/dev toggle re-applies —
  // the same accepted "toggling a flag at runtime hitches" trade `visibilityLightmap` itself
  // already makes (see the docblock above), never expected in normal play.
  const excludeGlazing = useFeature('glazingLightmapExclude')
  // EXTERIOR-FACE-LIGHTMAP: faces of a shell mesh that point OUT of the building fall back to the
  // analytic fill instead of sampling the interior bake (`scene/lightmapExterior.ts`). Same live
  // read + attach-effect dep as `excludeGlazing` above, and the same accepted toggle hitch.
  const exteriorFallback = useFeature('exteriorFaceLightmapFallback')
  // ORBIT-NIGHT-CAPS: the up-facing tops of the wall boxes are the orbit SECTION CUT, and the bake
  // never filled their atlas slot either — same live read + attach-effect dep, same accepted
  // toggle hitch.
  const orbitNightCaps = useFeature('orbitNightCaps')
  // EXTERIOR-FACE-DAYLIGHT: those exterior faces additionally take a daylight boost on top of the
  // analytic fill, because the fill is tuned for interior surfaces and an outside face sees the
  // whole sky. Same live read + attach-effect dep, same accepted toggle hitch.
  const exteriorDaylight = useFeature('exteriorFaceDaylight')
  // GATED TO `realistic`. The baked GI is the Blender-enhanced look, and the two-mode split puts
  // the fast editing path on `performance` — so this is where it belongs by design, not only by
  // cost. Cost is the secondary argument: ~1.4 ms p50 on `realistic` and nothing measurable on
  // `performance` (`v0.31.7.110`), so the gate is about intent, and it also keeps the load-time
  // texture work off the tier chosen for responsiveness.
  const tier = useStore((s) => s.qualityTier)
  const enabled = flagOn && tier === 'realistic'
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
  const lightsMode = useStore((s) => s.lightsMode)
  // Read once per attach, NOT subscribed: a re-attach recompiles ~19 programs (216 ms), so the
  // lamp census is taken with the maps and the switch alone moves the term live.
  const itemsAtAttach = useStore.getState().items

  // EXTERIOR-FACE-DAYLIGHT follows the SUN, the way the estate's own `EXTERIOR_DAY_BOOST` does
  // (`estate/Estate.tsx` scales it by `daylightFromAltitude(sunAlt)`), so the flat's shell and the
  // neighbour block brighten and darken together. `useSunPosition` re-renders only when the HOUR
  // changes and returns a cached stable object, so this is not a per-frame cost — and the level is
  // one uniform write per material, never a recompile.
  const sunAltitude = useSunPosition().altitude
  useEffect(() => {
    setExteriorBoostLevel(daylightFromAltitude(sunAltitude))
    invalidate()
  }, [sunAltitude, invalidate])

  // LAMP-BOUNCE follows the lights switch: the term is the lamps' interreflection, so it is
  // zero with the lamps off and full with them on (`visibilityLightmap.ts:setLampBounce`).
  useEffect(() => {
    setLampBounce(lightsMode === 'on' ? 1 : 0)
    invalidate()
  }, [lightsMode, invalidate])

  // `floorPlan` below is a deliberate RE-RUN TRIGGER, not a value this body reads. The maps are
  // per-plan and the scene is rebuilt on a plan change, so without it the previous plan's
  // visibility stays attached — measured as the 5-Room plan rendering with the 4-Room context
  // (`v0.31.7.44`). A linter cannot see a dependency whose only purpose is invalidation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: floorPlan is an invalidation key
  useEffect(() => {
    if (!enabled) {
      // NOT just an early return. Materials outlive the effect, so leaving them patched would
      // keep the baked GI on after a switch to `performance` or a flag toggle -- a gate that only
      // works in one direction is not a gate.
      const removed = detachAllVisibilityLightmaps(scene)
      if (removed > 0) invalidate()
      return
    }
    let cancelled = false
    // `?aoDir=<name>` (DEV only) serves an alternate lightmap set from
    // `public/assets/<name>`. The shipped set is a `visibility` bake; an
    // `irradiance` bake is a different quantity that must be compared against the
    // same Cycles references before it could replace it, and that comparison needs
    // the app to load it. Not a feature — a measurement seam, like `?aoGain=`.
    const dirParam = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get('aoDir')
      : null
    const dir = dirParam && /^[a-z0-9-]+$/i.test(dirParam) ? dirParam : 'lightmaps'
    const base = `${import.meta.env.BASE_URL}assets/${dir}`
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
      // The MODE comes from the artefact, never from a setting. An index declares
      // its own `pass`, and the two passes are not interchangeable: `visibility`
      // is a dimensionless occlusion ratio that MULTIPLIES the fill, `irradiance`
      // is the light itself and REPLACES it. `v0.31.7.67` measured getting that
      // backwards as worse than not applying a map at all. Deriving it here means
      // a mismatched pair cannot be configured into existence.
      // REFUSE a set this path can no longer render, rather than falling back.
      //
      // `v0.31.7.185` deleted the `multiply` operator, which is what a non-irradiance set needs:
      // `.102` measured it as the wrong operator outright (52-80 % of slots dark by design) and
      // your `(z)`5 call was "delete the pass, the assets and the `multiply` path entirely --
      // removal, not deprecation". With it gone, an occlusion set fed to `replace` would be
      // ASSIGNED as though it were irradiance, which is a room lit by an occlusion ratio: very
      // dark, and dark in a way that looks like a tuning problem rather than a wrong asset.
      if (parsed.index.pass !== 'irradiance') {
        console.warn(
          `visibility lightmaps: index pass is '${parsed.index.pass}', but only 'irradiance' is ` +
            'supported since v0.31.7.185 (the multiply operator was removed). Skipping.',
        )
        return
      }
      // EXTERIOR-FACE-LIGHTMAP. The building footprint is the exterior walls' CENTRE-LINES, in
      // world metres (a `PlanWall`'s `start`/`end` are the same x/z the shell is built in), tested
      // even-odd by `floorplan/footprint.ts:pointInBuilding`. Fewer than 3 exterior walls cannot
      // close a loop — a mid-draw or partial custom plan — so the test is skipped entirely rather
      // than run against an open chain that would report half the flat as outdoors.
      const extWalls: WallSeg[] = floorPlan.walls
        .filter((w) => w.thickness === 'external')
        .map((w) => ({ start: w.start, end: w.end }))
      const insideBuilding =
        exteriorFallback && extWalls.length >= 3
          ? (x: number, z: number) => pointInBuilding(x, z, extWalls)
          : undefined
      const result = applyLightmapsFromIndex(scene, parsed.index, load, {
        lampDensityAt: lampDensityLookup(floorPlan, itemsAtAttach),
        excludeGlazing,
        insideBuilding,
        // ORBIT-NIGHT-CAPS. The orbit section is taken at the ceiling, so the plan's own ceiling
        // height IS the cut plane — read from the plan rather than hardcoded so an edited ceiling
        // moves the cut with it. `?? 2.6` is belt-and-braces for a partially-built plan object.
        cutCapY: orbitNightCaps ? (floorPlan.ceilingHeight ?? 2.6) : undefined,
        // EXTERIOR-FACE-DAYLIGHT. Only meaningful when `insideBuilding` is supplied — a face has to
        // be MARKED exterior before it can be boosted — so the two flags compose rather than
        // overlap: with `exteriorFaceLightmapFallback` off nothing is marked and this is inert.
        exteriorDaylight,
        // `baseUrl` MUST come from the same `dir` the index was fetched from. It did not:
        // `?aoDir=` redirected the index fetch and left the map URLs pointing at
        // `assets/lightmaps`, so an alternate set loaded its index, matched its keys, patched
        // its materials -- and then fetched 40 files that were not there. `v0.31.7.106`
        // measured 54 patched materials with ZERO textures carrying image data.
        //
        // This is why `v0.31.7.90`-`.93` got statistics identical to the decimal from three
        // different irradiance bakes and concluded the bakes were equivalent. They were never
        // loaded. The `__visMapForProbe` handle was added to catch exactly this and did catch
        // it, the moment anything finally asserted on it.
        baseUrl: base,
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
  }, [
    enabled,
    scene,
    invalidate,
    floorPlan,
    excludeGlazing,
    exteriorFallback,
    orbitNightCaps,
    exteriorDaylight,
  ])

  return null
}
