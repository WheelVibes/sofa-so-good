import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ROOMS, roomArea } from '../apartment/constants'
import type { RoomId } from '../apartment/types'
import { useCatalog } from '../furniture/catalog'
import { arrangeRoom } from '../layout/autoArrange'
import { proceduralThumbnailDataUrl } from '../materials/procedural/generators'
import type { MaterialCategory, MaterialDef } from '../materials/types'
import { useMaterials } from '../materials/useMaterial'
import { useStore } from '../state/store'
import { RemoteBrowseTab } from './catalog/RemoteBrowseTab'
import { Icon } from './toolbar/icons'
import { UploadMaterialDialog } from './upload/UploadMaterialDialog'

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

type View = 'swatch' | 'browse'
type Surface = 'floor' | 'wall'

const LAST_SURFACE_KEY = 'hdb_last_finish_surface'

/**
 * Right-side panel shown when a room is selected. Floor / wall tabs
 * each present a swatch grid of available materials — built-ins, user
 * uploads (with an "Uploaded" badge), and any resolved remote materials
 * (with a provider tag).
 *
 * From here the user can also `Browse online…` which mounts the remote
 * material browser inline; resolving applies the material to the
 * last-edited surface and returns to the swatch view.
 */
export function FinishPicker() {
  const roomId = useStore((s) => s.selectedRoomId) as RoomId | null
  const finishes = useStore(useShallow((s) => s.finishes))
  const setFloorFinish = useStore((s) => s.setFloorFinish)
  const setWallFinish = useStore((s) => s.setWallFinish)
  const selectRoom = useStore((s) => s.selectRoom)
  const removeUserMaterial = useStore((s) => s.removeUserMaterial)
  const recentColors = useStore(useShallow((s) => s.recentColors))
  const pushRecentColor = useStore((s) => s.pushRecentColor)
  const furnitureCatalog = useCatalog()
  const tidyRoom = () => {
    if (!roomId) return
    const s = useStore.getState()
    s.pushHistory()
    s.setItems(arrangeRoom(roomId, s.items, furnitureCatalog, s.doors))
  }
  const bootstrapRemote = useStore((s) => s.bootstrapRemoteCatalog)
  const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status)
  const materials = useMaterials()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [view, setView] = useState<View>('swatch')
  // Remember which surface was last finished, across sessions, so Browse opens
  // pre-filtered to it (and resolving applies to it).
  const [lastSurface, setLastSurfaceState] = useState<Surface>(() => {
    try {
      return localStorage.getItem(LAST_SURFACE_KEY) === 'wall' ? 'wall' : 'floor'
    } catch {
      return 'floor'
    }
  })
  const setLastSurface = (s: Surface) => {
    setLastSurfaceState(s)
    try {
      localStorage.setItem(LAST_SURFACE_KEY, s)
    } catch {
      // ignore (private mode / unavailable storage)
    }
  }

  useEffect(() => {
    if (view === 'browse' && phStatus === 'idle') void bootstrapRemote()
  }, [view, phStatus, bootstrapRemote])

  if (!roomId) return null
  const room = ROOMS[roomId]
  if (!room || room.external) return null

  const groups: Record<MaterialCategory, MaterialDef[]> = {
    floor: [],
    wall: [],
  }
  for (const m of Object.values(materials)) groups[m.category].push(m)

  const handleSelect = (surface: Surface, id: string) => {
    setLastSurface(surface)
    if (id.startsWith('#')) pushRecentColor(id)
    if (surface === 'floor') setFloorFinish(roomId, id)
    else setWallFinish(roomId, id)
  }

  const handleResolved = (id: string) => {
    if (lastSurface === 'floor') setFloorFinish(roomId, id)
    else setWallFinish(roomId, id)
    setView('swatch')
  }

  return (
    <aside className="panel inspector" style={view === 'browse' ? { width: 320 } : undefined}>
      <div className="panel-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {view === 'browse' && (
            <button
              type="button"
              onClick={() => setView('swatch')}
              className="icon-btn"
              aria-label="Back to swatches"
            >
              <Icon.ArrowLeft width={16} height={16} />
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="panel-title">{view === 'browse' ? 'Browse materials' : room.name}</div>
            <div className="panel-sub">
              {view === 'browse'
                ? `Apply to ${lastSurface}`
                : `Finishes · ${roomArea(room).toFixed(1)} m²`}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => selectRoom(null)}
          className="icon-btn"
          aria-label="Close finish picker"
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
      <hr className="hr" />

      {view === 'swatch' ? (
        <div className="panel-body">
          <SwatchGroup
            label="Floor"
            items={groups.floor}
            active={finishes.floor[roomId]}
            onSelect={(id) => handleSelect('floor', id)}
            onRemoveUser={removeUserMaterial}
            onCustom={(hex) => handleSelect('floor', hex)}
            recent={recentColors}
          />
          <SwatchGroup
            label="Walls"
            items={groups.wall}
            active={finishes.walls[roomId]}
            onSelect={(id) => handleSelect('wall', id)}
            onRemoveUser={removeUserMaterial}
            onCustom={(hex) => handleSelect('wall', hex)}
            recent={recentColors}
          />
          <button
            type="button"
            onClick={tidyRoom}
            title="Auto-arrange this room's furniture: storage flush to walls, seating facing the TV, walkways + door clearances kept"
            className="btn btn-accent btn-block"
            style={{ marginTop: 'var(--s-4)' }}
          >
            <Icon.Tidy width={14} height={14} />
            Tidy up room
          </button>
          <div className="export-row" style={{ marginTop: 'var(--s-2)' }}>
            <button type="button" onClick={() => setView('browse')} className="btn btn-soft">
              <Icon.Search width={14} height={14} />
              Browse
            </button>
            <button type="button" onClick={() => setUploadOpen(true)} className="btn btn-soft">
              <Icon.Upload width={14} height={14} />
              Upload
            </button>
          </div>
          <UploadMaterialDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
        </div>
      ) : (
        <div
          className="panel-body"
          style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
        >
          <RemoteBrowseTab
            kind="material"
            onResolved={handleResolved}
            defaultCategory={lastSurface}
          />
        </div>
      )}
    </aside>
  )
}

