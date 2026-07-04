import { extractPalette } from '../analysis/imagePalette'
import { useStore } from '../state/store'
import { mapPaletteToFinishes } from './paletteFromPhotoMatch'

/** Decode a user-picked image to RGBA pixels via an offscreen canvas. */
async function imageToPixels(
  file: File,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode failed'))
      el.src = url
    })
    // Downscale large photos — palette extraction doesn't need full resolution.
    const maxDim = 320
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(img, 0, 0, w, h)
    const id = ctx.getImageData(0, 0, w, h)
    return { data: id.data, width: w, height: h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Prompt for an inspiration photo, extract its dominant palette, map each colour
 * to the nearest catalog finish, and open a moodboard of the result. Wires the
 * pure `extractPalette` core + the moodboard builder into a shippable feature
 * (Spacejoy/Modsy-style "design from a photo"). Pure DOM; no backend.
 */
export function pickPaletteFromPhoto(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const s = useStore.getState()
    try {
      const { data, width, height } = await imageToPixels(file)
      const palette = extractPalette(data, width, height, { count: 6 })
      if (palette.length === 0) {
        s.notify.start({ title: 'No colours found', kind: 'error', message: 'Try another image.' })
        return
      }
      // Dynamic import keeps the moodboard builder out of the boot bundle
      // (P-CHUNK); we're already past an await here, and the window opens
      // after a file-picker round-trip anyway.
      const { buildMoodboardHtml } = await import('./moodboard')
      const materials = mapPaletteToFinishes(palette)
      const html = buildMoodboardHtml({
        title: 'Palette from photo',
        subtitle: 'Extracted colours + nearest catalog finishes',
        note: 'Dominant colours from your inspiration image, matched to the closest floor/wall finishes.',
        palette: palette.map((p) => ({ hex: p.hex, name: `${Math.round(p.weight * 100)}%` })),
        materials,
        items: [],
      })
      const win = window.open('', '_blank')
      if (!win) {
        s.notify.start({
          title: 'Pop-up blocked',
          kind: 'error',
          message: 'Allow pop-ups, then try again.',
        })
        return
      }
      win.document.write(html)
      win.document.close()
      win.focus()
    } catch {
      s.notify.start({
        title: "Couldn't read image",
        kind: 'error',
        message: 'That image could not be decoded.',
      })
    }
  }
  input.click()
}
