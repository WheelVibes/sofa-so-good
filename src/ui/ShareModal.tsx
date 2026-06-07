import { buildMergedCatalog } from '../furniture/catalog'
import { EXPORT_EVENT } from '../scene/ScreenshotController'
import { exportDesignToFile } from '../state/storage/designFile'
import { useStore } from '../state/store'
import { AiPhotorealSection } from './ai/AiPhotorealSection'
import { Modal } from './Modal'
import { openDesignReport } from './openReport'
import { buildShareSummary } from './shareSummary'
import { Icon } from './toolbar/icons'

/** Share & export modal: a shareable link, project notes, and PNG / PDF export.
 *  The PNG export fires the canvas screenshot event; the PDF opens the real
 *  printable design report (save-as-PDF from the print dialog). */
export function ShareModal() {
  const open = useStore((s) => s.shareOpen)
  const setOpen = useStore((s) => s.setShareOpen)
  const planName = useStore((s) => s.floorPlan.name)
  const designNote = useStore((s) => s.designNote)
  const setDesignNote = useStore((s) => s.setDesignNote)

  // The real app URL (so the copied link actually opens the app). Designs live
  // in the browser, so the link opens the editor — share the design itself as a
  // portable file via the Versions panel's Export.
  const link = typeof window !== 'undefined' ? window.location.href : ''

  const toast = (title: string) => useStore.getState().notify.start({ title, kind: 'success' })

  // A one-line text summary (name · area · items · est. cost) for quick sharing
  // in a chat/email — distinct from the full report / portable file.
  const copySummary = () => {
    const s = useStore.getState()
    const text = buildShareSummary(s.floorPlan, s.items, buildMergedCatalog(s), s.units)
    void navigator.clipboard?.writeText(text)
    toast('Summary copied to clipboard')
  }

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
          <span>App link</span>
        </div>
        <p
          style={{
            fontSize: 'var(--t-2xs)',
            color: 'var(--text-3)',
            margin: '0 0 var(--s-2)',
            lineHeight: 1.4,
          }}
        >
          Opens the editor. To send your actual design, use “Export file” below and share the
          downloaded .sofa.json.
        </p>
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
          <span>Project notes</span>
        </div>
        <textarea
          value={designNote}
          onChange={(e) => setDesignNote(e.target.value)}
          placeholder="A brief, client preferences, a to-do… saved with the design and shown in the report."
          rows={3}
          className="input"
          style={{ width: '100%', resize: 'vertical', minHeight: 56, lineHeight: 1.4 }}
          aria-label="Project notes"
        />
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
              openDesignReport()
            }}
          >
            <Icon.Report width={14} height={14} />
            Shoppable PDF
          </button>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              exportDesignToFile(
                useStore.getState(),
                `sofa-design-${new Date().toISOString().slice(0, 10)}`,
              )
              toast('Design file downloaded (.sofa.json)')
            }}
          >
            <Icon.Download width={14} height={14} />
            Export file
          </button>
          <button type="button" className="btn btn-soft" onClick={copySummary}>
            <Icon.Copy width={14} height={14} />
            Copy summary
          </button>
        </div>
      </div>

      <AiPhotorealSection />
    </Modal>
  )
}
