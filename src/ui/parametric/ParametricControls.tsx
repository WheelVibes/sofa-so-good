import type { ParametricModel } from '../../furniture/parametric/buildParts'
import {
  bayFitOut,
  type CompartmentConfig,
  type CompartmentStyle,
  MAX_KITCHEN_BAYS,
  MAX_PEDESTAL_DRAWERS,
  MAX_SHELVES,
  PARAMETRIC_LIMITS,
  type ParametricSpec,
  WARDROBE_FIT_OUT_LABEL,
  WARDROBE_FIT_OUTS,
  WARDROBE_FRONT_LABEL,
  WARDROBE_FRONTS,
  type WardrobeFitOut,
  type WardrobeFront,
} from '../../furniture/parametric/spec'
import { ColorPicker } from '../controls/ColorPicker'
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

/** Labels for the three bay-style choices. */
const BAY_STYLE_LABELS: Record<CompartmentStyle, string> = {
  open: 'Open',
  door: 'Door',
  drawer: 'Drawer',
}

/** Per-bay style row — compact segmented control inside the compartment grid. */
function BayStylePicker({
  bayIndex,
  bays,
  spec,
  onChange,
}: {
  bayIndex: number
  bays: number
  spec: ParametricSpec
  onChange: (patch: Partial<ParametricSpec>) => void
}) {
  const current: CompartmentStyle =
    spec.compartments?.[bayIndex]?.style ?? (spec.doors ? 'door' : 'open')
  const setStyle = (style: CompartmentStyle) => {
    const next: CompartmentConfig[] = Array.from({ length: bays }, (_, i) => ({
      style:
        i === bayIndex ? style : (spec.compartments?.[i]?.style ?? (spec.doors ? 'door' : 'open')),
    }))
    onChange({ compartments: next })
  }
  return (
    <div style={{ marginBottom: 'var(--s-1)' }}>
      <div
        style={{
          fontSize: 'var(--t-2xs)',
          color: 'var(--text-3)',
          marginBottom: 'var(--s-0)',
        }}
      >
        Bay {bayIndex + 1}
      </div>
      <div className="seg" style={{ fontSize: 'var(--t-2xs)' }}>
        {(['open', 'door', 'drawer'] as CompartmentStyle[]).map((s) => (
          <button
            key={s}
            type="button"
            className={current === s ? 'on' : ''}
            aria-label={`Bay ${bayIndex + 1}: ${BAY_STYLE_LABELS[s]}`}
            onClick={() => setStyle(s)}
          >
            {BAY_STYLE_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Kitchen-run controls: bays count, per-bay style, uppers toggle. */
function KitchenControls({
  spec,
  onChange,
}: {
  spec: ParametricSpec
  model: ParametricModel
  onChange: (patch: Partial<ParametricSpec>) => void
}) {
  const lim = PARAMETRIC_LIMITS['kitchen-run']
  const numBays = spec.bays ?? 3
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
          label="Worktop height"
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
          <span>Layout</span>
        </div>
        <div className="fld" style={{ display: 'block', marginBottom: 'var(--s-2)' }}>
          <div
            className="label"
            style={{
              fontSize: 'var(--t-2xs)',
              color: 'var(--text-3)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Bays</span>
            <span>{numBays}</span>
          </div>
          <input
            type="range"
            className="slider"
            aria-label="Bay count"
            min={1}
            max={MAX_KITCHEN_BAYS}
            step={1}
            value={numBays}
            onChange={(e) => {
              const next = Number(e.target.value)
              // Trim or extend compartments array to match new bay count.
              const current: CompartmentConfig[] = Array.from(
                { length: next },
                (_, i) => spec.compartments?.[i] ?? { style: spec.doors ? 'door' : 'open' },
              )
              onChange({ bays: next, compartments: current })
            }}
            style={{ width: '100%' }}
          />
        </div>

        <label className="row" style={{ cursor: 'pointer', marginTop: 'var(--s-2)' }}>
          <div className="rk">Upper cabinets</div>
          <button
            type="button"
            role="switch"
            aria-checked={spec.hasUppers ?? false}
            aria-label="Upper cabinets"
            onClick={() => onChange({ hasUppers: !(spec.hasUppers ?? false) })}
            className={`switch${spec.hasUppers ? ' on' : ''}`}
          />
        </label>
        {spec.hasUppers ? (
          <div
            style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 'var(--s-0)' }}
          >
            35 cm deep, 72 cm tall — wall-mounted above worktop
          </div>
        ) : null}
      </div>

      <div className="sec">
        <div className="sec-h">
          <span>Bay styles</span>
          <span
            style={{
              fontSize: 'var(--t-2xs)',
              color: 'var(--text-3)',
              fontWeight: 400,
              marginLeft: 'var(--s-2)',
            }}
          >
            {numBays} bay{numBays !== 1 ? 's' : ''}
          </span>
        </div>
        <div
          style={{
            fontSize: 'var(--t-2xs)',
            color: 'var(--text-3)',
            marginBottom: 'var(--s-2)',
          }}
        >
          Set each bay to hinged door, stacked drawers, or open shelving.
        </div>
        {Array.from({ length: numBays }, (_, b) => (
          <BayStylePicker key={b} bayIndex={b} bays={numBays} spec={spec} onChange={onChange} />
        ))}
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
              style={{ background: p.color }}
              aria-label={`Finish: ${p.label}`}
              title={p.label}
              onClick={() => onChange({ finish: p.finish, color: p.color })}
            />
          ))}
          <ColorPicker
            value={spec.color}
            ariaLabel="Custom colour"
            title="Custom colour"
            paletteRoomId={null}
            onChange={(hex) => onChange({ color: hex })}
          />
        </div>
      </div>
    </>
  )
}

/** Preset finish swatch row — shared by every controls layout. */
function FinishSection({
  spec,
  onChange,
}: {
  spec: ParametricSpec
  onChange: (patch: Partial<ParametricSpec>) => void
}) {
  return (
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
            style={{ background: p.color }}
            aria-label={`Finish: ${p.label}`}
            title={p.label}
            onClick={() => onChange({ finish: p.finish, color: p.color })}
          />
        ))}
        <ColorPicker
          value={spec.color}
          ariaLabel="Custom colour"
          title="Custom colour"
          paletteRoomId={null}
          onChange={(hex) => onChange({ color: hex })}
        />
      </div>
    </div>
  )
}

