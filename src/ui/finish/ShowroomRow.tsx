/**
 * SHOWROOM-FINISHES — the one-tap curated strip of photo-scanned CC0 PBR
 * finishes (Poly Haven), shown above the finish grid. Tapping a chip streams
 * the full map set (albedo/normal/roughness/AO, CORS-direct, IDB-cached) via
 * the existing `resolveRemoteAsset` path and applies it to the active surface.
 *
 * Graceful degradation: a chip whose CDN thumbnail 404s (dead/renamed slug,
 * offline) hides itself; a failed resolve keeps the current finish and shows
 * the standard error toast. Flag-gated at the call site (`showroomFinishes`).
 */

import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  parseRemoteFinishId,
  SHOWROOM_RESOLUTION,
  type ShowroomFinish,
  showroomEntry,
  showroomFinishes,
  showroomFinishId,
} from '../../materials/showroomCatalog'
import type { MaterialCategory } from '../../materials/types'
import { useStore } from '../../state/store'

export function ShowroomRow({
  surface,
  active,
  onSelect,
}: {
  surface: MaterialCategory
  /** The active finish id for this surface (its tint base already resolved). */
  active: string
  onSelect: (id: string) => void
}) {
  const finishes = showroomFinishes(surface)
  const fetches = useStore(useShallow((s) => s.remoteFetches))
  const resolvedIds = useStore(useShallow((s) => Object.keys(s.resolvedRemoteMaterials)))
  const resolve = useStore((s) => s.resolveRemoteAsset)
  // Slugs whose CDN thumbnail failed to load — hidden (dead slug / offline).
  const [hiddenSlugs, setHiddenSlugs] = useState<ReadonlySet<string>>(new Set())

  const visible = finishes.filter((f) => !hiddenSlugs.has(f.slug))
  if (visible.length === 0) return null

  const activeSlug = parseRemoteFinishId(active)?.slug ?? null

  const pick = async (f: ShowroomFinish) => {
    const id = showroomFinishId(f.slug)
    if (resolvedIds.includes(id)) {
      onSelect(id)
      return
    }
    try {
      await resolve(showroomEntry(f), SHOWROOM_RESOLUTION)
      onSelect(id)
    } catch {
      useStore.getState().notify.start({
        title: `Couldn't download "${f.name}"`,
        kind: 'error',
        message: 'Check your connection and try again.',
      })
    }
  }

  return (
    <div style={{ marginBottom: 'var(--s-2)' }}>
      <div className="sec-h" style={{ marginBottom: 'var(--s-2)' }}>
        <span>Showroom</span>
        <span className="badge ok" style={{ marginLeft: 'var(--s-2)' }}>
          photo PBR
        </span>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: same plain swatch-row group
          semantics as DesignerPicks/RecentFinishes in swatches.tsx. */}
      <div
        className="swatches"
        style={{ paddingBlock: 0 }}
        role="group"
        aria-label="Showroom finishes"
      >
        {visible.map((f) => {
          const id = showroomFinishId(f.slug)
          const busy = fetches[id] === 'fetching'
          const isActive = activeSlug === f.slug
          return (
            <button
              key={f.slug}
              type="button"
              className={`swatch${isActive ? ' on' : ''}`}
              title={`${f.name} — photo-scanned finish (CC0)`}
              aria-label={`Showroom finish: ${f.name}`}
              aria-pressed={isActive}
              aria-busy={busy}
              disabled={busy}
              onClick={() => void pick(f)}
              style={{
                backgroundColor: f.swatch,
                position: 'relative',
                overflow: 'hidden',
                ...(busy ? { opacity: 0.55, cursor: 'progress' } : {}),
              }}
            >
              <img
                src={showroomEntry(f).thumbUrl}
                alt=""
                loading="lazy"
                draggable={false}
                onError={() =>
                  setHiddenSlugs((prev) => {
                    const next = new Set(prev)
                    next.add(f.slug)
                    return next
                  })
                }
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
