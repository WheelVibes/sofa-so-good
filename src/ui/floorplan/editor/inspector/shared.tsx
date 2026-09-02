import { useState } from 'react'
import { defaultToleranceMm } from '../../../../floorplan/siteMeasurements'
import type { CeilingConfig, CeilingStyle, MeasuredTargetKind } from '../../../../floorplan/types'
import { useStore } from '../../../../state/store'
import { ColorPicker } from '../../../controls/ColorPicker'

/** Numeric field with a label, editing one metre value. Holds the raw text while
 *  focused so the user can clear / type a partial value ("1.", "-") freely, and
 *  only commits a *finite* number — so a blank/NaN field never reaches the plan
 *  geometry (which would make a degenerate room/wall and break save/render). */
export function Num({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  placeholder,
}: {
  label: string
  /** `undefined` renders an empty field (showing `placeholder` if given) —
   *  the "this field has no explicit value, a default applies" state (e.g. a
   *  MEP point's unset `mountHeightMm`, MEP layer G1 PR3). */
  value: number | undefined
  onChange: (v: number) => void
  step?: number
  min?: number
  /** Shown in the empty field when `value` is `undefined` (e.g. "300" for a
   *  socket's default mount height) — NOT committed until the user types. */
  placeholder?: string
}) {
  const committed =
    value != null && Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : ''
  const [text, setText] = useState<string | null>(null)
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="label">{label}</span>
      <input
        type="number"
        // While focused (text !== null) show the raw input; otherwise the
        // committed value, so a re-render doesn't fight the user mid-edit.
        value={text ?? committed}
        step={step}
        min={min}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number.parseFloat(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        onBlur={() => setText(null)}
        className="input mono"
        style={{ width: 96, textAlign: 'right' }}
      />
    </label>
  )
}

const CEILING_STYLES: { id: CeilingStyle; label: string }[] = [
  { id: 'flat', label: 'Flat' },
  { id: 'tray', label: 'Tray' },
  { id: 'coffered', label: 'Coffered' },
  { id: 'dropped', label: 'Dropped' },
  { id: 'sloped', label: 'Sloped' },
]

/** Per-room ceiling-treatment editor: style picker + style-specific params +
 *  a perimeter cove-light toggle. Writes through `setRoomCeiling` (coalesced). */
export function CeilingControls({
  roomId,
  style,
  config,
}: {
  roomId: string
  style: CeilingStyle
  config?: CeilingConfig
}) {
  const set = (patch: Partial<CeilingConfig> | null) =>
    useStore.getState().setRoomCeiling(roomId, patch)
  const drop = config?.drop ?? 0.15
  const margin = config?.margin ?? 0.35
  const grid = config?.grid ?? [2, 2]
  return (
    <>
      <div className="sec-h" style={{ marginTop: 'var(--s-2)' }}>
        <span>Ceiling style</span>
      </div>
      <div className="seg">
        {CEILING_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`seg-btn${style === s.id ? ' on' : ''}`}
            onClick={() => set(s.id === 'flat' ? null : { style: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>
      {style === 'sloped' ? (
        <>
          <Num
            label="Fall / rise (m)"
            value={config?.slope?.rise ?? 0.4}
            step={0.05}
            min={0.05}
            onChange={(v) =>
              set({
                slope: { axis: config?.slope?.axis ?? 'x', rise: Math.max(0.05, Math.min(1.5, v)) },
              })
            }
          />
          <div className="seg" style={{ marginTop: 'var(--s-1)' }}>
            {(['x', 'z'] as const).map((ax) => (
              <button
                key={ax}
                type="button"
                className={`seg-btn${(config?.slope?.axis ?? 'x') === ax ? ' on' : ''}`}
                onClick={() => set({ slope: { axis: ax, rise: config?.slope?.rise ?? 0.4 } })}
              >
                {ax === 'x' ? 'Falls along X' : 'Falls along Z'}
              </button>
            ))}
          </div>
        </>
      ) : style !== 'flat' ? (
        <>
          {style !== 'coffered' ? (
            <Num
              label="Border / inset (m)"
              value={margin}
              step={0.05}
              min={0.1}
              onChange={(v) => set({ margin: Math.max(0.1, v) })}
            />
          ) : null}
          <Num
            label="Depth (m)"
            value={drop}
            step={0.02}
            min={0.03}
            onChange={(v) => set({ drop: Math.max(0.03, Math.min(0.4, v)) })}
          />
          {style === 'coffered' ? (
            <div className="flex gap-2">
              <Num
                label="Columns"
                value={grid[0]}
                step={1}
                min={1}
                onChange={(v) => set({ grid: [Math.max(1, Math.round(v)), grid[1]] })}
              />
              <Num
                label="Rows"
                value={grid[1]}
                step={1}
                min={1}
                onChange={(v) => set({ grid: [grid[0], Math.max(1, Math.round(v))] })}
              />
            </div>
          ) : null}
          {style === 'tray' || style === 'dropped' ? (
            <label className="flex items-center gap-2" style={{ marginTop: 'var(--s-2)' }}>
              <input
                type="checkbox"
                checked={!!config?.coveLight}
                onChange={(e) => set({ coveLight: e.target.checked })}
              />
              <span>Cove light</span>
              {config?.coveLight ? (
                <ColorPicker
                  ariaLabel="Cove light colour"
                  value={config?.coveColor ?? '#ffe6c0'}
                  onChange={(hex) => set({ coveColor: hex })}
                  paletteRoomId={roomId}
                  style={{ marginLeft: 'auto' }}
                />
              ) : null}
            </label>
          ) : null}
        </>
      ) : null}
    </>
  )
}

export function DeleteBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-danger btn-block"
      style={{ marginTop: 'var(--s-1)' }}
    >
      {label}
    </button>
  )
}

/** Custom-name field shared by the wall / door / window inspectors. Mirrors the
 *  furniture inspector: a placeholder shows the generated default, and clearing
 *  the field falls back to it (a blank name is stored as `undefined`). */
export function NameField({
  value,
  placeholder,
  onChange,
}: {
  value?: string
  placeholder: string
  onChange: (v: string | undefined) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="label" style={{ whiteSpace: 'nowrap' }}>
        Name
      </span>
      <input
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        aria-label="Custom name"
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)}
        className="input"
        style={{ flex: 1, minWidth: 0 }}
      />
    </label>
  )
}

