import { useState } from 'react'
import type { MaterialCategory } from '../../materials/types'
import { type MaterialUploadFiles, persistUserMaterial } from '../../materials/upload/persist'

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
    <label className="flex items-center justify-between gap-2 rounded border border-neutral-200 px-2 py-1 text-xs">
      <span>
        {label}
        {required ? <span className="text-rose-600">*</span> : null}
      </span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="text-[10px]"
      />
      <span className="w-20 truncate text-right text-[10px] text-neutral-500">
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
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div className="w-[28rem] rounded-lg bg-white p-5 text-sm shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-neutral-900">Upload material</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Drop in PBR texture maps (PNG / JPG / WebP, max 4096² and 8 MB each). Albedo is required;
          normal, roughness, and AO are optional.
        </p>
        <div className="space-y-2">
          <ChannelSlot label="Albedo" required file={albedo} onPick={setAlbedo} />
          <ChannelSlot label="Normal" file={normal} onPick={setNormal} />
          <ChannelSlot label="Roughness" file={roughness} onPick={setRoughness} />
          <ChannelSlot label="Ambient occlusion" file={ao} onPick={setAo} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-600">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-600">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MaterialCategory)}
              className="block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
            >
              <option value="floor">Floor</option>
              <option value="wall">Wall</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-600">Tile width (m)</span>
            <input
              type="number"
              step={0.1}
              min={0.1}
              value={uvW}
              onChange={(e) => setUvW(Number(e.target.value) || 1)}
              className="block w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-600">Tile depth (m)</span>
            <input
              type="number"
              step={0.1}
              min={0.1}
              value={uvH}
              onChange={(e) => setUvH(Number(e.target.value) || 1)}
              className="block w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="col-span-2 flex items-center gap-2">
            <span className="block text-xs text-neutral-600">Swatch</span>
            <input
              type="color"
              value={swatch}
              onChange={(e) => setSwatch(e.target.value)}
              className="h-6 w-10 cursor-pointer rounded border border-neutral-300"
            />
            <span className="text-[10px] text-neutral-500">
              Picker thumbnail + loading fallback colour
            </span>
          </label>
        </div>
        {error ? (
          <p className="mt-3 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</p>
        ) : null}
        <footer className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => {
              reset()
              onClose()
            }}
            className="rounded px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !albedo || !name.trim()}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
