/**
 * SHOWROOM-FINISHES — re-resolve applied remote-material finishes on boot.
 *
 * A remote (Poly Haven / ambientCG) finish is applied as a plain string id
 * (`<provider>:<slug>:<resolution>`) in `finishes` / item props, which
 * round-trips through the autosave — but the def it renders with lives in the
 * session-only `resolvedRemoteMaterials` map, rebuilt from blob URLs each
 * session. Without this step a reload dropped every applied remote finish to
 * the first-builtin fallback until the user happened to re-open the pack
 * browser and re-download it.
 *
 * This scans the restored design for remote finish ids and re-resolves each
 * through the existing `resolveRemoteAsset` path: the IndexedDB asset cache
 * serves a previously-downloaded bundle offline; a cache miss re-fetches from
 * the provider. Failures are silent per-finish (same graceful degradation as
 * an unresolvable furniture def — the surface falls back until it resolves).
 *
 * Deliberately NOT gated by the `showroomFinishes` feature flag: gating is
 * browse/add only — an already-applied finish must keep rendering even when
 * the browsing surface is off (same precedent as remote furniture defs).
 */

import { extractRemoteFinishRefs, remoteEntryForRef } from '../../materials/showroomCatalog'
import { useStore } from '../store'

/** Scan the live store for applied remote-material finish ids. Pure-ish (reads
 *  the store snapshot passed in) so tests can feed a minimal state. */
export function collectRemoteFinishRefs(state: {
  finishes: unknown
  items: unknown
}): ReturnType<typeof extractRemoteFinishRefs> {
  // A string scan over the serialized slices catches every carrier — room
  // floor/wall/ceiling finishes, per-wall accents, and furniture `mat:`/GLB
  // part finishes inside item props — without coupling to each field's shape.
  return extractRemoteFinishRefs(JSON.stringify([state.finishes, state.items]))
}

/** Re-resolve every applied remote finish (fire-and-forget per entry). */
export async function rehydrateRemoteFinishes(): Promise<void> {
  const s = useStore.getState()
  const refs = collectRemoteFinishRefs({ finishes: s.finishes, items: s.items })
  await Promise.all(
    refs.map((ref) =>
      s.resolveRemoteAsset(remoteEntryForRef(ref), ref.resolution).catch((err) => {
        // Offline with no cached bundle — leave the surface on its fallback;
        // the id survives in the save, so a later session can still resolve.
        // Say so in dev, though: this is the one remote-finish failure with NO
        // UI surface (the pack browser shows its own index error), so a
        // misconfigured local mirror — `ambientCG library 404`, the dev API not
        // seeing `resources/` — otherwise looks like a finish that just refuses
        // to apply. See scripts/lib/devLibraryMirror.ts.
        if (import.meta.env.DEV) {
          console.warn(
            `[finishes] applied finish '${ref.provider}:${ref.slug}:${ref.resolution}' did not resolve — the surface stays on its fallback:`,
            err,
          )
        }
      }),
    ),
  )
}
