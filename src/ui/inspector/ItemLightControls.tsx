import { resolveEmitterSpec } from '../../furniture/lightEmitters'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { ColorPicker } from '../controls/ColorPicker'
import { SliderField } from '../controls/SliderField'
import { IesProfilePicker } from './IesProfilePicker'

/**
 * Light colour/brightness/IES-profile controls for an item flagged as a light
 * source (a registered emitter, or the `itemAsLight` inspector override).
 * Gated by `itemAsLightOn && isItemEmitter(item.defId, item.props)` in
 * `InspectorPanel.tsx`.
 */
export function ItemLightControls({ item }: { item: FurnitureItem }) {
  const spec = resolveEmitterSpec(item.defId, item.props)
  const color =
    typeof item.props.lightColor === 'string' ? item.props.lightColor : (spec?.color ?? '#ffe2b0')
  const intensity =
    typeof item.props.lightIntensity === 'number'
      ? item.props.lightIntensity
      : (spec?.intensity ?? 5)
  return (
    <div className="space-y-1" style={{ marginTop: 'var(--s-2)' }}>
      <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
        Light
      </div>
      <div className="flex items-center justify-between gap-2" style={{ fontSize: 'var(--t-sm)' }}>
        <span>Colour</span>
        <ColorPicker
          ariaLabel="Light colour"
          value={color}
          onChange={(hex) => useStore.getState().updateItemProps(item.id, { lightColor: hex })}
        />
      </div>
      <SliderField
        label="Brightness"
        ariaLabel="Light brightness"
        min={1}
        max={12}
        step={0.5}
        value={intensity}
        onChange={(v) => useStore.getState().updateItemProps(item.id, { lightIntensity: v })}
        format={(v) => v.toFixed(0)}
      />
      <IesProfilePicker
        itemId={item.id}
        value={typeof item.props.iesProfile === 'string' ? item.props.iesProfile : ''}
      />
    </div>
  )
}
