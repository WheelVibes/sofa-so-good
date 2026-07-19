import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { Icon } from '../toolbar/icons'
import {
  hexToRgb,
  isPaintablePolygon,
  type Point,
  paintImageDataInPolygon,
  type RGB,
} from './composite'

/** A paint choice fed in from the finish/paint catalog (reuse — never a
 *  duplicated colour list). `hex` is the swatch's representative colour. */
export interface PaintSwatch {
  id: string
  name: string
  hex: string
}

interface PaintVizModalProps {
  open: boolean
  onClose: () => void
  /** Wall / paint swatches sourced from the existing finish catalog. */
  swatches: PaintSwatch[]
}

/** Largest photo accepted (bytes) — mirrors the walk-backdrop cap; a giant
 *  upload would blow out canvas memory for no visual gain. */
const MAX_PHOTO_BYTES = 25 * 1024 * 1024
/** The canvas is drawn at this max width (px); the photo is downscaled to fit so
 *  a phone-camera 4000px JPG doesn't hammer the per-pixel loop. */
const CANVAS_MAX_W = 720

/**
 * Real-photo paint visualizer — upload a photo of a real wall, tap/click to
 * drop a polygon mask around the wall, pick a paint swatch and preview the
 * recolour instantly (photo-luminance-preserving "color" blend, so shadows and
 * texture survive). Fully client-side: the photo never leaves the device.
 *
 * Transient tool — all state is component-local; nothing persists to the store
 * or the save schema (it's a preview, not design data).
 */
