/**
 * Drawing callouts panel (PARITY-LIGHTINGTEMPLATE-TEXT): manage free-text
 * annotations that appear on construction drawing-set sheets when exported.
 *
 * A callout = a text string + which sheet it targets (cover, floor plan,
 * elevations, etc.) + a normalised [0,1]×[0,1] anchor on the sheet.  The
 * panel lists existing callouts and lets the user add/edit/delete them.
 * Docks to the shared `.aux` slot like Comments and History panels.
 *
 * Follows the CommentsPanel UI patterns (panel-head, panel-body, clr-list /
 * clr-item, icon-btn, promptText for text entry) and CSS token vocabulary —
 * no hardcoded colours, works in light + dark across all 5 themes.
 */
import { useShallow } from 'zustand/react/shallow'
import type { CalloutSheet } from '../state/slices/drawingCalloutsSlice'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'
import { Icon } from './toolbar/icons'

/** Human labels for each sheet target — shown in the picker and the list. */
const SHEET_LABELS: Record<CalloutSheet, string> = {
  cover: 'Cover (A-0)',
  'floor-plan': 'Floor plan',
  elevations: 'Wall elevations',
  lighting: 'Lighting plan',
  dimensions: 'Dimensioned plan',
  section: 'Cross-section',
  electrical: 'Electrical plan',
  plumbing: 'Plumbing plan',
  finishes: 'Finishes schedule',
  demolition: 'Demolition plan',
  ffe: 'FF&E schedule',
  carpentry: 'Carpentry sheets',
  'opening-schedule': 'Door & window schedule',
  rcp: 'Reflected ceiling plan',
}

const SHEET_KEYS: CalloutSheet[] = [
  'cover',
  'floor-plan',
  'elevations',
  'lighting',
  'dimensions',
  'section',
  'electrical',
  'plumbing',
  'rcp',
  'finishes',
  'demolition',
  'ffe',
  'opening-schedule',
  'carpentry',
]

/** Format a normalised position as a human-readable string (percentage). */
function fmtPos(x: number, y: number) {
  return `${Math.round(x * 100)}%, ${Math.round(y * 100)}%`
}

/**
 * Drawing callouts panel — lists all callouts and lets the user add/edit/delete
 * them.  Positions are entered as percentage values (0–100) in the add dialog
 * for simplicity; they are stored as normalised [0,1] floats.
 */
