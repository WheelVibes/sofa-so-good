import { useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { normalizeHex } from '../../materials/colorHarmony'
import { useStore } from '../../state/store'
import { ThemeColorRows } from '../color/ThemeColorRows'
import { Modal } from '../Modal'
import { Popover } from '../toolbar/Popover'
import { useIsMobile } from '../useIsMobile'
import { hexToHsv, hsvToHex } from './colorConvert'

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
  ariaLabel?: string
  /** Room context for the ThemeColorRows palette; `null` forces the master
   *  palette regardless of selection. Omit to follow the selected room. */
  paletteRoomId?: string | null
  disabled?: boolean
  /** Extra classes for the swatch trigger (kept minimal — base look is built in). */
  className?: string
  /** Inline styles merged onto the swatch trigger (after its background colour). */
  style?: React.CSSProperties
  title?: string
}

/**
 * Themed replacement for `<input type="color">`. The trigger is a colour swatch;
 * the editor opens in an anchored {@link Popover} on desktop / titled {@link Modal}
 * sheet on mobile and offers a saturation/value pad + hue bar + hex field, plus
 * the shared {@link ThemeColorRows} (apartment + recommended) and a recent-colours
 * row. Conversions use the pure `colorConvert` (HSV) + `normalizeHex` helpers.
 */
export function ColorPicker({
  value,
  onChange,
  ariaLabel,
  paletteRoomId,
  disabled,
  className,
  style,
  title,
}: ColorPickerProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const recent = useStore(useShallow((s) => s.recentColors))
  const pushRecent = useStore((s) => s.pushRecentColor)

  const norm = normalizeHex(value) ?? '#000000'
  const close = () => {
    setOpen(false)
    // Remember the colour the editor closed on for quick reuse.
    pushRecent(norm)
    anchorRef.current?.focus()
  }

  const editor = (
    <ColorEditor value={norm} onChange={onChange} paletteRoomId={paletteRoomId} recent={recent} />
  )

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        disabled={disabled}
        className={`color-trigger${className ? ` ${className}` : ''}`}
        style={{ backgroundColor: norm, ...style }}
        aria-label={ariaLabel ?? `Colour ${norm}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        onClick={() => (open ? close() : setOpen(true))}
      />
      {open && isMobile ? (
        <Modal open onClose={close} title={ariaLabel ?? 'Colour'}>
          <div className="color-sheet">{editor}</div>
        </Modal>
      ) : open ? (
        <Popover open anchorRef={anchorRef} onClose={close}>
          <div className="pop-panel color-panel">{editor}</div>
        </Popover>
      ) : null}
    </>
  )
}

function ColorEditor({
  value,
  onChange,
  paletteRoomId,
  recent,
}: {
  value: string
  onChange: (hex: string) => void
  paletteRoomId?: string | null
  recent: string[]
}) {
  // HSV drives the pad + hue bar; derive once from the incoming hex. We keep the
  // hex text in its own state so a half-typed value doesn't fight the swatches.
  const hsv = hexToHsv(value) ?? { h: 0, s: 0, v: 0 }
  const [hexText, setHexText] = useState(value)
  const padRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)

  const emit = (h: number, s: number, v: number) => {
    const hex = hsvToHex({ h, s, v })
    setHexText(hex)
    onChange(hex)
  }

  const padPointer = (e: React.PointerEvent) => {
    const el = padRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    const r = el.getBoundingClientRect()
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const v = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))
    emit(hsv.h, s, v)
  }
  const huePointer = (e: React.PointerEvent) => {
    const el = hueRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    const r = el.getBoundingClientRect()
    const h = Math.min(360, Math.max(0, (e.clientX - r.left) / r.width)) * 360
    emit(h, hsv.s, hsv.v)
  }
  const dragging = (e: React.PointerEvent, fn: (e: React.PointerEvent) => void) => {
    if (e.buttons !== 1) return
    fn(e)
  }

  return (
    <div className="color-editor">
      {/* Saturation (x) / value (y) pad for the current hue. */}
      <div
        ref={padRef}
        className="color-pad"
        style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
        onPointerDown={padPointer}
        onPointerMove={(e) => dragging(e, padPointer)}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={value}
        tabIndex={0}
      >
        <span
          className="color-pad-thumb"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      {/* Hue bar. */}
      <div
        ref={hueRef}
        className="color-hue"
        onPointerDown={huePointer}
        onPointerMove={(e) => dragging(e, huePointer)}
        role="slider"
        aria-label="Hue"
        aria-valuenow={Math.round(hsv.h)}
        aria-valuemin={0}
        aria-valuemax={360}
        tabIndex={0}
      >
        <span className="color-hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
      {/* Hex input + live swatch. */}
      <div className="color-hexrow">
        <span className="color-hex-swatch" style={{ backgroundColor: value }} />
        <input
          type="text"
          className="input mono"
          aria-label="Hex colour"
          value={hexText}
          spellCheck={false}
          onChange={(e) => {
            setHexText(e.target.value)
            const n = normalizeHex(e.target.value)
            if (n) onChange(n)
          }}
          onBlur={() => setHexText(value)}
        />
      </div>
      {recent.length > 0 ? (
        <div style={{ marginTop: 'var(--s-2)' }}>
          <div className="label" style={{ fontSize: 'var(--t-2xs)', marginBottom: 'var(--s-1)' }}>
            Recent
          </div>
          <div className="swatches" style={{ paddingBlock: 0 }}>
            {recent.map((hex) => (
              <button
                type="button"
                key={hex}
                className={`swatch${hex.toLowerCase() === value.toLowerCase() ? ' on' : ''}`}
                style={{ backgroundColor: hex }}
                title={hex}
                aria-label={`Recent colour ${hex}`}
                onClick={() => {
                  setHexText(hex)
                  onChange(hex)
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
      <ThemeColorRows
        active={value}
        roomId={paletteRoomId}
        onPick={(hex) => {
          setHexText(hex)
          onChange(hex)
        }}
      />
    </div>
  )
}
