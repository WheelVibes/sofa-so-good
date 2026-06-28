import { useRef } from 'react'
import { useFeature } from '../../features/useFeature'
import { registerUploadedIes } from '../../lighting/ies/iesStore'
import { BUNDLED_IES_PROFILES } from '../../lighting/ies/sampleProfiles'
import { useStore } from '../../state/store'
import { Select } from '../controls/Select'

/**
 * IES photometric-profile picker for a light-emitting item (PC-IES-LIGHT). Lets
 * the user drive a fixture with a real luminaire beam shape: pick a bundled
 * profile, upload their own `.ies` (LM-63), or fall back to the default omni
 * glow. Gated by the `iesLights` Pro feature flag — the caller already checks
 * the item is an emitter; this component owns the flag guard.
 */
export function IesProfilePicker({ itemId, value }: { itemId: string; value: string }) {
  const enabled = useFeature('iesLights')
  const inputRef = useRef<HTMLInputElement>(null)
  if (!enabled) return null

  // An empty `iesProfile` ('') means "no photometry" — FurnitureLights treats a
  // falsy / empty value as a plain omni point light.
  const set = (v: string) => {
    useStore.getState().updateItemProps(itemId, { iesProfile: v })
  }

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const id = registerUploadedIes(`${itemId}-${file.name}`, text)
      useStore.getState().updateItemProps(itemId, { iesProfile: id })
    } catch (err) {
      useStore.getState().notify.start({
        title: "Couldn't read that .ies file",
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const isCustom = value.startsWith('custom:')

  return (
    <div className="space-y-1" style={{ marginTop: 'var(--s-2)' }}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span>Photometry (IES)</span>
        <Select
          ariaLabel="IES photometric profile"
          className="input"
          value={isCustom ? 'custom' : value}
          onChange={(v) => {
            if (v === 'custom') inputRef.current?.click()
            else set(v)
          }}
          style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-xs)' }}
          options={[
            { value: '', label: 'None (omni glow)' },
            ...BUNDLED_IES_PROFILES.map((p) => ({ value: p.id, label: p.label })),
            ...(isCustom ? [{ value, label: 'Uploaded profile' }] : []),
            { value: 'custom', label: 'Upload .ies…' },
          ]}
        />
      </div>
      <input ref={inputRef} type="file" accept=".ies" hidden onChange={onUpload} />
    </div>
  )
}
