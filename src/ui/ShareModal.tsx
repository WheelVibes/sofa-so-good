import { EXPORT_EVENT } from '../scene/ScreenshotController'
import { useStore } from '../state/store'
import { Modal } from './Modal'
import { Icon } from './toolbar/icons'

/** Share & export modal: a shareable link, view-visibility options, and PNG /
 *  PDF export. The PNG export is real (fires the canvas screenshot event); the
 *  link + PDF confirm with a toast (front-end prototype). */
export function ShareModal() {
  const open = useStore((s) => s.shareOpen)
  const setOpen = useStore((s) => s.setShareOpen)
  const planName = useStore((s) => s.floorPlan.name)

  const link = `hdb.design/s/4rm-${planName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 18)}`

  const toast = (title: string) => useStore.getState().notify.start({ title, kind: 'success' })

  if (!open) return null

  return (
    <Modal
      open
      onClose={() => setOpen(false)}
      title="Share design"
      sub={planName}
      width={440}
      panelId="sharePanel"
    >
      <div className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="sec-h">
          <span>Shareable link</span>
        </div>
        <div className="share-link">
          <div className="field">
            <Icon.Eye width={16} height={16} className="icn" />
            <input className="input" readOnly value={link} />
          </div>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => {
              void navigator.clipboard?.writeText(link)
              toast('Link copied to clipboard')
            }}
          >
            <Icon.Copy width={14} height={14} />
            Copy
          </button>
        </div>
      </div>

      <div className="sec">
        <div className="sec-h">
          <span>Export</span>
        </div>
        <div className="export-row">
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              setOpen(false)
              window.dispatchEvent(new Event(EXPORT_EVENT))
            }}
          >
            <Icon.Download width={14} height={14} />
            Snapshot PNG
          </button>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              setOpen(false)
              toast('Shoppable PDF exported')
            }}
          >
            <Icon.Report width={14} height={14} />
            Shoppable PDF
          </button>
        </div>
      </div>
    </Modal>
  )
}