/** Per-bay interior fit-out picker for the modular wardrobe. */
function WardrobeFitOutPicker({
  bayIndex,
  bays,
  spec,
  onChange,
}: {
  bayIndex: number
  bays: number
  spec: ParametricSpec
  onChange: (patch: Partial<ParametricSpec>) => void
}) {
  const current = bayFitOut(spec, bayIndex)
  const setFit = (fit: WardrobeFitOut) => {
    const next: WardrobeFitOut[] = Array.from({ length: bays }, (_, i) =>
      i === bayIndex ? fit : bayFitOut(spec, i),
    )
    onChange({ wardrobeFitOuts: next })
  }
  return (
    <div style={{ marginBottom: 'var(--s-1)' }}>
      <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginBottom: 'var(--s-0)' }}>
        Bay {bayIndex + 1}
      </div>
      <div className="seg" style={{ fontSize: 'var(--t-2xs)', flexWrap: 'wrap' }}>
        {WARDROBE_FIT_OUTS.map((f) => (
          <button
            key={f}
            type="button"
            className={current === f ? 'on' : ''}
            aria-label={`Bay ${bayIndex + 1}: ${WARDROBE_FIT_OUT_LABEL[f]}`}
            onClick={() => setFit(f)}
          >
            {WARDROBE_FIT_OUT_LABEL[f]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Modular wardrobe (PAX-like) controls: dimensions, bays, front covering,
 *  per-bay interior fit-out, finish. */
function WardrobeControls({
  spec,
  onChange,
}: {
  spec: ParametricSpec
  model: ParametricModel
  onChange: (patch: Partial<ParametricSpec>) => void
}) {
  const lim = PARAMETRIC_LIMITS.wardrobe
  const numBays = Math.max(1, Math.min(spec.bays ?? 2, MAX_KITCHEN_BAYS))
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
          <span>Layout</span>
        </div>
        <div className="fld" style={{ display: 'block', marginBottom: 'var(--s-2)' }}>
          <div
            className="label"
            style={{
              fontSize: 'var(--t-2xs)',
              color: 'var(--text-3)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Bays</span>
            <span>{numBays}</span>
          </div>
          <input
            type="range"
            className="slider"
            aria-label="Bay count"
            min={1}
            max={MAX_KITCHEN_BAYS}
            step={1}
            value={numBays}
            onChange={(e) => {
              const next = Number(e.target.value)
              const fitOuts: WardrobeFitOut[] = Array.from({ length: next }, (_, i) =>
                bayFitOut(spec, i),
              )
              onChange({ bays: next, wardrobeFitOuts: fitOuts })
            }}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginTop: 'var(--s-2)' }}>
          <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Front
          </div>
          <div className="seg">
            {WARDROBE_FRONTS.map((f: WardrobeFront) => (
              <button
                key={f}
                type="button"
                className={spec.wardrobeFront === f ? 'on' : ''}
                aria-label={`Front: ${WARDROBE_FRONT_LABEL[f]}`}
                onClick={() => onChange({ wardrobeFront: f })}
              >
                {WARDROBE_FRONT_LABEL[f]}
              </button>
            ))}
          </div>
          <div
            style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 'var(--s-0)' }}
          >
            Open removes the doors so the interior fit-out shows.
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="sec-h">
          <span>Interior fit-out</span>
          <span
            style={{
              fontSize: 'var(--t-2xs)',
              color: 'var(--text-3)',
              fontWeight: 400,
              marginLeft: 'var(--s-2)',
            }}
          >
            {numBays} bay{numBays !== 1 ? 's' : ''}
          </span>
        </div>
        <div
          style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginBottom: 'var(--s-2)' }}
        >
          Fit each bay with a hanging rail, a double rail, shelves, drawers, or a shoe rack.
        </div>
        {Array.from({ length: numBays }, (_, b) => (
          <WardrobeFitOutPicker
            key={b}
            bayIndex={b}
            bays={numBays}
            spec={spec}
            onChange={onChange}
          />
        ))}
      </div>

      <FinishSection spec={spec} onChange={onChange} />
    </>
  )
}