interface SwatchGroupProps {
  label: string
  items: MaterialDef[]
  active: string
  onSelect: (id: string) => void
  onRemoveUser: (id: string) => void
  onCustom?: (hex: string) => void
  recent?: string[]
}

function providerTag(def: MaterialDef): { label: string; cls: string } | null {
  if (def.kind !== 'textured') return null
  if (def.source === 'user') return { label: 'user', cls: 'badge neutral' }
  if (def.source === 'polyhaven') return { label: 'PH', cls: 'badge ok' }
  if (def.source === 'ambientcg') return { label: 'ACG', cls: 'badge warn' }
  return null
}

function SwatchGroup({
  label,
  items,
  active,
  onSelect,
  onRemoveUser,
  onCustom,
  recent,
}: SwatchGroupProps) {
  const customActive = typeof active === 'string' && active.startsWith('#')
  return (
    <section className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
      <div className="sec-h">
        <span>{label}</span>
      </div>
      <div className="finish-grid">
        {items.map((m) => {
          const isUser = m.kind === 'textured' && m.source === 'user'
          const isActive = m.id === active
          const tag = providerTag(m)
          return (
            // biome-ignore lint/a11y/useSemanticElements: tile holds a nested remove button, so it can't be a <button>
            <div
              key={m.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(m.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(m.id)
              }}
              className={`finish-cell group${isActive ? ' on' : ''}`}
              style={{ position: 'relative', cursor: 'pointer' }}
              title={m.name}
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
                  aria-label="Remove uploaded material"
                >
                  <Icon.Close width={12} height={12} />
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
      ) : null}
    </section>
  )
}
