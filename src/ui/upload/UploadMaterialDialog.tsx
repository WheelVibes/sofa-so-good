import { useState } from 'react'
import type { MaterialCategory } from '../../materials/types'
import { type MaterialUploadFiles, persistUserMaterial } from '../../materials/upload/persist'
import { Modal } from '../Modal'

interface UploadMaterialDialogProps {
  open: boolean
  onClose: () => void
}

const SWATCH_DEFAULT = '#cccccc'

interface ChannelSlotProps {
  label: string
  required?: boolean
  file: File | null
  onPick: (f: File | null) => void
}

function ChannelSlot({ label, required, file, onPick }: ChannelSlotProps) {
  return (
    <label className="flex items-center justify-between gap-2 rounded border border-[var(--border)] px-2 py-1 text-xs">
      <span>
        {label}
        {required ? <span className="text-[var(--danger)]">*</span> : null}
      </span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp,.tga,.tif,.tiff,.exr,.hdr,.ktx2,.dds"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="text-[10px]"
      />
      <span className="w-20 truncate text-right text-[10px] text-[var(--text-3)]">
        {file ? file.name : '—'}
      </span>
    </label>
  )
}

export function UploadMaterialDialog({ open, onClose }: UploadMaterialDialogProps) {
  const [albedo, setAlbedo] = useState<File | null>(null)
  const [normal, setNormal] = useState<File | null>(null)
  const [roughness, setRoughness] = useState<File | null>(null)
  const [ao, setAo] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<MaterialCategory>('floor')
  const [uvW, setUvW] = useState(1)
  const [uvH, setUvH] = useState(1)
  const [swatch, setSwatch] = useState(SWATCH_DEFAULT)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const reset = () => {
    setAlbedo(null)
    setNormal(null)
    setRoughness(null)
    setAo(null)
    setName('')
    setCategory('floor')
    setUvW(1)
    setUvH(1)
    setSwatch(SWATCH_DEFAULT)
    setError(null)
    setBusy(false)
  }

  // Closing (X / Escape / backdrop / Cancel) clears the form so a fresh open
  // doesn't show stale picks (the instance state persists while open=false).
  const close = () => {
    reset()
    onClose()
  }

  const submit = async () => {
    if (!albedo) {
      setError('Albedo is required.')
      return
    }
    if (!name.trim()) {
      setError('Pick a name.')
      return
    }
    setBusy(true)
    setError(null)
    const files: MaterialUploadFiles = { albedo, normal, roughness, ao }
    const result = await persistUserMaterial(files, {
      name,
      category,
      uvScale: [uvW, uvH],
      swatch,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.reason)
      return
    }
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Upload material"
      width={448}
      footer={
        <footer className="flex justify-end gap-2 px-[var(--s-4)] py-[var(--s-3)]">
          <button onClick={close} className="btn" disabled={busy} type="button">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !albedo || !name.trim()}
            className="rounded btn btn-accent disabled:opacity-40"
            type="button"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      }
    >
      <div>
        <p className="mb-4 text-xs text-[var(--text-3)]">
          Drop in PBR texture maps (PNG / JPG / WebP / BMP / TGA / TIFF / EXR / HDR / KTX2 / DDS,
          max 4096² and 16 MB each). Exotic formats are decoded and re-encoded to WebP in your
          browser. Albedo is required; normal, roughness, and AO are optional.
        </p>
        <div className="space-y-2">
          <ChannelSlot label="Albedo" required file={albedo} onPick={setAlbedo} />
          <ChannelSlot label="Normal" file={normal} onPick={setNormal} />
          <ChannelSlot label="Roughness" file={roughness} onPick={setRoughness} />
          <ChannelSlot label="Ambient occlusion" file={ao} onPick={setAo} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-2)]">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input block w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-2)]">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MaterialCategory)}
              className="input block w-full"
            >
              <option value="floor">Floor</option>
              <option value="wall">Wall</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-2)]">Tile width (m)</span>
            <input
              type="number"
              step={0.1}
              min={0.1}
              value={uvW}
              onChange={(e) => setUvW(Number(e.target.value) || 1)}
              className="input block w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-2)]">Tile depth (m)</span>
            <input
              type="number"
              step={0.1}
              min={0.1}
              value={uvH}
              onChange={(e) => setUvH(Number(e.target.value) || 1)}
              className="input block w-full"
            />
          </label>
          <label className="col-span-2 flex items-center gap-2">
            <span className="block text-xs text-[var(--text-2)]">Swatch</span>
            <input
              type="color"
              value={swatch}
              onChange={(e) => setSwatch(e.target.value)}
              className="h-6 w-10 cursor-pointer rounded border border-[var(--border-2)]"
            />
            <span className="text-[10px] text-[var(--text-3)]">
              Picker thumbnail + loading fallback colour
            </span>
          </label>
        </div>
        {error ? (
          <p className="mt-3 rounded bg-[var(--danger-soft)] px-2 py-1 text-xs text-[var(--danger)]">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
