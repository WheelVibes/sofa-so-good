import { type CSSProperties, useState } from 'react'
import { CUSTOM_META_MAX_ENTRIES } from '../../furniture/itemMetaLimits'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Button } from '../controls/Button'
import { Icon } from '../toolbar/icons'
import { InspectorSection } from './InspectorSection'
import { validateItemUrl } from './itemMetaValidation'

type CustomRow = { key: string; value: string }

const LABEL_STYLE: CSSProperties = {
  fontSize: 'var(--t-2xs)',
  color: 'var(--text-3)',
  display: 'block',
}

/**
 * "Notes & link" inspector section (ITEM-META): per-INSTANCE handover
 * metadata — a custom price override, brand/model/supplier (the standard FF&E
 * spec-book fields), a custom product/spec URL, a free-text description,
 * special remarks ("existing — retain", "client to purchase", install
 * notes), and a "Custom fields" list of arbitrary user-defined key/value
 * pairs (capped at `CUSTOM_META_MAX_ENTRIES`, add/remove rows). Shown on both
 * the desktop dock panel and the mobile bottom-sheet inspector (this
 * component is shared by both — `InspectorPanel.tsx` renders one tree for
 * either surface). Gated by the `itemMeta` Pro flag in `InspectorPanel.tsx`.
 *
 * Metadata is purely annotative — edits go through the dedicated
 * `setItemMeta` store action (coalesced undo, one step per burst of typing),
 * never `updateItemProps`, so a note never touches geometry/render props
 * EXCEPT `price`, which is read by `furniturePrices.ts:itemPrice` as a
 * per-instance override (still never touches geometry/render caches).
 */
