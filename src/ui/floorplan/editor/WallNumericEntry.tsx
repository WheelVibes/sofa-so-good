/**
 * WallNumericEntry — numeric length + angle overlay while drawing a wall.
 *
 * Shows a small floating panel near the cursor while a wall draft is active
 * (start placed, user positioning the end). Fields:
 *   - Length  (metric "m" or imperial; accepts "3.5", "3.5m", "3' 6\"", etc.)
 *   - Angle   (degrees, 0 = right/+X, 90 = down/+Z; matches the editor's
 *              `Math.atan2(dz, dx)` convention)
 *
 * Behaviour:
 *   - Dragging updates the numeric fields live.
 *   - Typing in a field updates the draft preview live.
 *   - Enter (in either field) commits the wall.
 *   - Tab moves from Length → Angle.
 *   - Escape cancels (clears the draft; the parent handles it via onEscape).
 *   - The overlay is positioned near the cursor endpoint, offset so it doesn't
 *     obscure the point being placed; clamped inside the canvas.
 *
 * The component MUST be gated by the `wallNumericEntry` feature flag before
 * rendering (the parent FloorPlanEditor handles the gate).
 */
import { useEffect, useRef, useState } from 'react'
import {
  endpointFromLengthAngle,
  parseAngleInput,
  parseLengthInput,
  segmentLengthAngle,
  validateAngle,
  validateLength,
} from '../../../floorplan/wallNumericEntry'
import type { UnitSystem } from '../../../utils/measurement'
import { formatLength } from '../../../utils/measurement'
import { wallEntryOverlayPos } from './wallEntryPlacement'

export interface WallNumericEntryProps {
  /** World-space start point of the draft wall. */
  start: [number, number]
  /** Current world-space end point (from pointer drag). */
  end: [number, number]
  /** Current unit system (metric or imperial). */
  units: UnitSystem
  /** Screen-px position of the end point (for overlay positioning). */
  endScreenPx: [number, number]
  /** Called when the user commits a specific endpoint. */
  onCommit: (endpoint: [number, number]) => void
  /** Called when the user presses Escape (cancel the draft). */
  onEscape: () => void
  /** Called while the user types, to update the live preview endpoint. */
  onPreview: (endpoint: [number, number]) => void
}

/**
 * Format a length value for display in the numeric entry field.
 * Uses the same `formatLength` helper but strips the unit suffix so the field
 * is editable (user re-types a raw number or imperial expression).
 */
function displayLength(metres: number, units: UnitSystem): string {
  if (!Number.isFinite(metres) || metres <= 0) return ''
  if (units === 'imperial') {
    // "8′ 6″" → user can re-type it directly
    return formatLength(metres, 'imperial')
  }
  // Metric: "2.60" (no " m" so the field is a plain editable number)
  return metres.toFixed(3).replace(/\.?0+$/, '') || ''
}

