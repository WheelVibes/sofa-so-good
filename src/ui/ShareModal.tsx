import {
  buildDesignShareUrl,
  DesignShareError,
  encodeDesignShareCode,
} from '../features/designShare'
import { buildPlanShareUrl, encodeDesignToCode, PlanShareError } from '../features/planShare'
import { useFeature } from '../features/useFeature'
import { buildMergedCatalog } from '../furniture/catalog'
import { EXPORT_EVENT } from '../scene/ScreenshotController'
import { exportDesignToFile } from '../state/storage/designFile'
import { useStore } from '../state/store'
import { AiPhotorealSection } from './ai/AiPhotorealSection'
import { Modal } from './Modal'
import { openDesignReport } from './openReport'
import { exportScene3d } from './openSceneExport'
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
  const aiPhotoreal = useFeature('aiPhotoreal')
  const sceneExport = useFeature('sceneExport3d')

  const toast = (title: string) => useStore.getState().notify.start({ title, kind: 'success' })

  // A self-contained share link: the whole design (furniture, finishes, plan) is
  // encoded into the URL hash, so opening it on any device/instance reconstructs
  // it — no account or server (see features/planShare).
  const copyPlanLink = () => {
    try {
      const url = buildPlanShareUrl(encodeDesignToCode(useStore.getState()))
      void navigator.clipboard?.writeText(url)
      toast('Plan link copied — opens this exact design anywhere')
    } catch (e) {
      useStore.getState().notify.start({
        title: "Couldn't create a plan link",
        kind: 'error',
        message: e instanceof PlanShareError ? e.message : undefined,
      })
    }
  }

  // The compact "3D link": same self-contained idea, but session noise +
  // uploaded-model defs are stripped and the code is hard-capped (~16 KB) so it
  // pastes cleanly into chats. Too-large designs are pointed at the file export.
  const copy3dLink = () => {
    try {
      const url = buildDesignShareUrl(encodeDesignShareCode(useStore.getState()))
      void navigator.clipboard?.writeText(url)
      toast('3D link copied — opens an editable copy of this design')
    } catch (e) {
      useStore.getState().notify.start({
        title: "Couldn't create a 3D link",
        kind: 'error',
        message:
          e instanceof DesignShareError
            ? e.message
            : 'Something went wrong — try Export file (.sofa.json) instead.',
      })
    }
  }

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
      <div className="sec">
        <div className="sec-h">
          <span>Share this design</span>
        </div>
        <p
          style={{
            fontSize: 'var(--t-2xs)',
            color: 'var(--text-3)',
            margin: '0 0 var(--s-2)',
            lineHeight: 1.4,
          }}
        >
          Copies a link that opens this exact design — furniture, finishes and floor plan — on any
          device. No account needed; the whole design travels in the link.
        </p>
        <button type="button" className="btn btn-accent btn-block" onClick={copy3dLink}>
          <Icon.Copy width={14} height={14} />
          Copy 3D link
        </button>
        <button
          type="button"
          className="btn btn-soft btn-block"
          onClick={copyPlanLink}
          style={{ marginTop: 'var(--s-2)' }}
        >
          <Icon.Copy width={14} height={14} />
          Copy plan link
        </button>
        <p
          style={{
            fontSize: 'var(--t-2xs)',
            color: 'var(--text-3)',
            margin: 'var(--s-2) 0 0',
            lineHeight: 1.4,
          }}
        >
          Your uploaded models can't travel in a link — use Export file (.sofa.json) to share those.
          The 3D link is capped at ~16 KB; the plan link has no cap.
        </p>
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
          {sceneExport && (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                setOpen(false)
                void exportScene3d('glb')
              }}
            >
              <Icon.Download width={14} height={14} />
              Export 3D (.glb)
            </button>
          )}
          <button type="button" className="btn btn-soft" onClick={copySummary}>
            <Icon.Copy width={14} height={14} />
            Copy summary
          </button>
        </div>
      </div>

      {aiPhotoreal && <AiPhotorealSection />}
    </Modal>
  )
}
