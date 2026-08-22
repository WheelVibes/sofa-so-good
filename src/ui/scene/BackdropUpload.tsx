import { useRef } from 'react'
import { useFeature } from '../../features/useFeature'
import { applyWalkBackdropFile, clearWalkBackdrop } from '../../state/storage/walkBackdrop'
import { useStore } from '../../state/store'

/**
 * Upload-your-own walk-mode backdrop photo control (the `custom` backdrop).
 * A file picker that persists the chosen image and selects it as the window
 * view; a Remove button clears it. Gated by the `customBackdrop` feature flag.
 * Shared by the desktop Scene menu and the mobile toolbar for parity.
 */
export function BackdropUpload() {
  const enabled = useFeature('customBackdrop')
  const hasCustom = useStore((s) => !!s.customBackdropUrl)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!enabled) return null

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    const err = await applyWalkBackdropFile(file)
    if (err) {
      useStore
        .getState()
        .notify.start({ title: "Couldn't use that image", kind: 'error', message: err })
    }
  }

  return (
    <div className="scene-field" onClick={(e) => e.stopPropagation()}>
      <span>Your photo</span>
      <div className="backdrop-upload-row">
        <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()}>
          {hasCustom ? 'Replace photo…' : 'Upload photo…'}
        </button>
        {hasCustom && (
          <button type="button" className="btn btn-sm" onClick={() => void clearWalkBackdrop()}>
            Remove
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onPick} />
    </div>
  )
}