export function DrawingCalloutsPanel() {
  const open = useStore((s) => s.drawingCalloutsOpen)
  const setOpen = useStore((s) => s.setDrawingCalloutsOpen)
  const callouts = useStore(useShallow((s) => s.drawingCallouts))

  if (!open) return null

  /** Add a new callout via the promptText chain:
   *  1) Prompt for the note text.
   *  2) Prompt for the sheet target (presented as a numeric choice).
   *  3) Prompt for anchor position (x%, y%).
   *  4) Optionally prompt for a leader tip position.
   *  All via the existing `promptText` store action so it follows the same
   *  modal-guard + hotkey-suppression path as other text prompts. */
  const addCallout = async () => {
    const s = useStore.getState()

    // Step 1: text.
    const text = await s.promptText({
      title: 'Add sheet callout',
      label: 'Callout text (multi-line: Shift+Enter)',
      defaultValue: '',
      submitLabel: 'Next →',
    })
    if (!text?.trim()) return

    // Step 2: sheet target via a numeric pick (simplest approach within
    // the text-prompt chain).
    const sheetOptions = SHEET_KEYS.map((k, i) => `${i + 1}. ${SHEET_LABELS[k]}`).join('\n')
    const sheetPick = await s.promptText({
      title: 'Which sheet?',
      label: `Enter a number:\n${sheetOptions}`,
      defaultValue: '2',
      submitLabel: 'Next →',
    })
    if (!sheetPick) return
    const sheetIdx = parseInt(sheetPick.trim(), 10) - 1
    if (Number.isNaN(sheetIdx) || sheetIdx < 0 || sheetIdx >= SHEET_KEYS.length) return
    const sheet = SHEET_KEYS[sheetIdx]!

    // Step 3: anchor position (x%, y% from top-left of the drawing area).
    const posPick = await s.promptText({
      title: 'Callout position',
      label: 'X%, Y% from top-left of sheet (e.g. "80, 10" for top-right area)',
      defaultValue: '80, 10',
      submitLabel: 'Next →',
    })
    if (!posPick) return
    const [px, py] = posPick.split(',').map((v) => parseFloat(v.trim()))
    if (!Number.isFinite(px) || !Number.isFinite(py)) return
    const x = Math.min(Math.max(px / 100, 0), 1)
    const y = Math.min(Math.max(py / 100, 0), 1)

    // Step 4: optional leader tip.
    const leaderPick = await s.promptText({
      title: 'Leader line tip (optional)',
      label:
        'X%, Y% for leader line tip — points from the callout to this spot.\nLeave blank to skip.',
      defaultValue: '',
      submitLabel: 'Add callout',
    })
    let leaderX: number | undefined
    let leaderY: number | undefined
    if (leaderPick?.trim()) {
      const [lx, ly] = leaderPick.split(',').map((v) => parseFloat(v.trim()))
      if (Number.isFinite(lx) && Number.isFinite(ly)) {
        leaderX = Math.min(Math.max(lx / 100, 0), 1)
        leaderY = Math.min(Math.max(ly / 100, 0), 1)
      }
    }

    useStore.getState().addDrawingCallout({
      text: text.trim(),
      sheet,
      x,
      y,
      ...(leaderX !== undefined && leaderY !== undefined ? { leaderX, leaderY } : {}),
    })
  }

  const editCallout = async (id: string) => {
    const s = useStore.getState()
    const c = s.drawingCallouts.find((x) => x.id === id)
    if (!c) return
    const text = await s.promptText({
      title: 'Edit callout',
      label: 'Callout text',
      defaultValue: c.text,
      submitLabel: 'Save',
    })
    if (text) s.updateDrawingCalloutText(id, text)
  }

  return (
    <aside className="panel mini aux" id="drawingCalloutsPanel">
      <AuxPanelHead
        title="Sheet callouts"
        sub={
          callouts.length === 0
            ? 'Free-text notes on drawing-set sheets'
            : `${callouts.length} callout${callouts.length !== 1 ? 's' : ''} — appear on export`
        }
        docs="drawingCallouts"
        onClose={() => setOpen(false)}
      />
      <hr className="hr" />
      <div className="panel-body">
        <button
          type="button"
          className="btn btn-soft btn-sm"
          style={{ width: '100%', marginBottom: 'var(--s-2)' }}
          onClick={() => void addCallout()}
        >
          + Add callout
        </button>

        {callouts.length === 0 ? (
          <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            No callouts yet. Add one to annotate a specific sheet — the text appears when the
            drawing set is exported.
          </div>
        ) : (
          <div className="clr-list">
            {callouts.map((c, i) => (
              <div
                key={c.id}
                className="clr-item"
                style={{
                  display: 'flex',
                  gap: 'var(--s-2)',
                  alignItems: 'flex-start',
                  borderLeftColor: 'var(--accent)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 'var(--t-xs)',
                      overflowWrap: 'anywhere',
                      display: 'block',
                    }}
                  >
                    <strong>#{i + 1}</strong> {/* Show truncated text preview — first line only. */}
                    {c.text.split('\n')[0]}
                    {c.text.includes('\n') && <span style={{ color: 'var(--text-3)' }}> …</span>}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--t-2xs)',
                      color: 'var(--text-3)',
                      marginTop: 2,
                    }}
                  >
                    {SHEET_LABELS[c.sheet]} · {fmtPos(c.x, c.y)}
                    {c.leaderX !== undefined && c.leaderY !== undefined && (
                      <> · leader → {fmtPos(c.leaderX, c.leaderY)}</>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Edit callout ${i + 1}`}
                  title="Edit text"
                  onClick={() => void editCallout(c.id)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Delete callout ${i + 1}`}
                  title="Delete"
                  onClick={() => useStore.getState().deleteDrawingCallout(c.id)}
                >
                  <Icon.Trash width={14} height={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {callouts.length > 0 && (
          <div
            style={{
              marginTop: 'var(--s-3)',
              fontSize: 'var(--t-2xs)',
              color: 'var(--text-3)',
              borderTop: '1px solid var(--border)',
              paddingTop: 'var(--s-2)',
            }}
          >
            Callouts render on the target sheet when "Drawing set" is exported. Positions are % from
            the top-left of the drawing area. A hidden layer's callouts are also hidden.
          </div>
        )}
      </div>
    </aside>
  )
}
