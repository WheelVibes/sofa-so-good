import { resolveEmitterSpec, resolveLampSpec } from '../../furniture/lightEmitters'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { ColorPicker } from '../controls/ColorPicker'
import { Select } from '../controls/Select'
import { SliderField } from '../controls/SliderField'
import { IesProfilePicker } from './IesProfilePicker'

/**
 * Light colour/brightness/IES-profile controls for an item flagged as a light
 * source (a registered emitter, or the `itemAsLight` inspector override).
 * Gated by `itemAsLightOn && isItemEmitter(item.defId, item.props)` in
 * `InspectorPanel.tsx`.
 */
/** Common residential lamp colour temperatures (K). */
const CCT_OPTIONS = [
  { value: '2700', label: '2700K extra warm' },
  { value: '3000', label: '3000K warm white' },
  { value: '4000', label: '4000K neutral' },
  { value: '6500', label: '6500K daylight' },
]

/** The ingress ratings that matter for a home: standard indoor, wet-room
 *  minimum (bathroom zones 1-2), and jet-proof for a shower/outdoor position. */
const IP_OPTIONS = [
  { value: '20', label: 'IP20 indoor' },
  { value: '44', label: 'IP44 splash (wet room)' },
  { value: '65', label: 'IP65 jet-proof' },
]

export function ItemLightControls({ item }: { item: FurnitureItem }) {
  const spec = resolveEmitterSpec(item.defId, item.props)
  const lamp = resolveLampSpec(item.defId, item.props)
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
      {/* SPECIFICATION, not render. These write the product a contractor is
          asked to buy — the lighting schedule quotes them and
          `analysis/lampSpecAdvisory.ts` checks them (a wet room needs IP44).
          Deliberately separate from Colour/Brightness above, which are render
          overrides: tinting the 3D view must not re-specify the lamp. */}
      <div
        className="label"
        style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 'var(--s-2)' }}
      >
        Specification
      </div>
      <div className="flex items-center justify-between gap-2" style={{ fontSize: 'var(--t-sm)' }}>
        <span>Colour temp.</span>
        <Select
          ariaLabel="Specified colour temperature"
          value={String(lamp.cct)}
          options={CCT_OPTIONS}
          onChange={(v) => useStore.getState().updateItemProps(item.id, { lampCct: Number(v) })}
        />
      </div>
      <div className="flex items-center justify-between gap-2" style={{ fontSize: 'var(--t-sm)' }}>
        <span>IP rating</span>
        <Select
          ariaLabel="Specified IP rating"
          value={String(lamp.ip)}
          options={IP_OPTIONS}
          onChange={(v) => useStore.getState().updateItemProps(item.id, { lampIp: Number(v) })}
        />
      </div>
      <IesProfilePicker
        itemId={item.id}
        value={typeof item.props.iesProfile === 'string' ? item.props.iesProfile : ''}
      />
    </div>
  )
}
