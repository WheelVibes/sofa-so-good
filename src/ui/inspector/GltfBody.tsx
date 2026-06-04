import type { FurnitureItem, GltfDef } from '../../furniture/types'
import { useStore } from '../../state/store'

interface GltfBodyProps {
  item: FurnitureItem
  def: GltfDef
}

/** GLTF-backed items expose a small set of generic controls — scale,
 *  optional tint, and (for built-ins) the attribution string so users
 *  can credit the asset author. */
export function GltfBody({ item, def }: GltfBodyProps) {
  const updateItemProps = useStore((s) => s.updateItemProps)
  const scale = typeof item.props['scale'] === 'number' ? item.props['scale'] : (def.scale ?? 1)
  const tint = typeof item.props['tint'] === 'string' ? item.props['tint'] : ''

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="flex-1">Scale</span>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.05}
          value={scale}
          onChange={(e) => updateItemProps(item.id, { scale: Number(e.target.value) })}
          className="flex-1 accent-blue-500"
        />
        <span className="w-12 text-right font-mono">{scale.toFixed(2)}×</span>
      </label>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="flex-1">Tint</span>
        <input
          type="color"
          value={tint || '#ffffff'}
          onChange={(e) => updateItemProps(item.id, { tint: e.target.value })}
          className="h-6 w-10 cursor-pointer rounded border border-[var(--border-2)]"
        />
        {tint ? (
          <button
            onClick={() => updateItemProps(item.id, { tint: '' })}
            className="text-[10px] text-[var(--text-3)] hover:text-[var(--text-2)]"
          >
            clear
          </button>
        ) : null}
      </label>
      {/* Built-in attribution + licence is rendered once by <SourceLine> in
          InspectorPanel (with a source link), so it's not repeated here. */}
      {def.source === 'user' ? (
        <p className="pt-1 text-[10px] text-[var(--text-3)]">
          Uploaded {new Date(def.uploadedAt).toLocaleDateString()}
        </p>
      ) : null}
    </div>
  )
}
