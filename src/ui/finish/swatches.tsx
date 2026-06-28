import type React from 'react'
import { useFeature } from '../../features/useFeature'
import { encodeFinishDrag, FINISH_DND_MIME } from '../../materials/finishDrop'
import { proceduralThumbnailDataUrl } from '../../materials/procedural/generators'
import type { MaterialDef } from '../../materials/types'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'

/** Background-image URL for a swatch tile: the generated texture preview for
 *  procedural finishes, the provider thumbnail/albedo for textured ones. */
function swatchImage(m: MaterialDef): string | undefined {
  if (m.kind === 'procedural') {
    return `url("${proceduralThumbnailDataUrl(m.id, m.pattern, m.swatch)}")`
  }
  if (m.kind === 'textured') {
    return `url("${m.thumbUrl ?? m.runtimeUrls?.albedo ?? m.textures.albedo}")`
  }
  return undefined
}

interface SwatchGroupProps {
  label: string
  items: MaterialDef[]
  active: string
  onSelect: (id: string) => void
  onRemoveUser: (id: string) => void
  /** Finish ids that are user-saved custom materials — badged "mine" + removable
   *  even when they aren't uploaded textures (composed/tinted/colour finishes). */
  savedIds?: Set<string>
  onCustom?: (hex: string) => void
  recent?: string[]
  /** Recently-applied finish ids (any surface); filtered to this group's items. */
  recentFinishIds?: string[]
  /** Curated "designer picks" for this surface (already resolved to real defs). */
  curated?: MaterialDef[]
}

/** A compact one-tap row of curated "designer picks" for a surface, shown above
 *  the full grid. Same swatch styling as RecentFinishes; parent owns the value. */
function DesignerPicks({
  mats,
  active,
  onSelect,
}: {
  mats: MaterialDef[]
  active: string
  onSelect: (id: string) => void
}) {
  if (mats.length === 0) return null
  return (
    <div style={{ marginBottom: 'var(--s-2)' }}>
      <div className="sec-h" style={{ marginBottom: 'var(--s-2)' }}>
        <span>Designer picks</span>
      </div>
      <div className="swatches" style={{ paddingBlock: 0 }}>
        {mats.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`swatch${m.id === active ? ' on' : ''}`}
            title={m.name}
            aria-label={`Designer pick: ${m.name}`}
            onClick={() => onSelect(m.id)}
            style={{
              backgroundColor: m.swatch,
              backgroundImage: swatchImage(m),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ))}
      </div>
    </div>
  )
}

/** A compact row of recently-applied finish materials (filtered to one surface),
 *  for quickly re-applying the same finish across rooms. */