/** One cell of the inspector action grid (mirrors the furniture inspector's
 *  `.act` buttons): an icon over a label, with `on` / `danger` / `disabled`. */
export function ActBtn({
  label,
  icon,
  onClick,
  on,
  danger,
  disabled,
  title,
}: {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  on?: boolean
  danger?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      className={`act${on ? ' on' : ''}${danger ? ' danger' : ''}`}
      onClick={() => !disabled && onClick()}
      disabled={disabled}
      title={title}
    >
      {icon}
      {label}
    </button>
  )
}

/**
 * Record what a tape actually read for one dimension, and show the deviation
 * from the drawing immediately.
 *
 * The instant feedback is the point: a user measuring a flat wants to know THERE
 * AND THEN whether the model is wrong, not when they later open the drawing set.
 * An out-of-tolerance value reads as a warning inline, so the discrepancy is
 * caught while they are still standing in the room with the tape.
 *
 * Empty input clears the measurement rather than storing 0 — an unmeasured
 * dimension and a dimension measured as zero are different things.
 */
export function SiteMeasuredField({
  kind,
  targetId,
  modelMm,
}: {
  kind: MeasuredTargetKind
  targetId: string
  modelMm: number
}) {
  const measurements = useStore((s) => s.floorPlan.siteMeasurements)
  const setSiteMeasurement = useStore((s) => s.setSiteMeasurement)
  const clearSiteMeasurement = useStore((s) => s.clearSiteMeasurement)
  const existing = (measurements ?? []).find((m) => m.kind === kind && m.targetId === targetId)

  const deviation = existing ? existing.measuredMm - modelMm : null
  const tolerance = existing?.toleranceMm ?? defaultToleranceMm(modelMm)
  const exceeds = deviation !== null && Math.abs(deviation) > tolerance

  return (
    <div className="space-y-1" style={{ marginTop: 'var(--s-1)' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }}>
        <span style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          Measured on site (mm)
        </span>
        <input
          className="input tabular-nums"
          type="number"
          inputMode="numeric"
          value={existing ? existing.measuredMm : ''}
          placeholder={`${modelMm} as drawn`}
          onChange={(e) => {
            const raw = e.target.value.trim()
            if (raw === '') {
              if (existing) clearSiteMeasurement(kind, targetId)
              return
            }
            const v = Number(raw)
            if (Number.isFinite(v) && v > 0) setSiteMeasurement(kind, targetId, v)
          }}
        />
      </label>
      {deviation !== null && (
        <div
          className="tabular-nums"
          style={{
            fontSize: 'var(--t-2xs)',
            color: exceeds ? 'var(--danger)' : 'var(--text-3)',
            fontWeight: exceeds ? 700 : 500,
          }}
        >
          {deviation === 0
            ? `Matches the drawing (±${tolerance} mm allowed).`
            : `${deviation > 0 ? '+' : ''}${deviation} mm vs drawn ${modelMm} mm — ${
                exceeds ? `EXCEEDS the ±${tolerance} mm tolerance` : `within ±${tolerance} mm`
              }.`}
        </div>
      )}
    </div>
  )
}
