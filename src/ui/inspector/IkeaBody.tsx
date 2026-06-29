import { isIkeaDef, useCatalog } from '../../furniture/catalog'
import { seedGltfFootprint } from '../../furniture/GltfModel'
import { resolveCompatible } from '../../furniture/ikea/compatibility'
import { combineOnto } from '../../furniture/ikea/stacking'
import type {
  FurnitureItem,
  IkeaGltfDef,
  IkeaProductInfo,
  IkeaVariant,
} from '../../furniture/types'
import { useStore } from '../../state/store'
import { safeUrl } from '../../utils/safeUrl'
import { ColorPicker } from '../controls/ColorPicker'
import { finishOverrideKey, variantProps } from './ikeaBodyProps'

interface IkeaBodyProps {
  item: FurnitureItem
  def: IkeaGltfDef
}

/** Resolve the variant the item currently shows: explicit prop, else def default. */
function activeFinish(item: FurnitureItem, def: IkeaGltfDef): string {
  return typeof item.props['variant'] === 'string' ? item.props['variant'] : def.activeVariant
}
function findVariant(def: IkeaGltfDef, finish: string): IkeaVariant | undefined {
  return (
    def.variants.find((v) => v.finish === finish) ??
    def.variants.find((v) => v.finish === def.activeVariant)
  )
}

/** Read-only product metadata, collapsed by default. */
function IkeaProductInfoDetails({ info }: { info: IkeaProductInfo }) {
  const measurements = Object.entries(info.productMeasurements ?? {}).slice(0, 6)
  // Scraped/imported product data is untrusted — sanitize the image source so a
  // crafted `data:`/`javascript:` URL can't slip into an `<img src>`.
  const mainImageUrl = safeUrl(info.mainImageUrl)
  return (
    <details className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10px] text-[var(--text-2)]">
      <summary className="cursor-pointer text-xs font-medium text-[var(--text-2)]">
        Product info
      </summary>
      <div className="mt-1.5 space-y-1.5">
        {info.categoryConfidence === 'low' ? (
          <p className="text-[10px] text-amber-600">⚠ Category auto-detected — review.</p>
        ) : null}
        {mainImageUrl ? (
          <img
            src={mainImageUrl}
            alt=""
            width={96}
            className="rounded border border-[var(--border)]"
          />
        ) : null}
        {info.series ? (
          <p>
            <span className="text-[var(--text-3)]">Series:</span> {info.series}
          </p>
        ) : null}
        {info.styleGroup ? (
          <p>
            <span className="text-[var(--text-3)]">Style:</span> {info.styleGroup}
          </p>
        ) : null}
        {info.designer ? (
          <p>
            <span className="text-[var(--text-3)]">Designer:</span> {info.designer}
          </p>
        ) : null}
        {info.size ? (
          <p>
            <span className="text-[var(--text-3)]">Size:</span> {info.size}
          </p>
        ) : null}
        {info.description ? <p className="leading-snug">{info.description}</p> : null}
        {measurements.length ? (
          <div>
            <div className="text-[var(--text-3)]">Measurements</div>
            {measurements.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span>{k}</span>
                <span className="font-mono">{v}</span>
              </div>
            ))}
          </div>
        ) : null}
        {info.materials?.length ? (
          <div>
            <div className="text-[var(--text-3)]">Materials</div>
            {info.materials.map((m, i) => (
              <p key={i}>
                <span className="text-[var(--text-3)]">{m.part}:</span> {m.composition}
              </p>
            ))}
          </div>
        ) : null}
        {info.careInstructions ? (
          <p>
            <span className="text-[var(--text-3)]">Care:</span> {info.careInstructions}
          </p>
        ) : null}
        {info.documents?.length ? (
          <div>
            <div className="text-[var(--text-3)]">Documents</div>
            {info.documents.map((d, i) => {
              const href = safeUrl(d.url)
              return href ? (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[var(--accent-soft-text)] hover:underline"
                >
                  {d.name} (PDF)
                </a>
              ) : (
                <span key={i} className="block text-[var(--text-3)]">
                  {d.name} (PDF)
                </span>
              )
            })}
          </div>
        ) : null}
        {info.rating ? (
          <p>
            {'★'.repeat(Math.round(info.rating.value))}
            <span className="text-[var(--text-3)]">
              {' '}
              {info.rating.value}/{info.rating.max} · {info.rating.count} reviews
            </span>
          </p>
        ) : null}
      </div>
    </details>
  )
}

/** Inspector body for placed IKEA items: finish picker, recolour/tint, scale,
 *  product info, and a "Complete with…" section listing compatible groups. */
