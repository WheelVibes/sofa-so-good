import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../../features/useFeature'
import { isIkeaDef, useCatalog } from '../../furniture/catalog'
import { isItemEmitter } from '../../furniture/lightEmitters'
import { useStore } from '../../state/store'
import { GltfBody } from './GltfBody'
import { IkeaBody } from './IkeaBody'
import { InspectorHeader } from './InspectorHeader'
import { InspectorSection } from './InspectorSection'
import { ItemBasicActions, ItemOrientActions } from './ItemActionButtons'
import { ItemBulkActions } from './ItemBulkActions'
import { ItemLightControls } from './ItemLightControls'
import { ElevationControl, OpacityControl } from './ItemPhysicalControls'
import { tryMoveItem, trySetRotItem } from './itemTransforms'
import { LinearArraySection } from './LinearArraySection'
import { MultiSelectPanel } from './MultiSelectPanel'
import { ParametricBody } from './ParametricBody'
import { PathArraySection } from './PathArraySection'
import { PosField } from './PosField'
import { RadialArraySection } from './RadialArraySection'
import { ScatterFillSection } from './ScatterFillSection'
import { SourceLine } from './SourceLine'
import { TiltControls } from './TiltControls'
import { useInspectorMinimize, useSwipeToCollapse } from './useInspectorMinimize'

/** Right-side panel shown when an item is selected. Maps the selected
 *  def kind to either ParametricBody or GltfBody, plus a small header
 *  for category + position + delete.
 *
 *  A thin composition shell (REFAC-1) — the transform/duplicate action math
 *  lives in `itemTransforms.ts`, the header in `InspectorHeader.tsx`, the
 *  array tools in `LinearArraySection`/`RadialArraySection` (siblings of the
 *  pre-existing `PathArraySection`/`ScatterFillSection`), the elevation/opacity
 *  sliders in `ItemPhysicalControls.tsx`, the light controls in
 *  `ItemLightControls.tsx`, and the replace/apply-finish/copy-appearance/
 *  add-to-group tail buttons in `ItemBulkActions.tsx`. Every gate below is
 *  unchanged from the pre-split panel — only the JSX/logic behind each gate
 *  moved out. */
export function InspectorPanel() {
  const multiCount = useStore((s) => s.selectedItemIds.length)
  const item = useStore(useShallow((s) => s.items.find((i) => i.id === s.selectedItemId) ?? null))
  const proMode = useStore((s) => s.uiMode === 'pro')
  const catalog = useCatalog()
  const itemAsLightOn = useFeature('itemAsLight')
  // Multi-axis tilt (SweetHome3DJS parity): pitch/roll an item off vertical.
  const tiltOn = useFeature('tiltFurniture')
  const radialArrayOn = useFeature('radialArray')
  // Duplicate-along-path array (PARITY-DUP-PATH): place copies along a drawn polyline.
  const pathArrayOn = useFeature('pathArray')
  // Scatter-fill a room with N collision-safe copies (PARITY-SCATTER-ROOM).
  const scatterFillOn = useFeature('scatterFill')
  const tiltItem = useStore((s) => s.tiltItem)
  // Per-item elevation (SweetHome3DJS parity) — grouped with mount-height control.
  const elevationOn = useFeature('mountHeights')
  // Per-item opacity (ghost) + hide in 3D.
  const itemOpacityOn = useFeature('itemOpacity')
  const renameItem = useStore((s) => s.renameItem)
  const { minimized, toggle } = useInspectorMinimize(item?.id)
  const swipe = useSwipeToCollapse(minimized, toggle)

  // All hooks above run unconditionally; branch only after them.
  if (multiCount > 1) return <MultiSelectPanel />
  if (!item) return null
  const def = catalog[item.defId]
  if (!def) return null

  return (
    <aside className={`panel inspector dock-panel${minimized ? ' minimized' : ''}`}>
      <InspectorHeader
        item={item}
        def={def}
        minimized={minimized}
        toggle={toggle}
        swipeHandlers={swipe}
      />
      {minimized ? null : (
        <>
          <hr className="hr" />
          <div className="panel-body">
            <label
              className="flex items-center gap-2 text-xs"
              style={{ marginBottom: 'var(--s-2)' }}
            >
              <span className="label" style={{ whiteSpace: 'nowrap' }}>
                Name
              </span>
              <input
                type="text"
                value={item.label ?? ''}
                placeholder={def.name}
                aria-label="Custom item name"
                onChange={(e) => renameItem(item.id, e.target.value)}
                className="input"
                style={{ flex: 1, minWidth: 0 }}
              />
            </label>
            {proMode && !def.windowBound ? (
              <InspectorSection
                title="Transform"
                defaultOpen
                style={{ borderTop: 'none', paddingTop: 0 }}
              >
                <div className="transform-grid">
                  <PosField
                    label="X"
                    unit="m"
                    value={item.position[0]}
                    step={0.05}
                    onCommit={(v) => tryMoveItem(item.id, def, catalog, v, item.position[1])}
                  />
                  <PosField
                    label="Z"
                    unit="m"
                    value={item.position[1]}
                    step={0.05}
                    onCommit={(v) => tryMoveItem(item.id, def, catalog, item.position[0], v)}
                  />
                  <PosField
                    label="Rotation"
                    unit="°"
                    value={(item.rotation * 180) / Math.PI}
                    step={1}
                    onCommit={(deg) => trySetRotItem(item.id, def, catalog, deg)}
                    integer
                  />
                </div>
              </InspectorSection>
            ) : null}
            {def.kind === 'parametric' ? (
              <ParametricBody item={item} def={def} />
            ) : isIkeaDef(def) ? (
              <IkeaBody item={item} def={def} />
            ) : (
              <GltfBody item={item} def={def} />
            )}
            {def.kind === 'gltf' && (def.source === 'builtin' || def.source === 'ikea') && (
              <SourceLine
                attribution={def.attribution}
                license={def.license}
                sourceUrl={def.sourceUrl}
              />
            )}
            <div className="sec">
              <ItemBasicActions item={item} def={def} catalog={catalog} />
              {proMode ? <LinearArraySection item={item} def={def} catalog={catalog} /> : null}
              {proMode && radialArrayOn ? (
                <RadialArraySection item={item} def={def} catalog={catalog} />
              ) : null}
              {proMode && pathArrayOn ? (
                <PathArraySection item={item} def={def} catalog={catalog} />
              ) : null}
              {proMode && scatterFillOn ? (
                <ScatterFillSection item={item} def={def} catalog={catalog} />
              ) : null}
              <ItemOrientActions item={item} def={def} catalog={catalog} />
              {tiltOn &&
              !item.locked &&
              !(def.kind === 'parametric' && def.primitive === 'Staircase') ? (
                <TiltControls
                  pitch={item.pitch ?? 0}
                  roll={item.roll ?? 0}
                  onPitch={(rad) => tiltItem(item.id, { pitch: rad })}
                  onRoll={(rad) => tiltItem(item.id, { roll: rad })}
                  onReset={() => tiltItem(item.id, { pitch: 0, roll: 0 })}
                />
              ) : null}
              {elevationOn && !item.locked ? <ElevationControl item={item} /> : null}
              {itemOpacityOn ? <OpacityControl item={item} /> : null}
              {itemAsLightOn && isItemEmitter(item.defId, item.props) ? (
                <ItemLightControls item={item} />
              ) : null}
              <ItemBulkActions item={item} catalog={catalog} />
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