function RecentFinishes({
  mats,
  active,
  onSelect,
}: {
  mats: MaterialDef[]
  active: string
  onSelect: (id: string) => void
}) {
  if (mats.length === 0) return null
  return (
    <div style={{ marginBottom: 'var(--s-2)' }}>
      <div className="sec-h" style={{ marginBottom: 'var(--s-2)' }}>
        <span>Recently used</span>
      </div>
      <div className="swatches" style={{ paddingBlock: 0 }}>
        {mats.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`swatch${m.id === active ? ' on' : ''}`}
            title={m.name}
            aria-label={`Recently used: ${m.name}`}
            onClick={() => onSelect(m.id)}
            style={{
              backgroundColor: m.swatch,
              backgroundImage: swatchImage(m),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function providerTag(def: MaterialDef): { label: string; cls: string } | null {
  if (def.kind !== 'textured') return null
  if (def.source === 'user') return { label: 'user', cls: 'badge neutral' }
  if (def.source === 'polyhaven') return { label: 'PH', cls: 'badge ok' }
  if (def.source === 'ambientcg') return { label: 'ACG', cls: 'badge warn' }
  return null
}

/** A small finish-colour swatches row (recent custom colours). */
function RecentColors({
  recent,
  active,
  onCustom,
}: {
  recent: string[]
  active: string
  onCustom: (hex: string) => void
}) {
  return (
    <div style={{ marginTop: 'var(--s-3)' }}>
      <div className="sec-h" style={{ marginBottom: 'var(--s-2)' }}>
        <span>Recent</span>
      </div>
      <div className="swatches">
        {recent.map((hex) => (
          <button
            type="button"
            key={hex}
            onClick={() => onCustom(hex)}
            title={hex}
            aria-label={`Recent colour ${hex}`}
            className={`swatch${active === hex ? ' on' : ''}`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </div>
  )
}

export function SwatchGroup({
  label,
  items,
  active,
  onSelect,
  onRemoveUser,
  savedIds,
  onCustom,
  recent,
  recentFinishIds,
  curated,
}: SwatchGroupProps) {
  const customActive = typeof active === 'string' && active.startsWith('#')
  const isMobile = useIsMobile()
  // Drag-to-apply (Q31): swatches are drag sources for the Objects-list rows
  // and the 3D canvas drop surfaces. Desktop-only (HTML5 DnD has no touch
  // equivalent — mobile keeps the tap-to-apply flow).
  const fFinishDnd = useFeature('finishDnd')
  // Finish favourites (PC2-FAVOURITE-MATERIALS) — reuse the catalogFavourites
  // flag (same "star to favourite" feature, extended to finishes).
  const favOn = useFeature('catalogFavourites')
  const favIds = useStore((s) => s.favouriteFinishIds)
  const toggleFinishFavourite = useStore((s) => s.toggleFinishFavourite)
  const favSet = new Set(favIds)
  // Favourited finishes float to the top of this group (stable within each part).
  const sorted =
    favOn && favSet.size > 0
      ? [...items.filter((m) => favSet.has(m.id)), ...items.filter((m) => !favSet.has(m.id))]
      : items
  // Recent finishes that belong to THIS surface (intersect with the group's
  // items so a recent floor finish doesn't surface in the Walls group).
  const recentMats = (recentFinishIds ?? [])
    .map((id) => items.find((m) => m.id === id))
    .filter((m): m is MaterialDef => m != null)

  // Mobile: the 3-up swatch grid squeezes each thumbnail into a thin strip, so
  // show a compact dropdown of finishes with a live preview of the current
  // choice instead (+ the custom-colour control + recent row).
  if (isMobile) {
    const activeMat = items.find((m) => m.id === active)
    const previewStyle: React.CSSProperties = activeMat
      ? {
          backgroundColor: activeMat.swatch,
          backgroundImage: swatchImage(activeMat),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : customActive
        ? { background: active }
        : { background: 'var(--surface-3)' }
    return (
      <section className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="sec-h">
          <span>{label}</span>
        </div>
        {curated ? <DesignerPicks mats={curated} active={active} onSelect={onSelect} /> : null}
        <RecentFinishes mats={recentMats} active={active} onSelect={onSelect} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
          <span
            className="swatch-lg"
            aria-hidden
            style={{ width: 52, height: 36, flex: '0 0 auto', ...previewStyle }}
          />
          <select
            className="input"
            style={{ flex: 1, minWidth: 0 }}
            aria-label={`${label} finish`}
            value={customActive ? '' : active}
            onChange={(e) => onSelect(e.target.value)}
          >
            {customActive ? <option value="">Custom colour</option> : null}
            {sorted.map((m) => {
              const tag = providerTag(m)
              return (
                <option key={m.id} value={m.id}>
                  {favSet.has(m.id) ? '★ ' : ''}
                  {m.name}
                  {tag ? ` · ${tag.label}` : ''}
                </option>
              )
            })}
          </select>
          {favOn && !customActive && active ? (
            <button
              type="button"
              className={`fav-btn${favSet.has(active) ? ' on' : ''}`}
              style={{ position: 'static', flex: '0 0 auto' }}
              aria-label={
                favSet.has(active) ? 'Remove finish from favourites' : 'Add finish to favourites'
              }
              onClick={() => toggleFinishFavourite(active)}
            >
              <Icon.Heart width={16} height={16} />
            </button>
          ) : null}
          {onCustom ? (
            <label
              className="swatch-lg"
              title="Custom colour"
              style={{
                width: 36,
                height: 36,
                flex: '0 0 auto',
                position: 'relative',
                cursor: 'pointer',
                background: customActive
                  ? (active as string)
                  : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
              }}
            >
              <input
                type="color"
                value={customActive ? (active as string) : '#cccccc'}
                onChange={(e) => onCustom(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label={`Custom ${label.toLowerCase()} colour`}
              />
            </label>
          ) : null}
        </div>
        {onCustom && recent && recent.length > 0 ? (
          <RecentColors recent={recent} active={active} onCustom={onCustom} />
        ) : null}
      </section>
    )
  }

  return (
    <section className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
      <div className="sec-h">
        <span>{label}</span>
      </div>
      {curated ? <DesignerPicks mats={curated} active={active} onSelect={onSelect} /> : null}
      <RecentFinishes mats={recentMats} active={active} onSelect={onSelect} />
      <div className="finish-grid">
        {sorted.map((m) => {
          const isSaved = savedIds?.has(m.id) ?? false
          // Uploaded textures and saved custom materials are both the user's own
          // → removable. Saved (composed/tinted/colour) ones get a "mine" badge.
          const isUser = (m.kind === 'textured' && m.source === 'user') || isSaved
          const isActive = m.id === active
          const tag = providerTag(m) ?? (isSaved ? { label: 'mine', cls: 'badge neutral' } : null)
          const fav = favSet.has(m.id)
          return (
            // biome-ignore lint/a11y/useSemanticElements: tile holds a nested remove button, so it can't be a <button>
            <div
              key={m.id}
              role="button"
              tabIndex={0}
              draggable={fFinishDnd}
              onDragStart={
                fFinishDnd
                  ? (e) => {
                      e.dataTransfer.setData(
                        FINISH_DND_MIME,
                        encodeFinishDrag({ finishId: m.id, label: m.name }),
                      )
                      e.dataTransfer.effectAllowed = 'copy'
                    }
                  : undefined
              }
              onClick={() => onSelect(m.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(m.id)
              }}
              className={`finish-cell group${isActive ? ' on' : ''}`}
              style={{ position: 'relative', cursor: 'pointer' }}
              title={
                fFinishDnd
                  ? `${m.name} — drag onto a floor, wall or piece in the scene (or an Objects-list row) to apply`
                  : m.name
              }
            >
              <span
                className="swatch-lg"
                style={{
                  backgroundColor: m.swatch,
                  backgroundImage: swatchImage(m),
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <span className="name">{m.name}</span>
              {tag ? (
                <span
                  className="badge neutral"
                  style={{ position: 'absolute', right: 4, top: 4, padding: '1px 5px' }}
                >
                  {tag.label}
                </span>
              ) : null}
              {isUser ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveUser(m.id)
                  }}
                  className="coll-x"
                  style={{ bottom: 4, top: 'auto' }}
                  aria-label={isSaved ? 'Remove saved material' : 'Remove uploaded material'}
                >
                  <Icon.Close width={12} height={12} />
                </button>
              ) : null}
              {favOn ? (
                <button
                  type="button"
                  className={`fav-btn${fav ? ' on' : ''}`}
                  aria-label={fav ? 'Remove finish from favourites' : 'Add finish to favourites'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFinishFavourite(m.id)
                  }}
                >
                  <Icon.Heart width={12} height={12} />
                </button>
              ) : null}
            </div>
          )
        })}
        {/* Custom colour: a native colour picker styled as a swatch tile. */}
        {onCustom ? (
          <label
            className={`finish-cell${customActive ? ' on' : ''}`}
            style={{ position: 'relative', cursor: 'pointer' }}
            title="Custom colour"
          >
            <span
              className="swatch-lg"
              style={{
                background: customActive
                  ? (active as string)
                  : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
              }}
            />
            <span className="name">Custom…</span>
            <input
              type="color"
              value={customActive ? (active as string) : '#cccccc'}
              onChange={(e) => onCustom(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={`Custom ${label.toLowerCase()} colour`}
            />
          </label>
        ) : null}
      </div>
      {onCustom && recent && recent.length > 0 ? (
        <RecentColors recent={recent} active={active} onCustom={onCustom} />
      ) : null}
    </section>
  )
}
