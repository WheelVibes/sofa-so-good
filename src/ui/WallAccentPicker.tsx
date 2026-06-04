import { useShallow } from 'zustand/react/shallow'
import { ROOMS } from '../apartment/constants'
import type { RoomId } from '../apartment/types'
import { proceduralThumbnailDataUrl } from '../materials/procedural/generators'
import type { MaterialDef } from '../materials/types'
import { useMaterials } from '../materials/useMaterial'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

function swatchImage(m: MaterialDef): string | undefined {
  if (m.kind === 'procedural')
    return `url("${proceduralThumbnailDataUrl(m.id, m.pattern, m.swatch)}")`
  if (m.kind === 'textured')
    return `url("${m.thumbUrl ?? m.runtimeUrls?.albedo ?? m.textures.albedo}")`
  return undefined
}

/**
 * Accent-wall finishing panel — shown when a wall face is selected (clicked in
 * orbit mode). Paints that one wall face (the side facing the clicked room)
 * with a chosen finish, independent of the room's other walls. "Match room"
 * clears the override so the wall follows the room default again.
 */
export function WallAccentPicker() {
  const selectedWall = useStore((s) => s.selectedWall)
  const wallAccents = useStore(useShallow((s) => s.finishes.wallAccents))
  const roomWall = useStore(useShallow((s) => s.finishes.walls))
  const setWallAccent = useStore((s) => s.setWallAccent)
  const clearWallAccent = useStore((s) => s.clearWallAccent)
  const selectItem = useStore((s) => s.selectItem)
  const materials = useMaterials()

  if (!selectedWall) return null
  const key = `${selectedWall.wallId}:${selectedWall.roomId}`
  const roomName = ROOMS[selectedWall.roomId as RoomId]?.name ?? selectedWall.roomId
  const current = wallAccents[key] ?? roomWall[selectedWall.roomId as RoomId]
  const walls = Object.values(materials).filter((m) => m.category === 'wall')

  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <div>
          <div className="panel-title">Accent wall</div>
          <div className="panel-sub">{roomName} side</div>
        </div>
        <button
          type="button"
          onClick={() => selectItem(null)}
          className="icon-btn"
          aria-label="Close"
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
      <hr className="hr" />
      <div className="panel-body">
        <div className="swatches">
          {walls.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => setWallAccent(key, m.id)}
              title={m.name}
              className={`swatch${current === m.id ? ' on' : ''}`}
              style={{
                backgroundColor: m.swatch,
                backgroundImage: swatchImage(m),
                backgroundSize: 'cover',
              }}
            />
          ))}
          {/* Custom colour */}
          <label
            title="Custom colour"
            className={`swatch${typeof current === 'string' && current.startsWith('#') ? ' on' : ''}`}
            style={{
              position: 'relative',
              cursor: 'pointer',
              background:
                typeof current === 'string' && current.startsWith('#')
                  ? current
                  : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            }}
          >
            <input
              type="color"
              value={typeof current === 'string' && current.startsWith('#') ? current : '#cccccc'}
              onChange={(e) => setWallAccent(key, e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              aria-label="Custom accent colour"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => clearWallAccent(key)}
          className="btn btn-soft btn-block"
          style={{ marginTop: 'var(--s-4)' }}
        >
          <Icon.Reset width={14} height={14} />
          Match room finish
        </button>
      </div>
    </aside>
  )
}
