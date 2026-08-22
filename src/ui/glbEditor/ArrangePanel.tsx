import { useState } from 'react'
import type { Axis3 } from '../../furniture/glbEdit/arrange'
import type { LinearArrayAxis } from '../../furniture/glbEdit/arrayBuild'
import { Disclosure } from '../controls/Disclosure'
import { Segmented } from '../controls/Segmented'
import { Icon } from '../toolbar/icons'
import { useDesigner } from './designerContext'

const AXES: { value: Axis3; label: string }[] = [
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
  { value: 'z', label: 'Z' },
]

/** Linear + radial array controls, tucked in a Disclosure to keep the section
 *  compact. Duplicates the selection (parts or the selected group) into a named
 *  "Array" group in one undo step. */
function ArraySection() {
  const { arrayLinear, arrayRadial } = useDesigner()
  const [linCount, setLinCount] = useState(4)
  const [gap, setGap] = useState(0.3)
  const [axis, setAxis] = useState<LinearArrayAxis>('x')
  const [radCount, setRadCount] = useState(6)
  const [radius, setRadius] = useState(0.5)
  const [sweep, setSweep] = useState(360)
  // `.sec` is the section frame its sibling glbEditor panels use (Details /
  // Components / Make configurable). This passed `arrange-array`, a class no
  // stylesheet defines, so the panel rendered without the frame (UIUX-79).
  return (
    <Disclosure summary="Array" className="sec">
      <div className="arrange-array-grid">
        {/* Linear */}
        <div className="label">Linear</div>
        <div style={{ display: 'flex', gap: 'var(--s-1)', alignItems: 'center' }}>
          <input
            type="number"
            className="input"
            min={1}
            max={50}
            step={1}
            value={linCount}
            aria-label="Linear array count"
            onChange={(e) => setLinCount(Number(e.target.value))}
            style={{ width: '30%' }}
          />
          <input
            type="number"
            className="input"
            step={0.05}
            value={gap}
            aria-label="Linear array gap"
            title="Edge gap: clear space left between adjacent copies"
            onChange={(e) => setGap(Number(e.target.value))}
            style={{ width: '30%' }}
          />
          <Segmented
            ariaLabel="Linear array axis"
            value={axis}
            onChange={(v) => setAxis(v as LinearArrayAxis)}
            options={AXES}
            fit
          />
        </div>
        <button
          type="button"
          className="btn btn-soft btn-block"
          aria-label="Create linear array"
          onClick={() => arrayLinear({ count: linCount, gap, axis })}
        >
          Linear array
        </button>
        {/* Radial */}
        <div
          className="label"
          style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 'var(--s-1)' }}
        >
          Radial
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-1)', alignItems: 'center' }}>
          <input
            type="number"
            className="input"
            min={2}
            max={36}
            step={1}
            value={radCount}
            aria-label="Radial array count"
            onChange={(e) => setRadCount(Number(e.target.value))}
            style={{ width: '33%' }}
          />
          <input
            type="number"
            className="input"
            min={0.05}
            step={0.05}
            value={radius}
            aria-label="Radial array radius"
            onChange={(e) => setRadius(Number(e.target.value))}
            style={{ width: '33%' }}
          />
          <input
            type="number"
            className="input"
            min={1}
            max={360}
            step={15}
            value={sweep}
            aria-label="Radial array sweep"
            onChange={(e) => setSweep(Number(e.target.value))}
            style={{ width: '33%' }}
          />
        </div>
        <button
          type="button"
          className="btn btn-soft btn-block"
          aria-label="Create radial array"
          onClick={() => arrayRadial({ count: radCount, radius, sweepDeg: sweep })}
        >
          Radial array
        </button>
      </div>
    </Disclosure>
  )
}

/**
 * Stage 4 "Arrange" section — appears whenever ≥1 shape (or a group) is selected.
 * Align + distribute the selected parts on an axis (align ≥2, distribute ≥3),
 * mirror across the asset centre on X or Z, and linear/radial array the
 * selection. Purely presentational — the designer context owns the spec.
 */
export function ArrangePanel() {
  const { selCount, arraySourceCount, alignSelection, distributeSelection, mirrorAxis } =
    useDesigner()
  const [axis, setAxis] = useState<Axis3>('x')
  // Nothing selected → nothing to arrange.
  if (selCount < 1 && arraySourceCount < 1) return null

  return (
    <div className="sec">
      <div className="sec-h">
        <span>Arrange</span>
      </div>

      {/* Align + distribute — only meaningful with ≥2 parts selected. */}
      {selCount >= 2 ? (
        <div style={{ display: 'grid', gap: 'var(--s-1)', marginBottom: 'var(--s-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              Axis
            </span>
            <Segmented
              ariaLabel="Arrange axis"
              value={axis}
              onChange={(v) => setAxis(v as Axis3)}
              options={AXES}
              fit
            />
          </div>
          <div className="action-grid">
            <button
              type="button"
              className="act"
              aria-label={`Align min on ${axis.toUpperCase()}`}
              onClick={() => alignSelection(axis, 'min')}
            >
              Align min
            </button>
            <button
              type="button"
              className="act"
              aria-label={`Align centre on ${axis.toUpperCase()}`}
              onClick={() => alignSelection(axis, 'center')}
            >
              Align centre
            </button>
            <button
              type="button"
              className="act"
              aria-label={`Align max on ${axis.toUpperCase()}`}
              onClick={() => alignSelection(axis, 'max')}
            >
              Align max
            </button>
          </div>
          <button
            type="button"
            className="act"
            disabled={selCount < 3}
            aria-label={`Distribute on ${axis.toUpperCase()}`}
            title={
              selCount < 3
                ? 'Select 3+ shapes to distribute'
                : 'Space the selected shapes evenly on this axis'
            }
            onClick={() => distributeSelection(axis)}
          >
            <Icon.Distribute width={13} height={13} /> Distribute
          </button>
        </div>
      ) : null}

      {/* Mirror across the asset centre — any selection ≥1. */}
      {selCount >= 1 ? (
        <div className="action-grid two" style={{ marginBottom: 'var(--s-2)' }}>
          <button
            type="button"
            className="act"
            aria-label="Mirror X"
            title="Mirror the selection across the left↔right centre plane"
            onClick={() => mirrorAxis('x')}
          >
            <Icon.FlipH width={13} height={13} /> Mirror X
          </button>
          <button
            type="button"
            className="act"
            aria-label="Mirror Z"
            title="Mirror the selection across the front↔back centre plane"
            onClick={() => mirrorAxis('z')}
          >
            <Icon.FlipV width={13} height={13} /> Mirror Z
          </button>
        </div>
      ) : null}

      {arraySourceCount >= 1 ? <ArraySection /> : null}
    </div>
  )
}
