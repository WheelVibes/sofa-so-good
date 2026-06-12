import type { ParametricModel } from '../../furniture/parametric/buildParts'
import {
  MAX_SHELVES,
  PARAMETRIC_LIMITS,
  type ParametricSpec,
} from '../../furniture/parametric/spec'
import { DimField } from './DimField'

/** Preset finish swatches (kind + tint) — common board finishes. A free colour
 *  input alongside covers everything else. */
const FINISH_PRESETS: { label: string; finish: string; color: string }[] = [
  { label: 'Oak', finish: 'wood', color: '#9a7b50' },
  { label: 'Walnut', finish: 'wood', color: '#6e5337' },
  { label: 'White', finish: 'painted', color: '#e8e4dc' },
  { label: 'Black', finish: 'painted', color: '#2e2c29' },
  { label: 'Sage', finish: 'painted', color: '#9aa78f' },
  { label: 'Gloss white', finish: 'gloss', color: '#f0ede7' },
]

/** Dimension sliders + per-type options for the parametric dialog (PF1).
 *  Pure controlled component — all state lives in the dialog's spec. */
export function ParametricControls({
  spec,
  model,
  onChange,
}: {
  spec: ParametricSpec
  model: ParametricModel
  onChange: (patch: Partial<ParametricSpec>) => void
}) {
  const lim = PARAMETRIC_LIMITS[spec.type]
  const autoShelves = spec.shelves === 'auto'
  const showShelves = spec.type !== 'wardrobe'
  const showDoors = spec.type !== 'bookshelf'
  const showBase = spec.type === 'sideboard'

  return (
    <>
      <div className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="sec-h">
          <span>Dimensions</span>
        </div>
        <DimField
          label="Width"
          value={spec.width}
          range={lim.width}
          onChange={(width) => onChange({ width })}
        />
        <DimField
          label="Height"
          value={spec.height}
          range={lim.height}
          onChange={(height) => onChange({ height })}
        />
        <DimField
          label="Depth"
          value={spec.depth}
          range={lim.depth}
          onChange={(depth) => onChange({ depth })}
        />
      </div>

      <div className="sec">
        <div className="sec-h">
          <span>Options</span>
        </div>
        {showShelves ? (
          <>
            <label className="row" style={{ cursor: 'pointer' }}>
              <div className="rk">Auto shelf spacing</div>
              <button
                type="button"
                role="switch"
                aria-checked={autoShelves}
                aria-label="Auto shelf spacing"
                onClick={() => onChange({ shelves: autoShelves ? model.shelvesPerBay : 'auto' })}
                className={`switch${autoShelves ? ' on' : ''}`}
              />
            </label>
            {autoShelves ? (
              <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
                {model.shelvesPerBay} shelves per bay (~35 cm apart)
              </div>
            ) : (
              <div className="fld" style={{ display: 'block' }}>
                <div
                  className="label"
                  style={{
                    fontSize: 'var(--t-2xs)',
                    color: 'var(--text-3)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Shelves per bay</span>
                  <span>{model.shelvesPerBay}</span>
                </div>
                <input
                  type="range"
                  className="slider"
                  aria-label="Shelf count"
                  min={0}
                  max={MAX_SHELVES}
                  step={1}
                  value={typeof spec.shelves === 'number' ? spec.shelves : model.shelvesPerBay}
                  onChange={(e) => onChange({ shelves: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </>
        ) : null}
        {showDoors ? (
          <label className="row" style={{ cursor: 'pointer' }}>
            <div
              className="rk"
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
            >
              <div>{spec.type === 'wardrobe' ? 'Hinged doors' : 'Doors'}</div>
              {spec.doors ? (
                <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', fontWeight: 500 }}>
                  {model.doorCount} leaves (each ≤ 60 cm)
                </div>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={spec.doors}
              aria-label="Doors"
              onClick={() => onChange({ doors: !spec.doors })}
              className={`switch${spec.doors ? ' on' : ''}`}
            />
          </label>
        ) : null}
        {showBase ? (
          <div style={{ marginTop: 'var(--s-2)' }}>
            <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              Base
            </div>
            <div className="seg">
              {(
                [
                  ['legs', 'Legs'],
                  ['plinth', 'Plinth'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  className={spec.base === v ? 'on' : ''}
                  aria-label={`Base: ${label}`}
                  onClick={() => onChange({ base: v })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {model.bays > 1 ? (
          <div
            style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 'var(--s-2)' }}
          >
            {model.bays} bays — a centre divider keeps wide shelves supported.
          </div>
        ) : null}
      </div>

      <div className="sec">
        <div className="sec-h">
          <span>Finish</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          {FINISH_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`swatch${spec.finish === p.finish && spec.color === p.color ? ' on' : ''}`}
              style={{ background: p.color, width: 26, height: 26, borderRadius: 6 }}
              aria-label={`Finish: ${p.label}`}
              title={p.label}
              onClick={() => onChange({ finish: p.finish, color: p.color })}
            />
          ))}
          <input
            type="color"
            value={spec.color}
            aria-label="Custom colour"
            title="Custom colour"
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </div>
      </div>
    </>
  )
}
