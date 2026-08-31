/**
 * Dev-server config for the measurement probes ONLY (never shipped).
 *
 * This worktree symlinks `node_modules` to the sibling checkout to avoid a
 * duplicate install — which means both checkouts also share
 * `node_modules/.vite`, Vite's dependency-optimizer cache. Whenever one dev
 * server re-optimizes, the other's pre-bundled dep URLs go stale and it starts
 * answering `504 (Outdated Optimize Dep)`.
 *
 * The symptom is nasty rather than obvious: the lazily-imported `EffectsImpl`
 * chunk fails to fetch, R3F's error boundary swaps the scene for a "Something
 * went wrong in the 3D scene" card, and every screenshot from then on captures
 * that card. A card is perfectly stable, so a probe diffing frames reports 0.00
 * difference for every setting — a whole shadow-resolution sweep read "no
 * difference between 512 and 4096" that way. `lib.mjs:assertSceneAlive` now fails
 * loudly on it; this config stops it happening in the first place by giving the
 * probe server its own `cacheDir`.
 *
 * Usage: `npx vite --config vite.probe.config.ts --port 5199 --strictPort`
 */
import { defineConfig, mergeConfig, type UserConfig, type UserConfigFnObject } from 'vite'
import base from './vite.config'

export default defineConfig((env) => {
  // The real config is a function of the Vite env (it branches `base` on
  // `command`), so it has to be CALLED — spreading the function object yields an
  // empty config, which silently drops every plugin including React. The page
  // then serves with no canvas at all.
  const resolved = (base as unknown as UserConfigFnObject)(env) as UserConfig
  return mergeConfig(resolved, { cacheDir: 'node_modules/.vite-probe' } satisfies UserConfig)
})
