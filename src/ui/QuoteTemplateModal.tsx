/**
 * Quote template settings dialog — lets the user customise the company branding,
 * header/footer notes, currency label, GST / markup / discount percentages, which
 * BOQ sections appear, and (when the `priceRules` flag is on) the configurable
 * supply+install rate card that prices the quote + renovation estimate.
 *
 * Accessible via the ⌘K palette ("quote-template") and the Tools menu (nested
 * inside the Quote/BOQ block, gated by the `boq` flag). Gated by `quoteTemplate`
 * (pro tier) — hidden in Simple mode automatically. The price-rule section is
 * additionally gated by `priceRules` (pro).
 */

import {
  DEFAULT_PRICE_RULES,
  type FloorRateKind,
  type TradeRates,
  type WallRateKind,
} from '../analysis/renovationCost'
import { DEFAULT_QUOTE_TEMPLATE, type QuoteTemplate } from '../export/quoteTemplate'
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { Modal } from './Modal'

/** Friendly labels for the floor-finish rate buckets. */
const FLOOR_RATE_LABELS: Record<FloorRateKind, string> = {
  tile: 'Tiles',
  stone: 'Stone / marble',
  wood: 'Timber / parquet',
  vinyl: 'Vinyl / laminate',
  other: 'Other floors',
}
/** Friendly labels for the wall-finish rate buckets. */
const WALL_RATE_LABELS: Record<WallRateKind, string> = {
  paint: 'Paint',
  tile: 'Wall tiles',
  wallpaper: 'Wallpaper',
  other: 'Other walls',
}
/** Friendly labels + units for the whole-reno trade rates (BSJ-1). */
const TRADE_RATE_META: Record<keyof TradeRates, { label: string; unit: string }> = {
  partitionPerM2: { label: 'New partitions', unit: 'per m² of wall face' },
  hackingPerM: { label: 'Hacking / demolition', unit: '/lin.m' },
  ceilingPerM2: { label: 'False ceiling / partition', unit: '/m²' },
  mePerPoint: { label: 'M&E point', unit: '/point' },
  airconPerUnit: { label: 'Aircon (indoor unit)', unit: '/unit' },
  airconTrunkingPerM: { label: 'Aircon trunking (piping run)', unit: '/lin.m' },
  glassPerM2: { label: 'Glass & aluminium', unit: '/m²' },
  plumbingFixtureEach: { label: 'Plumbing fixture install', unit: '/no.' },
  waterproofingPerM2: { label: 'Waterproofing membrane', unit: '/m²' },
  contingencyPct: { label: 'Contingency', unit: '%' },
}

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
// Helper: controlled money-rate input row (e.g. $/m², $/lin.m)

interface RateRowProps {
  label: string
  value: number
  unit: string
  onChange: (v: number) => void
}

function RateRow({ label, value, unit, onChange }: RateRowProps) {
  const id = `qt-rate-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
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
        <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          S$
        </span>
        <input
          id={id}
          type="number"
          aria-label={`${label} rate`}
          className="input"
          value={value}
          min={0}
          step={1}
          onChange={(e) => {
            const v = Number.parseFloat(e.target.value)
            onChange(Number.isFinite(v) && v >= 0 ? v : 0)
          }}
          style={{ width: 80, textAlign: 'right' }}
        />
        <span
          className="label"
          style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', width: 40 }}
        >
          {unit}
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
  const rules = useStore((s) => s.priceRules)
  const setRules = useStore((s) => s.setPriceRules)
  const resetRules = useStore((s) => s.resetPriceRules)
  const enabled = useFeature('quoteTemplate')
  // Price-rule editing is its own pro feature; the section shows only when on.
  const ratesEnabled = useFeature('priceRules')

  if (!enabled) return null

  // Per-bucket rate updaters (replace the nested object so persistence detects it).
  const setFloorRate = (kind: FloorRateKind, v: number) =>
    setRules({ ...rules, floor: { ...rules.floor, [kind]: v } })
  const setWallRate = (kind: WallRateKind, v: number) =>
    setRules({ ...rules, wall: { ...rules.wall, [kind]: v } })
  const setTradeRate = (kind: keyof TradeRates, v: number) =>
    setRules({ ...rules, trades: { ...rules.trades, [kind]: v } })
  const rulesAreDefault = JSON.stringify(rules) === JSON.stringify(DEFAULT_PRICE_RULES)

  // Partial updater: merge one field at a time.
  const update = <K extends keyof QuoteTemplate>(key: K, value: QuoteTemplate[K]) =>
    setTemplate({ ...template, [key]: value })

  const isDefault = JSON.stringify(template) === JSON.stringify(DEFAULT_QUOTE_TEMPLATE)

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Quote template"
      sub={ratesEnabled ? 'Branding, notes, tax & rates' : 'Branding, notes & tax settings'}
      width="var(--modal-sm)"
      footer={
        <div className="panel-foot">
          <button
            type="button"
            className="btn"
            onClick={() => resetTemplate()}
            disabled={isDefault}
            title="Reset to factory defaults"
          >
            Reset defaults
          </button>
          <button type="button" className="btn btn-accent" onClick={() => setOpen(false)}>
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

        {/* Price rules — configurable supply+install rates (own pro flag). */}
        {ratesEnabled ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginTop: 'var(--s-2)',
                borderBottom: '1px solid var(--border)',
                paddingBottom: 'var(--s-0)',
              }}
            >
              <span className="label" style={{ fontSize: 'var(--t-xs)', fontWeight: 600 }}>
                Price rules (rates)
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => resetRules()}
                disabled={rulesAreDefault}
                title="Reset rates to the built-in Singapore rate table"
                style={{ fontSize: 'var(--t-2xs)' }}
              >
                Reset rates
              </button>
            </div>
            <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              Flooring (supply &amp; install)
            </div>
            {(Object.keys(FLOOR_RATE_LABELS) as FloorRateKind[]).map((kind) => (
              <RateRow
                key={`floor-${kind}`}
                label={FLOOR_RATE_LABELS[kind]}
                value={rules.floor[kind]}
                unit="/m²"
                onChange={(v) => setFloorRate(kind, v)}
              />
            ))}
            <div
              className="label"
              style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 'var(--s-1)' }}
            >
              Wall finishes
            </div>
            {(Object.keys(WALL_RATE_LABELS) as WallRateKind[]).map((kind) => (
              <RateRow
                key={`wall-${kind}`}
                label={WALL_RATE_LABELS[kind]}
                value={rules.wall[kind]}
                unit="/m²"
                onChange={(v) => setWallRate(kind, v)}
              />
            ))}
            <div
              className="label"
              style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 'var(--s-1)' }}
            >
              Carpentry
            </div>
            <RateRow
              label="Built-in carpentry"
              value={rules.carpentryPerM}
              unit="/lin.m"
              onChange={(v) => setRules({ ...rules, carpentryPerM: v })}
            />
            <div
              className="label"
              style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 'var(--s-1)' }}
            >
              Renovation trades (whole-reno budget)
            </div>
            {(Object.keys(TRADE_RATE_META) as (keyof TradeRates)[]).map((kind) => (
              <RateRow
                key={`trade-${kind}`}
                label={TRADE_RATE_META[kind].label}
                value={rules.trades[kind]}
                unit={TRADE_RATE_META[kind].unit}
                onChange={(v) => setTradeRate(kind, v)}
              />
            ))}
          </>
        ) : null}
      </div>
    </Modal>
  )
}