export function IkeaBody({ item, def }: IkeaBodyProps) {
  const updateItemProps = useStore((s) => s.updateItemProps)
  const setActiveDefId = useStore((s) => s.setActiveDefId)
  const catalog = useCatalog()

  const scale = typeof item.props['scale'] === 'number' ? item.props['scale'] : (def.scale ?? 1)
  const tint = typeof item.props['tint'] === 'string' ? item.props['tint'] : ''
  const current = activeFinish(item, def)
  const variant = findVariant(def, current)

  const selectVariant = (v: IkeaVariant) => {
    updateItemProps(item.id, variantProps(v.finish))
    if (v.runtimeUrl && v.footprint) seedGltfFootprint(v.runtimeUrl, v.footprint)
  }

  const ikeaDefs = Object.values(catalog).filter(isIkeaDef)
  const matches = def.compatibility?.acceptsCategories?.length
    ? resolveCompatible(def, ikeaDefs)
    : {}
  const matchedCategories = Object.entries(matches).filter(([, list]) => list.length > 0)
  const showCompleteWith = (def.compatibility?.acceptsCategories?.length ?? 0) > 0

  // Only materials with a real scraper name can be recoloured: the override is
  // matched against the GLB's actual material name, so a synthesised/empty name
  // would never match any mesh (a dead control). Fall back to global tint when
  // fewer than two materials are individually recolourable.
  const recolourable = variant?.glbMaterials.filter((m) => m.name.trim() !== '') ?? []
  const multiMaterial = recolourable.length > 1

  /** Combine a compatible model with the base per the matched category
   *  (vertical stack or around-placement), stamping the base's groupId (if any)
   *  + adding the new item(s) in one history step — mirrors the set-drop idiom
   *  in Toolbar's dropArranged. */
  const placeOnThis = (matchDef: IkeaGltfDef, finish: string, category: string) => {
    const variant = matchDef.variants.find((v) => v.finish === finish) ?? matchDef.variants[0]
    const res = combineOnto(item, def, matchDef, variant, category)
    if ('error' in res) return // defensive; button is disabled in that case
    const st = useStore.getState()
    st.pushHistory()
    const withBaseGroup = item.groupId
      ? st.items
      : st.items.map((it) => (it.id === item.id ? { ...it, groupId: res.groupId } : it))
    st.setItems([...withBaseGroup, ...res.items])
    st.setSelectedItemIds(res.items.map((i) => i.id))
  }

  return (
    <div className="space-y-2">
      {/* (a) Finish picker */}
      {def.variants.length > 1 ? (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
            Finish
          </div>
          <div className="flex flex-wrap gap-1.5">
            {def.variants.map((v) => {
              const disabled = v.assetId === null
              const isActive = v.finish === current
              return (
                <button
                  key={v.finish}
                  disabled={disabled}
                  title={disabled ? 'not available' : v.label}
                  onClick={() => !disabled && selectVariant(v)}
                  className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] ${
                    isActive
                      ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                      : 'border-[var(--border)]'
                  } ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:border-[var(--accent)]'}`}
                >
                  <span
                    className="h-3 w-3 rounded-sm border border-[var(--border-2)]"
                    style={{ backgroundColor: v.swatchHex ?? 'var(--surface-3)' }}
                  />
                  {v.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* (b) Recolour (per-component) OR global tint */}
      {multiMaterial && variant ? (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
            Recolour
          </div>
          <div className="space-y-1">
            {recolourable.map((m) => {
              const key = finishOverrideKey(m.name)
              const override =
                typeof item.props[key] === 'string' ? (item.props[key] as string) : ''
              const value = override || m.hex || m.sampledHex || '#ffffff'
              return (
                <div key={m.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex-1 truncate" title={m.name}>
                    {m.name}
                  </span>
                  <ColorPicker
                    value={value}
                    onChange={(hex) => updateItemProps(item.id, { [key]: hex })}
                    ariaLabel={`${m.name} colour`}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex-1">Tint</span>
          <ColorPicker
            value={tint || '#ffffff'}
            onChange={(hex) => updateItemProps(item.id, { tint: hex })}
            ariaLabel="Tint"
          />
          {tint ? (
            <button
              onClick={() => updateItemProps(item.id, { tint: '' })}
              className="text-[10px] text-[var(--text-3)] hover:text-[var(--text-2)]"
            >
              clear
            </button>
          ) : null}
        </div>
      )}

      {/* (c) Scale */}
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="flex-1">Scale</span>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.05}
          value={scale}
          onChange={(e) => updateItemProps(item.id, { scale: Number(e.target.value) })}
          className="flex-1 accent-[var(--accent)]"
        />
        <span className="w-12 text-right font-mono">{scale.toFixed(2)}×</span>
      </label>

      {/* (d) Product info */}
      {def.productInfo ? <IkeaProductInfoDetails info={def.productInfo} /> : null}

      {/* (e) Complete with */}
      {showCompleteWith ? (
        <div className="border-t border-[var(--border)] pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
            Complete with
          </div>
          {matchedCategories.length ? (
            <div className="space-y-1.5">
              {matchedCategories.map(([category, list]) => (
                <div key={category}>
                  <div className="text-[10px] capitalize text-[var(--text-3)]">{category}</div>
                  <div className="space-y-1">
                    {list.map((m) => {
                      const finish0 = m.finishes[0]?.finish ?? m.def.activeVariant
                      const variant0 =
                        m.def.variants.find((v) => v.finish === finish0) ?? m.def.variants[0]
                      const canPlace = !(
                        'error' in combineOnto(item, def, m.def, variant0, category)
                      )
                      return (
                        <div key={m.def.id} className="flex flex-wrap items-center gap-1">
                          <button
                            onClick={() => placeOnThis(m.def, finish0, category)}
                            disabled={!canPlace}
                            className="rounded border border-[var(--accent)] px-1.5 py-1 text-[10px] text-[var(--accent-soft-text)] hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                            title="Combine this with the selected item"
                          >
                            Place on this
                          </button>
                          <button
                            onClick={() => setActiveDefId(m.def.id)}
                            title="Click then place on the floor"
                            className="rounded bg-[var(--surface-2)] px-1.5 py-1 text-[10px] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
                          >
                            + {m.def.name}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-[var(--text-3)]">No compatible items imported yet.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