export function PaintVizModal({ open, onClose, swatches }: PaintVizModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // The source photo, downscaled to <= CANVAS_MAX_W, kept as ImageData so every
  // repaint starts from the pristine pixels (blending is not cumulative).
  const [photo, setPhoto] = useState<ImageData | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [points, setPoints] = useState<Point[]>([])
  const [swatchId, setSwatchId] = useState<string | null>(null)
  const [strength, setStrength] = useState(0.85)
  const [error, setError] = useState<string | null>(null)

  const paint = useMemo<RGB | null>(() => {
    const sw = swatches.find((s) => s.id === swatchId)
    return sw ? hexToRgb(sw.hex) : null
  }, [swatchId, swatches])

  const onPickFile = useCallback(async (file: File) => {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('That image is too large (max 25 MB).')
      return
    }
    try {
      const url = URL.createObjectURL(file)
      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('decode'))
        img.src = url
      })
      const scale = Math.min(1, CANVAS_MAX_W / (img.naturalWidth || CANVAS_MAX_W))
      const w = Math.max(1, Math.round((img.naturalWidth || CANVAS_MAX_W) * scale))
      const h = Math.max(1, Math.round((img.naturalHeight || CANVAS_MAX_W) * scale))
      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      const octx = off.getContext('2d')
      if (!octx) throw new Error('ctx')
      octx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      setPhoto(octx.getImageData(0, 0, w, h))
      setDims({ w, h })
      setPoints([])
    } catch {
      setError("Couldn't read that image. Try another photo.")
    }
  }, [])

  // Draw the (pristine) photo, composite the painted mask, then overlay the
  // polygon guide — on every relevant change.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !photo) return
    canvas.width = dims.w
    canvas.height = dims.h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Fresh copy of the pristine pixels each frame (blend is not cumulative).
    const frame = new ImageData(new Uint8ClampedArray(photo.data), dims.w, dims.h)
    if (paint && isPaintablePolygon(points)) {
      paintImageDataInPolygon(frame, points, paint, strength)
    }
    ctx.putImageData(frame, 0, 0)
    drawPolygonGuide(ctx, points)
  }, [photo, dims, points, paint, strength])

  // Map a pointer event to canvas pixel coordinates (accounts for CSS scaling).
  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * dims.w
    const y = ((e.clientY - rect.top) / rect.height) * dims.h
    return [x, y]
  }

  const addPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!photo) return
    e.preventDefault()
    setPoints((pts) => [...pts, toCanvasPoint(e)])
  }

  const undoPoint = () => setPoints((pts) => pts.slice(0, -1))
  const resetMask = () => setPoints([])

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = 'wall-paint-preview.png'
    a.click()
  }

  // Reset everything when the modal closes so a re-open starts clean.
  useEffect(() => {
    if (!open) {
      setPhoto(null)
      setPoints([])
      setSwatchId(null)
      setError(null)
    }
  }, [open])

  const paintable = isPaintablePolygon(points)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Preview paint on your photo"
      sub="Try a colour on a real wall"
      width="var(--modal-lg)"
      panelId="paint-viz-modal"
    >
      <div className="paint-viz">
        <p className="paint-viz-privacy">
          <Icon.Check width={13} height={13} />
          Your photo stays on this device — nothing is uploaded.
        </p>

        {!photo ? (
          <div className="paint-viz-drop">
            <Icon.Upload width={22} height={22} />
            <p>Upload a photo of the wall you want to repaint.</p>
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => fileRef.current?.click()}
            >
              Upload photo…
            </button>
          </div>
        ) : (
          <>
            <div className="paint-viz-stage">
              <canvas
                ref={canvasRef}
                className="paint-viz-canvas"
                onPointerDown={addPoint}
                style={{ touchAction: 'none' }}
              />
            </div>
            <p className="paint-viz-hint">
              {paintable
                ? 'Pick a colour below to preview. Tap the photo to add more points.'
                : 'Tap around the wall to trace it — 3+ points close the shape.'}
            </p>

            <div className="paint-viz-actions">
              <button
                type="button"
                className="btn btn-soft sm"
                onClick={() => fileRef.current?.click()}
              >
                <Icon.Upload width={13} height={13} />
                Replace
              </button>
              <button
                type="button"
                className="btn btn-soft sm"
                onClick={undoPoint}
                disabled={points.length === 0}
              >
                <Icon.Undo width={13} height={13} />
                Undo point
              </button>
              <button
                type="button"
                className="btn btn-soft sm"
                onClick={resetMask}
                disabled={points.length === 0}
              >
                <Icon.Reset width={13} height={13} />
                Reset mask
              </button>
              <button
                type="button"
                className="btn btn-soft sm"
                onClick={download}
                disabled={!paintable || !paint}
              >
                <Icon.Download width={13} height={13} />
                Download
              </button>
            </div>

            <label className="paint-viz-strength">
              <span>Coverage</span>
              <input
                type="range"
                className="slider"
                min={0.2}
                max={1}
                step={0.05}
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                aria-label="Paint coverage"
              />
            </label>

            {/* biome-ignore lint/a11y/useSemanticElements: a swatch grid is a labelled group of toggle buttons, not a fieldset form control (matches FinishPicker's SwatchGroup). */}
            <div className="paint-viz-swatches" role="group" aria-label="Paint colours">
              {swatches.map((sw) => (
                <button
                  key={sw.id}
                  type="button"
                  className={`paint-viz-swatch${sw.id === swatchId ? ' on' : ''}`}
                  aria-pressed={sw.id === swatchId}
                  title={sw.name}
                  onClick={() => setSwatchId(sw.id)}
                >
                  <span className="paint-viz-chip" style={{ backgroundColor: sw.hex }} />
                  <span className="paint-viz-name">{sw.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {error ? (
          <p className="paint-viz-error" role="alert">
            {error}
          </p>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void onPickFile(f)
          }}
        />
      </div>
    </Modal>
  )
}

/** Overlay the traced polygon (vertices + edges) so the user sees the mask. */
function drawPolygonGuide(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (points.length === 0) return
  ctx.save()
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  if (points.length >= 3) ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])
  for (const [x, y] of points) {
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.stroke()
  }
  ctx.restore()
}
