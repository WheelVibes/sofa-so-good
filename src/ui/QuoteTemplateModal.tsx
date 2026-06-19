/**
 * Quote template settings dialog — lets the user customise the company branding,
 * header/footer notes, currency label, GST / markup / discount percentages, and
 * which BOQ sections appear in their exported quote.
 *
 * Accessible via the ⌘K palette ("quote-template") and the Tools menu (nested
 * inside the Quote/BOQ block, gated by the `boq` flag). Gated by `quoteTemplate`
 * (pro tier) — hidden in Simple mode automatically.
 */

import { DEFAULT_QUOTE_TEMPLATE, type QuoteTemplate } from '../export/quoteTemplate'
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { Modal } from './Modal'

// ---------------------------------------------------------------------------
// Helper: controlled text input row

interface TextRowProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  ariaLabel?: string
}

function TextRow({ label, value, onChange, placeholder, multiline, ariaLabel }: TextRowProps) {
  const id = `qt-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-0)' }}>
      <label htmlFor={id} className="label" style={{ fontSize: 'var(--t-xs)' }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          aria-label={ariaLabel ?? label}
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 'var(--t-xs)' }}
        />
      ) : (
        <input
          id={id}
          type="text"
          aria-label={ariaLabel ?? label}
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper: controlled number input row (percentage)

interface PctRowProps {
  label: string
  value: number
  onChange: (v: number) => void
  ariaLabel?: string
}

function PctRow({ label, value, onChange, ariaLabel }: PctRowProps) {
  const id = `qt-pct-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--s-1)',
      }}
    >
      <label
        htmlFor={id}
        className="label"
        style={{ fontSize: 'var(--t-xs)', flex: 1, cursor: 'default' }}
      >
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-0)' }}>
        <input
          id={id}
          type="number"
          aria-label={ariaLabel ?? label}
          className="input"
          value={value}
          min={0}
          max={99}
          step={0.1}
          onChange={(e) => {
            const v = Number.parseFloat(e.target.value)
            onChange(Number.isFinite(v) && v >= 0 ? v : 0)
          }}
          style={{ width: 72, textAlign: 'right' }}
        />
        <span className="label" style={{ fontSize: 'var(--t-xs)' }}>
          %
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper: checkbox row for section visibility

interface CheckRowProps {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}

function CheckRow({ label, checked, onChange }: CheckRowProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-1)',
        fontSize: 'var(--t-xs)',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Section heading

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="label"
      style={{
        fontSize: 'var(--t-xs)',
        fontWeight: 600,
        marginTop: 'var(--s-2)',
        borderBottom: '1px solid var(--border)',
        paddingBottom: 'var(--s-0)',
      }}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main modal

/** Quote template settings modal.
 *  Gate: `quoteTemplate` (pro) — rendered only when the flag is on. */
export function QuoteTemplateModal() {
  const open = useStore((s) => s.quoteTemplateOpen)
  const setOpen = useStore((s) => s.setQuoteTemplateOpen)
  const template = useStore((s) => s.quoteTemplate)
  const setTemplate = useStore((s) => s.setQuoteTemplate)
  const resetTemplate = useStore((s) => s.resetQuoteTemplate)
  const enabled = useFeature('quoteTemplate')

  if (!enabled) return null

  // Partial updater: merge one field at a time.
  const update = <K extends keyof QuoteTemplate>(key: K, value: QuoteTemplate[K]) =>
    setTemplate({ ...template, [key]: value })

  const isDefault = JSON.stringify(template) === JSON.stringify(DEFAULT_QUOTE_TEMPLATE)

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Quote template"
      sub="Branding, notes & tax settings"
      width={400}
      footer={
        <div
          className="panel-foot"
          style={{ display: 'flex', gap: 'var(--s-1)', justifyContent: 'flex-end' }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => resetTemplate()}
            disabled={isDefault}
            title="Reset to factory defaults"
          >
            Reset defaults
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
        {/* Company branding */}
        <SectionHeading>Company</SectionHeading>
        <TextRow
          label="Company name"
          ariaLabel="Company name"
          value={template.companyName}
          onChange={(v) => update('companyName', v)}
          placeholder="e.g. ABC Interior Design Pte Ltd"
        />
        <TextRow
          label="Contact line"
          ariaLabel="Contact line"
          value={template.contactLine}
          onChange={(v) => update('contactLine', v)}
          placeholder="Address, phone, email"
        />

        {/* Notes */}
        <SectionHeading>Notes</SectionHeading>
        <TextRow
          label="Header note"
          ariaLabel="Header note"
          value={template.headerNote}
          onChange={(v) => update('headerNote', v)}
          placeholder="Shown before the item tables"
          multiline
        />
        <TextRow
          label="Footer / terms"
          ariaLabel="Footer / terms"
          value={template.footerNote}
          onChange={(v) => update('footerNote', v)}
          placeholder="Terms and conditions, disclaimers"
          multiline
        />

        {/* Currency */}
        <SectionHeading>Currency</SectionHeading>
        <TextRow
          label="Currency label"
          ariaLabel="Currency label"
          value={template.currencyLabel}
          onChange={(v) => update('currencyLabel', v || 'SGD')}
          placeholder="SGD"
        />

        {/* Tax & adjustments */}
        <SectionHeading>Tax & adjustments</SectionHeading>
        <PctRow
          label="Markup"
          ariaLabel="Markup percent"
          value={template.markupPercent}
          onChange={(v) => update('markupPercent', v)}
        />
        <PctRow
          label="Discount"
          ariaLabel="Discount percent"
          value={template.discountPercent}
          onChange={(v) => update('discountPercent', v)}
        />
        <PctRow
          label="GST"
          ariaLabel="GST percent"
          value={template.gstPercent}
          onChange={(v) => update('gstPercent', v)}
        />
        <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          Order: subtotals → markup → discount → GST. Zero = omit the row.
        </div>

        {/* Section visibility */}
        <SectionHeading>Show sections</SectionHeading>
        <CheckRow
          label="FF&E (Furniture, Fixtures & Equipment)"
          checked={template.showFfe}
          onChange={(v) => update('showFfe', v)}
        />
        <CheckRow
          label="Flooring"
          checked={template.showFloor}
          onChange={(v) => update('showFloor', v)}
        />
        <CheckRow
          label="Wall Finishes"
          checked={template.showWall}
          onChange={(v) => update('showWall', v)}
        />
        <CheckRow
          label="Carpentry"
          checked={template.showCarpentry}
          onChange={(v) => update('showCarpentry', v)}
        />
      </div>
    </Modal>
  )
}
