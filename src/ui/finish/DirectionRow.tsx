/**
 * Lay direction for a room's floor or wall finish — the angle a plank run, a
 * tile course or a panel grain follows.
 *
 * Real floors are laid ONE way across a room (parallel to the longest wall,
 * along the light, or perpendicular to the joists), so direction is a decision
 * the designer makes per surface, not something the renderer should pick. The
 * repetition break-up only varies the stagger around whatever is chosen here
 * (`materials/finishDirection.ts`).
 *
 * The presets are the three directions floors are actually laid in — straight,
 * cross, diagonal — with a stepper for anything else. Values are written to the
 * plan room by `setSurfaceTexture`, which does NOT fork the curated flat: this
 * is a finish decision, not a geometry edit.
 */

import { wallFaceKey } from '../../apartment/walls/wallTexTransform'
import { useStore } from '../../state/store'
import { Segmented } from '../controls/Segmented'
import { Num } from '../floorplan/editor/inspector/shared'

/** The directions a floor or wall run is actually set to, in degrees. */
const PRESETS: { label: string; deg: number; title: string }[] = [
  { label: '0°', deg: 0, title: 'Straight — along the room' },
  { label: '45°', deg: 45, title: 'Diagonal' },
  { label: '90°', deg: 90, title: 'Cross — across the room' },
]

const RAD = Math.PI / 180

/** Degrees (0–359) for a stored radian angle, rounded for display. */
export function degreesOf(angle: number | undefined): number {
  const deg = Math.round((((angle ?? 0) / RAD) % 360) * 10) / 10
  return deg < 0 ? deg + 360 : deg
}

/** Is `deg` the active preset for the stored angle? Tolerant of float drift. */
export function isPreset(angle: number | undefined, deg: number): boolean {
  return Math.abs(degreesOf(angle) - deg) < 0.05
}

export function DirectionRow({
  roomId,
  surface,
  wallId,
}: {
  roomId: string
  surface: 'floor' | 'wall'
  /** Set to scope the dials to ONE wall face (`${wallId}:${roomId}`) instead of
   *  the whole room — an accent wall usually wants its own direction. */
  wallId?: string
}) {
  const faceKey = wallId ? wallFaceKey(wallId, roomId) : null
  const face = useStore((s) => (faceKey ? s.finishes.wallTex?.[faceKey] : undefined))
  const roomAngle = useStore((s) => {
    const room = s.floorPlan.rooms.find((r) => r.id === roomId)
    return surface === 'floor' ? room?.floorTexAngle : room?.wallTexAngle
  })
  const roomScale = useStore((s) => {
    const room = s.floorPlan.rooms.find((r) => r.id === roomId)
    return surface === 'floor' ? room?.floorTexScale : room?.wallTexScale
  })
  const setSurfaceTexture = useStore((s) => s.setSurfaceTexture)
  const setWallFaceTexture = useStore((s) => s.setWallFaceTexture)
  const clearWallFaceTexture = useStore((s) => s.clearWallFaceTexture)
  // A face with no override of its own SHOWS the room's values (that is what it
  // renders) — the first edit then pins them to this face.
  const overridden = !!face && (face.angle !== undefined || face.scale !== undefined)
  const angle = faceKey ? (face?.angle ?? roomAngle) : roomAngle
  const scale = faceKey ? (face?.scale ?? roomScale) : roomScale
  const set = (patch: { scale?: number; angle?: number }) =>
    faceKey ? setWallFaceTexture(faceKey, patch) : setSurfaceTexture(roomId, surface, patch)
  const deg = degreesOf(angle)

  return (
    <div className="space-y-1" style={{ marginTop: 'var(--s-2)' }}>
      <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
        {surface === 'floor'
          ? 'Floor direction'
          : faceKey
            ? 'This wall’s direction'
            : 'Wall direction'}
      </div>
      {/* 3+ states → a Segmented radiogroup (TB-8), never a cycle button. The
          value is 'custom' when the angle is none of the presets, so a typed
          angle doesn't light one up falsely. */}
      <Segmented
        ariaLabel={`${surface === 'floor' ? 'Floor' : 'Wall'} texture direction`}
        value={PRESETS.find((p) => isPreset(angle, p.deg))?.label ?? 'custom'}
        onChange={(label) => {
          const preset = PRESETS.find((p) => p.label === label)
          if (preset) set({ angle: preset.deg * RAD })
        }}
        options={PRESETS.map((p) => ({ value: p.label, label: p.label, title: p.title }))}
      />
      <Num label="Angle (°)" value={deg} step={5} onChange={(v) => set({ angle: v * RAD })} />
      <Num
        label="Tile size (×)"
        value={scale ?? 1}
        step={0.1}
        min={0.25}
        onChange={(v) => set({ scale: v })}
      />
      {/* Only offered once this face actually differs — a face with no override
          already follows the room, so the button would be a no-op. */}
      {faceKey && overridden ? (
        <button
          type="button"
          className="btn btn-soft btn-block"
          onClick={() => clearWallFaceTexture(faceKey)}
        >
          Match room direction
        </button>
      ) : null}
    </div>
  )
}
