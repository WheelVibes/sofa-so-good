import { useState } from 'react'
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
import { Segmented } from './controls/Segmented'
import { useCopiedFlash } from './controls/useCopiedFlash'
import { Modal } from './Modal'
import { openDesignReport } from './openReport'
import { exportScene3d } from './openSceneExport'
import { canShareHeroCardNative, openShareCard, shareHeroCardNative } from './openShareCard'
import { takeEditableCopy } from './ShowroomBadge'
import type { ShareCardFormat } from './shareCard'
import { buildShareSummary } from './shareSummary'
import { Icon } from './toolbar/icons'

const SHARE_CARD_FORMAT_OPTIONS: { value: ShareCardFormat; label: string; title: string }[] = [
  { value: 'post', label: 'Post', title: 'Post — 4:5 (1080×1350)' },
  { value: 'square', label: 'Square', title: 'Square — 1:1 (1080×1080)' },
  { value: 'story', label: 'Story', title: 'Story — 9:16 (1080×1920)' },
]

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
  const shareCard = useFeature('shareCard')
  const shareCardNative = useFeature('shareCardNative')
  const viewOnlyShare = useFeature('viewOnlyShare')
  const viewOnly = useStore((s) => s.viewOnly)
  // Component-local + ephemeral (like the catalog's Max$/Fits-only controls) —
  // no existing per-device pref plumbing for a single modal-local choice, and
  // it's low-stakes enough not to warrant one.
  const [shareCardFormat, setShareCardFormat] = useState<ShareCardFormat>('post')
  // Computed once per mount (device support doesn't change mid-session) — the
  // "Share…" action only renders where `navigator.share({ files })` can
  // actually succeed; `canShareHeroCardNative` is cheap + gesture-independent
  // (unlike `share()` itself, `canShare()` has no transient-activation
  // requirement), so a lazy `useState` initializer is enough.
  const [canShareNative] = useState(() => canShareHeroCardNative())
  const [sharingCard, setSharingCard] = useState(false)

  const shareHeroCard = async () => {
    setSharingCard(true)
    try {
      const result = await shareHeroCardNative(shareCardFormat)
      if (result === 'unsupported') {
        // Platform lied about support (or changed mid-session) — fall back
        // to the download path rather than leaving the user stuck.
        await openShareCard(shareCardFormat)
      }
    } finally {
      setSharingCard(false)
    }
  }

  const toast = (title: string) => useStore.getState().notify.start({ title, kind: 'success' })

  // Inline copy-confirmation morphs (UIUX-25) — one per copy control so two
  // quick copies don't flash the wrong button.
  const link3d = useCopiedFlash()
  const linkShowroom = useCopiedFlash()
  const linkPlan = useCopiedFlash()
  const summaryFlash = useCopiedFlash()

  // A self-contained share link: the whole design (furniture, finishes, plan) is
  // encoded into the URL hash, so opening it on any device/instance reconstructs
  // it — no account or server (see features/planShare).
  const copyPlanLink = () => {
    try {
      const url = buildPlanShareUrl(encodeDesignToCode(useStore.getState()))
      void navigator.clipboard?.writeText(url)
      linkPlan.flash()
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
      link3d.flash()
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

  // The showroom link (U1): the SAME encode path as the 3D link with the
  // envelope's `viewOnly` capability set, handed out on the `#/showroom/` route.
  // Honest framing for reviewers and for the copy below: this is a UX
  // capability, not a security boundary. The whole design travels in the URL
  // fragment with no server in the loop (OWASP ASVS 4.1.1 — client-side access
  // control "is often easy to bypass"; enforcement needs a trusted service
  // layer, and this app has none by design). Anyone determined can recover an
  // editable copy — and the showroom UI offers them one outright. What the flag
  // buys is the DEFAULT experience and the sender's stated intent, which is
  // exactly what every real-estate virtual tour ships.
  const copyShowroomLink = () => {
    try {
      const url = buildDesignShareUrl(encodeDesignShareCode(useStore.getState(), true), true)
      void navigator.clipboard?.writeText(url)
      linkShowroom.flash()
      toast('Showroom link copied — opens as a tour, not an editable copy')
    } catch (e) {
      useStore.getState().notify.start({
        title: "Couldn't create a showroom link",
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
    summaryFlash.flash()
    toast('Summary copied to clipboard')
  }

  if (!open) return null

  return (
    <Modal
      open
      onClose={() => setOpen(false)}
      title="Share design"
      sub={planName}
      width="var(--modal-sm)"
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
        {viewOnlyShare && (
          <>
            <button
              type="button"
              className="btn btn-accent btn-block"
              onClick={copyShowroomLink}
              style={{ marginBottom: 'var(--s-2)' }}
            >
              {linkShowroom.copied ? (
                <Icon.Check className="done-pop" width={14} height={14} />
              ) : (
                <Icon.Eye width={14} height={14} />
              )}
              {linkShowroom.copied ? 'Copied!' : 'Copy showroom link'}
            </button>
            <p
              style={{
                fontSize: 'var(--t-2xs)',
                color: 'var(--text-3)',
                margin: '0 0 var(--s-3)',
                lineHeight: 1.4,
              }}
            >
              <b style={{ color: 'var(--text-2)' }}>Showroom</b> opens your home as a tour: they can
              orbit, walk through it, change the light, the weather and the render quality — but
              nothing they do changes your design. They can still take their own copy if they want
              one.
            </p>
          </>
        )}
        <button
          type="button"
          className={viewOnlyShare ? 'btn btn-soft btn-block' : 'btn btn-accent btn-block'}
          onClick={copy3dLink}
        >
          {link3d.copied ? (
            <Icon.Check className="done-pop" width={14} height={14} />
          ) : (
            <Icon.Copy width={14} height={14} />
          )}
          {link3d.copied ? 'Copied!' : 'Copy 3D link'}
        </button>
        <button
          type="button"
          className="btn btn-soft btn-block"
          onClick={copyPlanLink}
          style={{ marginTop: 'var(--s-2)' }}
        >
          {linkPlan.copied ? (
            <Icon.Check className="done-pop" width={14} height={14} />
          ) : (
            <Icon.Copy width={14} height={14} />
          )}
          {linkPlan.copied ? 'Copied!' : 'Copy plan link'}
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
          The showroom and 3D links are capped at ~16 KB; the plan link has no cap.
        </p>
      </div>

      {viewOnlyShare && viewOnly && (
        <div className="sec">
          <div className="sec-h">
            <span>You're in a showroom</span>
          </div>
          <p
            style={{
              fontSize: 'var(--t-2xs)',
              color: 'var(--text-3)',
              margin: '0 0 var(--s-2)',
              lineHeight: 1.4,
            }}
          >
            Someone shared this home with you as a tour. Take your own copy to unlock every tool —
            their link keeps working exactly as it did.
          </p>
          <button
            type="button"
            className="btn btn-soft btn-block"
            onClick={() => {
              takeEditableCopy()
              setOpen(false)
            }}
          >
            <Icon.Edit width={14} height={14} />
            Make it mine
          </button>
        </div>
      )}

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
        {shareCard && (
          <>
            <div style={{ marginBottom: 'var(--s-2)' }}>
              <Segmented
                value={shareCardFormat}
                onChange={(v) => setShareCardFormat(v as ShareCardFormat)}
                options={SHARE_CARD_FORMAT_OPTIONS}
                ariaLabel="Hero image format"
              />
            </div>
            <div
              style={
                shareCardNative && canShareNative
                  ? { display: 'flex', gap: 'var(--s-2)' }
                  : undefined
              }
            >
              {shareCardNative && canShareNative && (
                <button
                  type="button"
                  className="btn btn-accent"
                  style={{ flex: 1 }}
                  disabled={sharingCard}
                  onClick={() => {
                    void shareHeroCard()
                  }}
                >
                  <Icon.Share width={14} height={14} />
                  Share…
                </button>
              )}
              <button
                type="button"
                className={
                  shareCardNative && canShareNative ? 'btn btn-soft' : 'btn btn-accent btn-block'
                }
                style={shareCardNative && canShareNative ? { flex: 1 } : undefined}
                onClick={() => {
                  void openShareCard(shareCardFormat)
                }}
              >
                <Icon.Frame width={14} height={14} />
                {shareCardNative && canShareNative ? 'Save' : 'Save hero image'}
              </button>
            </div>
            <p
              style={{
                fontSize: 'var(--t-2xs)',
                color: 'var(--text-3)',
                margin: 'var(--s-2) 0 var(--s-3)',
                lineHeight: 1.4,
              }}
            >
              A share-ready card: your 3D view framed with the design's palette, name and stats.
            </p>
          </>
        )}
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
            {summaryFlash.copied ? (
              <Icon.Check className="done-pop" width={14} height={14} />
            ) : (
              <Icon.Copy width={14} height={14} />
            )}
            {summaryFlash.copied ? 'Copied!' : 'Copy summary'}
          </button>
        </div>
      </div>

      {aiPhotoreal && <AiPhotorealSection />}
    </Modal>
  )
}