export function ItemMetaSection({ item }: { item: FurnitureItem }) {
  const setItemMeta = useStore((s) => s.setItemMeta)
  const hasMeta = Boolean(
    item.meta?.url ||
      item.meta?.price !== undefined ||
      item.meta?.brand ||
      item.meta?.model ||
      item.meta?.supplier ||
      item.meta?.description ||
      item.meta?.remarks ||
      (item.meta?.custom?.length ?? 0) > 0,
  )
  // Local draft for the URL field so an in-progress (possibly invalid) edit
  // shows its own error state without touching the committed store value
  // until it validates on blur — never blocks the other fields.
  const [urlDraft, setUrlDraft] = useState(item.meta?.url ?? '')
  const [urlTouched, setUrlTouched] = useState(false)
  const urlError = urlTouched ? validateItemUrl(urlDraft) : null
  const openHref = !validateItemUrl(item.meta?.url ?? '') && item.meta?.url ? item.meta.url : null
  // Same "don't block other fields" treatment for price: an invalid entry
  // (negative/NaN) shows an inline error and is never committed to the store.
  const [priceDraft, setPriceDraft] = useState(item.meta?.price?.toString() ?? '')
  const [priceTouched, setPriceTouched] = useState(false)
  const priceInvalid =
    priceTouched &&
    priceDraft.trim() !== '' &&
    (!Number.isFinite(Number(priceDraft)) || Number(priceDraft) < 0)
  // Local draft rows for the user-defined "Custom fields" list — this
  // component owns the array (not re-derived from the `item` prop after
  // mount) so an in-progress blank row (typed but not yet blurred, or added
  // via "Add field") stays visible even though the store drops blank-key/
  // blank-value entries on commit.
  const [customRows, setCustomRows] = useState<CustomRow[]>(item.meta?.custom ?? [])

  const commit = (
    patch: Partial<{
      url: string
      price: number
      brand: string
      model: string
      supplier: string
      description: string
      remarks: string
      custom: CustomRow[]
    }>,
  ) => {
    // Read the LIVE item from the store rather than closing over the `item`
    // prop: several of these fields blur in quick succession (tabbing
    // through Brand → Model → Supplier), and each is an independent
    // uncontrolled field with its own onBlur — merging against a stale prop
    // snapshot would silently drop whichever field committed first if this
    // component hasn't re-rendered with the freshly-committed store value
    // yet (React re-renders are not guaranteed to land between two blur
    // events that fire back-to-back).
    const live = useStore.getState().items.find((i) => i.id === item.id)?.meta ?? item.meta
    setItemMeta(item.id, {
      url: live?.url ?? '',
      price: live?.price,
      brand: live?.brand ?? '',
      model: live?.model ?? '',
      supplier: live?.supplier ?? '',
      description: live?.description ?? '',
      remarks: live?.remarks ?? '',
      custom: live?.custom ?? [],
      ...patch,
    })
  }

  const commitCustomRows = (rows: CustomRow[]) => commit({ custom: rows })
  const updateCustomRow = (idx: number, patch: Partial<CustomRow>) =>
    setCustomRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const removeCustomRow = (idx: number) => {
    const next = customRows.filter((_, i) => i !== idx)
    setCustomRows(next)
    commitCustomRows(next)
  }
  const addCustomRow = () => {
    if (customRows.length >= CUSTOM_META_MAX_ENTRIES) return
    setCustomRows((rows) => [...rows, { key: '', value: '' }])
  }

  return (
    <InspectorSection
      title="Notes & link"
      defaultOpen={hasMeta}
      headerRight={
        hasMeta ? (
          <span title="Has notes" style={{ display: 'flex', flex: 'none' }}>
            <Icon.Book
              width={13}
              height={13}
              style={{ color: 'var(--text-3)' }}
              aria-label="Has notes"
            />
          </span>
        ) : null
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--s-2)',
          marginTop: 'var(--s-2)',
        }}
      >
        <div className="fld" style={{ display: 'block' }}>
          <label className="label" style={LABEL_STYLE} htmlFor={`item-meta-price-${item.id}`}>
            Price override
          </label>
          <input
            id={`item-meta-price-${item.id}`}
            type="number"
            step="any"
            min={0}
            inputMode="decimal"
            className="input"
            placeholder="SGD"
            value={priceDraft}
            aria-label="Custom price override (SGD)"
            aria-invalid={priceInvalid ? 'true' : undefined}
            style={{
              width: '100%',
              borderColor: priceInvalid ? 'var(--danger)' : undefined,
            }}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={() => {
              setPriceTouched(true)
              const trimmed = priceDraft.trim()
              if (trimmed === '') {
                commit({ price: undefined })
                return
              }
              const n = Number(trimmed)
              if (Number.isFinite(n) && n >= 0) commit({ price: n })
            }}
          />
          {priceInvalid ? (
            <span
              role="alert"
              style={{ fontSize: 'var(--t-2xs)', color: 'var(--danger)', display: 'block' }}
            >
              Enter a price of 0 or more
            </span>
          ) : null}
        </div>
        <div className="fld" style={{ display: 'block' }}>
          <label className="label" style={LABEL_STYLE} htmlFor={`item-meta-brand-${item.id}`}>
            Brand
          </label>
          <input
            id={`item-meta-brand-${item.id}`}
            type="text"
            className="input"
            aria-label="Brand / manufacturer"
            defaultValue={item.meta?.brand ?? ''}
            key={`brand-${item.id}`}
            onBlur={(e) => commit({ brand: e.target.value })}
            style={{ width: '100%' }}
          />
        </div>
        <div className="fld" style={{ display: 'block' }}>
          <label className="label" style={LABEL_STYLE} htmlFor={`item-meta-model-${item.id}`}>
            Model / SKU
          </label>
          <input
            id={`item-meta-model-${item.id}`}
            type="text"
            className="input"
            aria-label="Model or SKU"
            defaultValue={item.meta?.model ?? ''}
            key={`model-${item.id}`}
            onBlur={(e) => commit({ model: e.target.value })}
            style={{ width: '100%' }}
          />
        </div>
        <div className="fld" style={{ display: 'block' }}>
          <label className="label" style={LABEL_STYLE} htmlFor={`item-meta-supplier-${item.id}`}>
            Supplier
          </label>
          <input
            id={`item-meta-supplier-${item.id}`}
            type="text"
            className="input"
            aria-label="Supplier / vendor"
            defaultValue={item.meta?.supplier ?? ''}
            key={`supplier-${item.id}`}
            onBlur={(e) => commit({ supplier: e.target.value })}
            style={{ width: '100%' }}
          />
        </div>
      </div>
      <div className="fld" style={{ display: 'block', marginTop: 'var(--s-2)' }}>
        <label className="label" style={LABEL_STYLE} htmlFor={`item-meta-url-${item.id}`}>
          Product / spec URL
        </label>
        <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-1)' }}>
          <input
            id={`item-meta-url-${item.id}`}
            type="text"
            inputMode="url"
            className="input"
            placeholder="https://…"
            value={urlDraft}
            aria-label="Custom item URL"
            aria-invalid={urlError ? 'true' : undefined}
            style={{ flex: 1, minWidth: 0, borderColor: urlError ? 'var(--danger)' : undefined }}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => {
              setUrlTouched(true)
              if (!validateItemUrl(urlDraft)) commit({ url: urlDraft })
            }}
          />
          {openHref ? (
            <a
              href={openHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-soft btn-sm"
              style={{ flex: 'none' }}
            >
              Open
            </a>
          ) : null}
        </div>
        {urlError ? (
          <span
            role="alert"
            style={{
              fontSize: 'var(--t-2xs)',
              color: 'var(--danger)',
              display: 'block',
              marginTop: 'var(--s-1)',
            }}
          >
            {urlError}
          </span>
        ) : null}
      </div>
      <div className="fld" style={{ display: 'block', marginTop: 'var(--s-2)' }}>
        <label className="label" style={LABEL_STYLE} htmlFor={`item-meta-desc-${item.id}`}>
          Description
        </label>
        <textarea
          id={`item-meta-desc-${item.id}`}
          className="input"
          rows={3}
          aria-label="Item description"
          defaultValue={item.meta?.description ?? ''}
          key={`desc-${item.id}`}
          onBlur={(e) => commit({ description: e.target.value })}
          style={{ width: '100%', resize: 'vertical', marginTop: 'var(--s-1)' }}
        />
      </div>
      <div className="fld" style={{ display: 'block', marginTop: 'var(--s-2)' }}>
        <label className="label" style={LABEL_STYLE} htmlFor={`item-meta-remarks-${item.id}`}>
          Special remarks
        </label>
        <textarea
          id={`item-meta-remarks-${item.id}`}
          className="input"
          rows={2}
          aria-label="Special remarks"
          placeholder="e.g. existing — retain, client to purchase, install notes…"
          defaultValue={item.meta?.remarks ?? ''}
          key={`remarks-${item.id}`}
          onBlur={(e) => commit({ remarks: e.target.value })}
          style={{ width: '100%', resize: 'vertical', marginTop: 'var(--s-1)' }}
        />
      </div>
      <div style={{ marginTop: 'var(--s-2)' }}>
        <span className="label" style={LABEL_STYLE}>
          Custom fields
        </span>
        {customRows.map((row, idx) => (
          <div
            // Rows have no stable id (duplicate keys are allowed) — index is
            // fine here, the list only appends/removes-in-place, never a
            // mid-list resort.
            key={idx}
            style={{
              display: 'flex',
              gap: 'var(--s-2)',
              alignItems: 'center',
              marginTop: 'var(--s-1)',
            }}
          >
            <input
              type="text"
              className="input"
              placeholder="Field"
              aria-label="Custom field name"
              value={row.key}
              style={{ flex: 1, minWidth: 0 }}
              onChange={(e) => updateCustomRow(idx, { key: e.target.value })}
              onBlur={() => commitCustomRows(customRows)}
            />
            <input
              type="text"
              className="input"
              placeholder="Value"
              aria-label="Custom field value"
              value={row.value}
              style={{ flex: 1, minWidth: 0 }}
              onChange={(e) => updateCustomRow(idx, { value: e.target.value })}
              onBlur={() => commitCustomRows(customRows)}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Remove custom field"
              title="Remove field"
              onClick={() => removeCustomRow(idx)}
            >
              <Icon.Close width={13} height={13} />
            </button>
          </div>
        ))}
        <Button
          variant="soft"
          size="sm"
          aria-label="Add custom field"
          title="Add field"
          disabled={customRows.length >= CUSTOM_META_MAX_ENTRIES}
          onClick={addCustomRow}
          icon={<Icon.Plus width={13} height={13} />}
          style={{ marginTop: 'var(--s-1)' }}
        >
          Add field
        </Button>
      </div>
    </InspectorSection>
  )
}
