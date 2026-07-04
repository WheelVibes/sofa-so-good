/** Pitch + roll sliders for multi-axis furniture tilt (SweetHome3DJS parity). */

import { TILT_LIMIT_DEG } from '../../furniture/tiltRotation'

/** Pitch + roll sliders for multi-axis furniture tilt (SweetHome3DJS parity).
 *  Values are stored in radians; the UI works in whole degrees. The range
 *  (`TILT_LIMIT_DEG`) is shared with the in-viewport `TiltGizmo` handle so
 *  neither affordance can push a piece further than the other allows. */
export function TiltControls({
  pitch,
  roll,
  onPitch,
  onRoll,
  onReset,
}: {
  pitch: number
  roll: number
  onPitch: (rad: number) => void
  onRoll: (rad: number) => void
  onReset: () => void
}) {
  const toDeg = (rad: number) => Math.round((rad * 180) / Math.PI)
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const tilted = !!pitch || !!roll
  const Row = ({
    label,
    value,
    onChange,
  }: {
    label: string
    value: number
    onChange: (rad: number) => void
  }) => (
    <div className="fld" style={{ display: 'block', marginBottom: 'var(--s-1)' }}>
      <div
        className="label"
        style={{
          fontSize: 'var(--t-2xs)',
          color: 'var(--text-3)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{label}</span>
        <span>{toDeg(value)}°</span>
      </div>
      <input
        type="range"
        className="slider"
        aria-label={`${label} (degrees)`}
        min={-TILT_LIMIT_DEG}
        max={TILT_LIMIT_DEG}
        step={1}
        value={toDeg(value)}
        onChange={(e) => onChange(toRad(Number(e.target.value)))}
        style={{ width: '100%' }}
      />
    </div>
  )
  return (
    <div className="sec" style={{ marginTop: 'var(--s-2)' }}>
      <div className="sec-h">
        <span>Tilt</span>
        {tilted ? (
          <button type="button" className="btn btn-soft btn-sm" onClick={onReset}>
            Reset
          </button>
        ) : null}
      </div>
      <Row label="Pitch (forward / back)" value={pitch} onChange={onPitch} />
      <Row label="Roll (left / right)" value={roll} onChange={onRoll} />
    </div>
  )
}