/** Dimension sliders + per-type options for the parametric dialog (PF2).
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
  // Kitchen-run + wardrobe have their own dedicated controls layouts.
  if (spec.type === 'kitchen-run') {
    return <KitchenControls spec={spec} model={model} onChange={onChange} />
  }
  if (spec.type === 'wardrobe') {
    return <WardrobeControls spec={spec} model={model} onChange={onChange} />
  }

  const lim = PARAMETRIC_LIMITS[spec.type]
  const autoShelves = spec.shelves === 'auto'
  const isDesk = spec.type === 'desk'
  // Wardrobe + kitchen-run return early above; only bookshelf/sideboard/desk here.
  const showShelves = !isDesk
  const showDoors = spec.type !== 'bookshelf' && !isDesk
  const showBase = spec.type === 'sideboard'
  // Per-compartment config: available for the sideboard when there are bays.
  const showCompartments = spec.type === 'sideboard' && model.bays > 0
  const showDeskLegs = isDesk

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

        {/* Desk: leg style + pedestal drawers */}
        {showDeskLegs ? (
          <>
            <div style={{ marginBottom: 'var(--s-2)' }}>
              <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
                Leg style
              </div>
              <div className="seg">
                {(
                  [
                    ['legs', 'Four legs'],
                    ['pedestal', 'Pedestal'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    className={spec.deskLegs === v ? 'on' : ''}
                    aria-label={`Leg style: ${label}`}
                    onClick={() => onChange({ deskLegs: v })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {spec.deskLegs === 'pedestal' ? (
              <div className="fld" style={{ display: 'block', marginBottom: 'var(--s-2)' }}>
                <div
                  className="label"
                  style={{
                    fontSize: 'var(--t-2xs)',
                    color: 'var(--text-3)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Pedestal drawers</span>
                  <span>{spec.pedestalDrawers}</span>
                </div>
                <input
                  type="range"
                  className="slider"
                  aria-label="Pedestal drawer count"
                  min={1}
                  max={MAX_PEDESTAL_DRAWERS}
                  step={1}
                  value={spec.pedestalDrawers}
                  onChange={(e) => onChange({ pedestalDrawers: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {/* Shelves (bookshelf + sideboard) */}
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

        {/* Doors global default (sideboard when no compartment config) */}
        {showDoors ? (
          <label className="row" style={{ cursor: 'pointer', marginTop: 'var(--s-2)' }}>
            <div
              className="rk"
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--s-0)' }}
            >
              <div>Doors</div>
              {model.doorCount > 0 ? (
                <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', fontWeight: 500 }}>
                  {model.doorCount} leaves (each ≤ 60 cm)
                </div>
              ) : model.drawerCount > 0 ? (
                <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', fontWeight: 500 }}>
                  {model.drawerCount} drawer{model.drawerCount !== 1 ? 's' : ''}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={spec.doors}
              aria-label="Doors"
              onClick={() =>
                onChange({
                  doors: !spec.doors,
                  // Clear per-bay overrides so the new global applies cleanly.
                  compartments: [],
                })
              }
              className={`switch${spec.doors ? ' on' : ''}`}
            />
          </label>
        ) : null}

        {/* Sideboard base style */}
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

        {model.bays > 1 && !showCompartments ? (
          <div
            style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 'var(--s-2)' }}
          >
            {model.bays} bays — a centre divider keeps wide shelves supported.
          </div>
        ) : null}
      </div>

      {/* Per-compartment config (wardrobe + sideboard only) */}
      {showCompartments ? (
        <div className="sec">
          <div className="sec-h">
            <span>Compartments</span>
            <span
              style={{
                fontSize: 'var(--t-2xs)',
                color: 'var(--text-3)',
                fontWeight: 400,
                marginLeft: 'var(--s-2)',
              }}
            >
              {model.bays} bay{model.bays !== 1 ? 's' : ''}
            </span>
          </div>
          <div
            style={{
              fontSize: 'var(--t-2xs)',
              color: 'var(--text-3)',
              marginBottom: 'var(--s-2)',
            }}
          >
            Set each bay to open shelf, hinged door, or stacked drawers. Default follows the Doors
            toggle above.
          </div>
          {Array.from({ length: model.bays }, (_, b) => (
            <BayStylePicker
              key={b}
              bayIndex={b}
              bays={model.bays}
              spec={spec}
              onChange={onChange}
            />
          ))}
        </div>
      ) : null}

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
              style={{ background: p.color }}
              aria-label={`Finish: ${p.label}`}
              title={p.label}
              onClick={() => onChange({ finish: p.finish, color: p.color })}
            />
          ))}
          <ColorPicker
            value={spec.color}
            ariaLabel="Custom colour"
            title="Custom colour"
            paletteRoomId={null}
            onChange={(hex) => onChange({ color: hex })}
          />
        </div>
      </div>
    </>
  )
}
