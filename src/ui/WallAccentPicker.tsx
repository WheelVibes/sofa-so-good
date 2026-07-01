import { useShallow } from 'zustand/react/shallow'
import type { RoomId } from '../apartment/types'
import { useFeature } from '../features/useFeature'
import { proceduralThumbnailDataUrl } from '../materials/procedural/generators'
import type { MaterialDef } from '../materials/types'
import { useMaterials } from '../materials/useMaterial'
import { roomDisplayName } from '../state/rooms'
import { useStore } from '../state/store'
import { ColorPicker } from './controls/ColorPicker'
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
  const enabled = useFeature('wallAccentPicker')
  const selectedWall = useStore((s) => s.selectedWall)
  const wallAccents = useStore(useShallow((s) => s.finishes.wallAccents))
  const roomWall = useStore(useShallow((s) => s.finishes.walls))
  const setWallAccent = useStore((s) => s.setWallAccent)
  const clearWallAccent = useStore((s) => s.clearWallAccent)
  const selectItem = useStore((s) => s.selectItem)
  const plan = useStore((s) => s.floorPlan)
  const materials = useMaterials()

  if (!enabled || !selectedWall) return null
  const key = `${selectedWall.wallId}:${selectedWall.roomId}`
  const roomName = roomDisplayName(selectedWall.roomId, plan)
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
          <ColorPicker
            value={typeof current === 'string' && current.startsWith('#') ? current : '#cccccc'}
            onChange={(hex) => setWallAccent(key, hex)}
            ariaLabel="Custom accent colour"
            title="Custom colour"
            className={typeof current === 'string' && current.startsWith('#') ? 'on' : ''}
          />
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
