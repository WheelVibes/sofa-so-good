import { useEffect, useMemo, useState } from 'react'
import { type RescaleSpec, resolveRescaleFactor } from '../../floorplan/rescalePlan'
import { planTotalArea, wallLength } from '../../floorplan/types'
import { useStore } from '../../state/store'
import { formatArea, formatLength } from '../../utils/measurement'
import { Select } from '../controls/Select'
import { Modal } from '../Modal'

type Mode = 'factor' | 'target'

/**
 * Scale-the-plan dialog (PARITY-PLAN-SCALE). Two ways to fix a wrong-scale plan
 * or resize to a known dimension, in one undoable action:
 *   - "By factor" — multiply every dimension by a number (2 = double, 0.5 = half).
 *   - "To a length" — pick a reference wall and type its real length; the factor
 *     is `target / current`, so that wall ends up exactly the typed length and the
 *     whole plan scales with it.
 * Furniture POSITIONS move with the plan; SIZES are preserved by default (the
 * checkbox opts into scaling sizes too, for a whole-design rescale).
 */
export function ScalePlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const plan = useStore((s) => s.floorPlan)
  const units = useStore((s) => s.units)

  // Every wall across all storeys, longest first — long walls make the clearest
  // reference for a target length, and the longest is a sensible default.
  const walls = useMemo(() => {
    const all = [...plan.walls, ...(plan.upperLevels ?? []).flatMap((l) => l.walls)]
    return all
      .map((w) => ({ id: w.id, name: w.name, len: wallLength(w) }))
      .filter((w) => w.len > 1e-6)
      .sort((a, b) => b.len - a.len)
  }, [plan])

  const [mode, setMode] = useState<Mode>('factor')
  const [factorStr, setFactorStr] = useState('2')
  const [wallId, setWallId] = useState('')
  const [targetStr, setTargetStr] = useState('')
  const [scaleFurnitureSize, setScaleFurnitureSize] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seed the reference wall (+ its current length as the target placeholder)
  // whenever the modal opens or the wall set changes.
  useEffect(() => {
    if (!open) return
    setMode('factor')
    setFactorStr('2')
    setScaleFurnitureSize(false)
    setError(null)
    const first = walls[0]
    setWallId(first?.id ?? '')
    setTargetStr(first ? first.len.toFixed(2) : '')
  }, [open, walls])

  if (!open) return null

  const refWall = walls.find((w) => w.id === wallId) ?? walls[0]

  // Build the spec for the active mode (or null when the inputs aren't valid yet).
  const spec: RescaleSpec | null = (() => {
    if (mode === 'factor') {
      const f = Number(factorStr)
      return Number.isFinite(f) && f > 0 ? f : null
    }
    const t = Number(targetStr)
    if (!refWall || !Number.isFinite(t) || t <= 0) return null
    return { anchorWallId: refWall.id, targetLength: t }
  })()

  // Resolve the factor for the live preview (and to surface a friendly error).
  let factor: number | null = null
  try {
    if (spec !== null) factor = resolveRescaleFactor(plan, spec)
  } catch {
    factor = null
  }

  const areaBefore = planTotalArea(plan)
  const canApply = factor !== null && Math.abs(factor - 1) > 1e-9

  const apply = () => {
    if (spec === null) return
    try {
      useStore.getState().rescaleFloorPlan(spec, { scaleFurnitureSize })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not scale the plan')
    }
  }

  return (
    <Modal open onClose={onClose} title="Scale plan" width="var(--modal-sm)">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          apply()
        }}
        className="flex flex-col gap-3"
      >
        <div className="seg" role="tablist" aria-label="Scale mode">
          <button
            type="button"
            className={mode === 'factor' ? 'on' : ''}
            aria-pressed={mode === 'factor'}
            onClick={() => setMode('factor')}
          >
            By factor
          </button>
          <button
            type="button"
            className={mode === 'target' ? 'on' : ''}
            aria-pressed={mode === 'target'}
            onClick={() => setMode('target')}
            disabled={walls.length === 0}
          >
            To a length
          </button>
        </div>

        {mode === 'factor' ? (
          <label className="flex flex-col gap-1 text-xs">
            <span className="label">Factor</span>
            <input
              className="input"
              type="number"
              // step="any": with a numeric step, the untouched DEFAULT value '2'
              // fails native stepMismatch (0.01 + n×0.1 never equals 2) and the
              // form's submit silently no-ops — the dialog's most common action.
              step="any"
              min={0.01}
              value={factorStr}
              onChange={(e) => setFactorStr(e.target.value)}
              aria-label="Scale factor"
            />
            <span style={{ color: 'var(--text-3)' }}>
              Multiplies every dimension. 2 = double, 0.5 = half.
            </span>
          </label>
        ) : (
          <>
            <div className="flex flex-col gap-1 text-xs">
              <span className="label">Reference wall</span>
              <Select
                className="input"
                value={refWall?.id ?? ''}
                onChange={(v) => {
                  setWallId(v)
                  const w = walls.find((x) => x.id === v)
                  if (w) setTargetStr(w.len.toFixed(2))
                }}
                ariaLabel="Reference wall"
                options={walls.map((w) => ({
                  value: w.id,
                  label: `${w.name ?? 'Wall'} — ${formatLength(w.len, units)}`,
                }))}
              />
            </div>
            <label className="flex flex-col gap-1 text-xs">
              <span className="label">Real length (m)</span>
              <input
                className="input"
                type="number"
                // step="any": the seeded default is the wall's real length
                // (w.len.toFixed(2), e.g. 3.47) which fails a 0.05 step's
                // native validation the same way as the factor input above.
                step="any"
                min={0.05}
                value={targetStr}
                onChange={(e) => setTargetStr(e.target.value)}
                aria-label="Target length in metres"
              />
              <span style={{ color: 'var(--text-3)' }}>
                Currently {refWall ? formatLength(refWall.len, units) : '—'}. The whole plan scales
                so this wall measures the typed length.
              </span>
            </label>
          </>
        )}

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={scaleFurnitureSize}
            onChange={(e) => setScaleFurnitureSize(e.target.checked)}
          />
          <span>Also resize furniture (not just reposition)</span>
        </label>

        {factor !== null ? (
          <div className="text-xs" style={{ color: 'var(--text-2)' }}>
            New scale: <b style={{ color: 'var(--text)' }}>×{factor.toFixed(3)}</b>. Total area{' '}
            {formatArea(areaBefore, units)} → {formatArea(areaBefore * factor * factor, units)}.
          </div>
        ) : null}

        {error ? (
          <div className="text-xs" style={{ color: 'var(--danger, var(--text-2))' }}>
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-accent" disabled={!canApply}>
            Scale
          </button>
        </div>
      </form>
    </Modal>
  )
}