export function WallNumericEntry({
  start,
  end,
  units,
  endScreenPx,
  onCommit,
  onEscape,
  onPreview,
}: WallNumericEntryProps) {
  const { length: derivedLength, angle: derivedAngle } = segmentLengthAngle(start, end)

  // Local edit state — mirrors the drag live, but allows the user to override.
  const [lengthText, setLengthText] = useState(() => displayLength(derivedLength, units))
  const [angleText, setAngleText] = useState(() => derivedAngle.toFixed(1))
  // Whether the user has "taken ownership" of the field (typed into it).
  // When false, the drag updates the field; when true, typing drives the preview.
  const [lengthOwned, setLengthOwned] = useState(false)
  const [angleOwned, setAngleOwned] = useState(false)

  const lengthRef = useRef<HTMLInputElement>(null)
  const angleRef = useRef<HTMLInputElement>(null)

  // Focus the length field on mount (avoids the lint-rejected `autoFocus` attr).
  useEffect(() => {
    lengthRef.current?.focus()
    lengthRef.current?.select()
  }, [])

  // Sync unowned fields when drag updates the endpoint.
  useEffect(() => {
    const { length: l, angle: a } = segmentLengthAngle(start, end)
    if (!lengthOwned) setLengthText(displayLength(l, units))
    if (!angleOwned) setAngleText(a.toFixed(1))
  }, [start, end, units, lengthOwned, angleOwned])

  // Recompute the preview endpoint whenever text fields change.
  // Both fields must parse successfully; otherwise we leave the preview alone.
  const computePreview = (lt: string, at: string): [number, number] | null => {
    const len = parseLengthInput(lt)
    const ang = parseAngleInput(at)
    if (!len || Number.isNaN(len) || len <= 0) return null
    const resolvedAngle = ang !== null && !Number.isNaN(ang) ? ang : derivedAngle
    return endpointFromLengthAngle(start, len, resolvedAngle)
  }

  const handleLengthChange = (v: string) => {
    setLengthText(v)
    setLengthOwned(true)
    const pt = computePreview(v, angleText)
    if (pt) onPreview(pt)
  }

  const handleAngleChange = (v: string) => {
    setAngleText(v)
    setAngleOwned(true)
    const pt = computePreview(lengthText, v)
    if (pt) onPreview(pt)
  }

  const tryCommit = () => {
    const len = parseLengthInput(lengthText)
    const ang = parseAngleInput(angleText)
    if (len === null) return // empty field — nothing to commit
    const lenErr = validateLength(len)
    if (lenErr) return // invalid — ignore
    const angErr = validateAngle(ang)
    if (angErr) return // invalid angle — ignore
    const resolvedAngle = ang !== null ? ang : derivedAngle
    onCommit(endpointFromLengthAngle(start, len, resolvedAngle))
    // Reset ownership so the next drag-start gives a clean slate.
    setLengthOwned(false)
    setAngleOwned(false)
  }

  // Validation messages (shown inline for user feedback).
  const lenVal = parseLengthInput(lengthText)
  const angVal = parseAngleInput(angleText)
  const lenError = lengthOwned && lengthText !== '' ? validateLength(lenVal) : null
  const angError = angleOwned && angleText !== '' ? validateAngle(angVal) : null

  // Keyboard handling: Enter commits, Tab moves between fields, Esc cancels.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      tryCommit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onEscape()
    } else if (e.key === 'Tab') {
      // Let Tab's native focus behaviour run — the only customisation is
      // preventing the event from bubbling to the SVG's canvas logic.
      e.stopPropagation()
    }
  }

  // Overlay positioning (pure geometry + the on-screen clamp live in
  // `wallEntryPlacement.ts`; the endpoint can be off-canvas after a pan).
  const { left, top } = wallEntryOverlayPos({
    endScreenPx,
    panelW: 200,
    // Grows when the validation row shows — exactly when the panel is tallest.
    panelH: 74 + (lenError || angError ? 18 : 0),
    margin: 12,
    vw: window.innerWidth,
    vh: window.innerHeight,
  })

  return (
    // Portal out to `document.body` level is not needed: the overlay sits in the
    // canvas wrapper (which has `position: relative`), and we use `fixed` so it
    // follows the screen position regardless of scroll.
    <div
      className="panel wall-num"
      style={{ left, top }}
      // Stop pointer events from bubbling into the SVG canvas.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Length field */}
      <label>
        <span className="panel-sub plain wall-num-l">Length</span>
        <input
          ref={lengthRef}
          className="input mono"
          type="text"
          inputMode="decimal"
          value={lengthText}
          onChange={(e) => handleLengthChange(e.target.value)}
          onFocus={() => {
            setLengthOwned(true)
            lengthRef.current?.select()
          }}
          onKeyDown={handleKeyDown}
          placeholder={units === 'imperial' ? 'e.g. 3\' 6"' : 'e.g. 2.5'}
          aria-label="Wall length"
          aria-invalid={lenError ? 'true' : undefined}
        />
      </label>
      {/* Angle field */}
      <label>
        <span className="panel-sub plain wall-num-l">Angle °</span>
        <input
          ref={angleRef}
          className="input mono"
          type="text"
          inputMode="decimal"
          value={angleText}
          onChange={(e) => handleAngleChange(e.target.value)}
          onFocus={() => {
            setAngleOwned(true)
            angleRef.current?.select()
          }}
          onKeyDown={handleKeyDown}
          placeholder="0–360"
          aria-label="Wall angle in degrees"
          aria-invalid={angError ? 'true' : undefined}
        />
      </label>
      {/* Validation error hint */}
      {(lenError || angError) && (
        <span className="wall-num-err" role="alert">
          {lenError ?? angError}
        </span>
      )}
    </div>
  )
}
