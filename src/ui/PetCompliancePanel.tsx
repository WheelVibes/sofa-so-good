import { useMemo } from 'react'
import {
  buildPetCompliance,
  PET_TYPE_LABEL,
  type PetChecklistEntry,
  type PetChecklistStatus,
} from '../analysis/petCompliance'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'
import { EmptyState } from './EmptyState'
import { PetProfileControl } from './PetProfileControl'
import { Icon } from './toolbar/icons'

/** Badge tone class per status (token vocabulary — no colour literals). */
function statusBadge(status: PetChecklistStatus): { cls: string; label: string } {
  if (status === 'done') return { cls: 'ok', label: 'Done' }
  if (status === 'partial') return { cls: 'warn', label: 'Partial' }
  return { cls: 'err', label: 'To add' }
}

/** One checklist row (required / recommended). Info notes render via `InfoRow`. */
function EntryRow({ entry, onAdd }: { entry: PetChecklistEntry; onAdd: () => void }) {
  const badge = statusBadge(entry.status)
  const showCount = entry.need > 1
  const showAdd = entry.status !== 'done' && entry.defIds.length > 0
  return (
    <div
      className={`clr-item ${entry.status === 'done' ? '' : entry.status === 'partial' ? 'warn' : 'err'}`}
    >
      <div className="ci-head">
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        <span className="ci-title">
          {PET_TYPE_LABEL[entry.petType]} · {entry.title}
        </span>
      </div>
      <div className="ci-detail">
        {entry.detail}
        {showCount ? (
          <div style={{ marginTop: 'var(--s-1)', fontWeight: 600 }}>
            {entry.have} of {entry.need} windows meshed
          </div>
        ) : null}
        <div style={{ marginTop: 'var(--s-1)', color: 'var(--text-3)' }}>{entry.cite}</div>
        {showAdd ? (
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 'var(--s-2)' }}
            onClick={onAdd}
          >
            <Icon.Plus width={13} height={13} /> Add
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Pet compliance checklist (Pet program P6, `petCompliance` pro flag). Renders
 * the pure `buildPetCompliance` output grouped required / recommended / notes,
 * with status badges, have/need counts (window meshing), the citation line and a
 * per-outstanding-row "Add" CTA that jumps the catalog to the pets tab. An empty
 * profile shows the shared EmptyState with the pet-type selector inline so the
 * user can declare their pets on the spot. Mirrors the AccessibilityPanel shape.
 */
export function PetCompliancePanel() {
  const open = useStore((s) => s.petComplianceOpen)
  const setOpen = useStore((s) => s.setPetComplianceOpen)
  const petTypes = useStore((s) => s.petTypes)
  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)

  const report = useMemo(
    () => (open ? buildPetCompliance(petTypes, items, plan) : null),
    [open, petTypes, items, plan],
  )
  if (!open || !report) return null

  const addPetItem = () => {
    const s = useStore.getState()
    s.setLeftMode('catalog')
    s.setCatalogOpen(true)
    s.setPendingCatalogCategory('pets')
  }

  const required = report.entries.filter((e) => e.kind === 'required')
  const recommended = report.entries.filter((e) => e.kind === 'recommended')
  const notes = report.entries.filter((e) => e.kind === 'info')
  const allRequiredOk = report.requiredMissing === 0 && report.requiredPartial === 0

  return (
    <aside className="panel mini aux aux-360" id="petCompliancePanel">
      <AuxPanelHead
        title="Pet compliance"
        sub="Fittings your declared pets need"
        onClose={() => setOpen(false)}
      />
      <hr className="hr" />
      <div className="panel-body">
        {petTypes.length === 0 ? (
          <>
            <EmptyState
              icon={Icon.Pets}
              title="No pets declared yet"
              description="Tell us which pets your household has to see the fittings they need — required safety items and comfort essentials."
            />
            <div style={{ marginTop: 'var(--s-3)' }}>
              <PetProfileControl />
            </div>
          </>
        ) : (
          <>
            <div className="clr-summary">
              <div className={`clr-stat ${allRequiredOk ? 'ok' : 'err'}`}>
                <div className="n">
                  {report.requiredDone}/{report.requiredTotal}
                </div>
                <div className="l">Required</div>
              </div>
              <div className={`clr-stat ${report.recommendedOutstanding === 0 ? 'ok' : ''}`}>
                <div className="n">
                  {recommended.length - report.recommendedOutstanding}/{recommended.length}
                </div>
                <div className="l">Recommended</div>
              </div>
            </div>

            {/* Editable profile so the user can add/remove pets from the panel. */}
            <div style={{ margin: 'var(--s-2) 0 var(--s-3)' }}>
              <PetProfileControl />
            </div>

            {required.length > 0 && (
              <>
                <div className="panel-sub" style={{ marginBottom: 'var(--s-1)' }}>
                  Required
                </div>
                <div className="clr-list">
                  {required.map((e) => (
                    <EntryRow key={e.id} entry={e} onAdd={addPetItem} />
                  ))}
                </div>
              </>
            )}

            {recommended.length > 0 && (
              <>
                <div className="panel-sub" style={{ margin: 'var(--s-3) 0 4px' }}>
                  Recommended
                </div>
                <div className="clr-list">
                  {recommended.map((e) => (
                    <EntryRow key={e.id} entry={e} onAdd={addPetItem} />
                  ))}
                </div>
              </>
            )}

            {notes.length > 0 && (
              <>
                <div className="panel-sub" style={{ margin: 'var(--s-3) 0 4px' }}>
                  Good to know
                </div>
                <div className="clr-list">
                  {notes.map((e) => (
                    <div
                      key={e.id}
                      className="clr-item"
                      style={{ borderLeftColor: 'var(--accent)' }}
                    >
                      <div className="ci-head">
                        <span className="badge neutral">Info</span>
                        <span className="ci-title">{e.title}</span>
                      </div>
                      <div className="ci-detail">
                        {e.detail}
                        <div style={{ marginTop: 'var(--s-1)', color: 'var(--text-3)' }}>
                          {e.cite}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="ci-fix" style={{ marginTop: 'var(--s-3)' }}>
              <Icon.Check width={14} height={14} />
              {allRequiredOk
                ? 'All required pet fittings are in place — guidance only, confirm the current rules with NParks / AVS & HDB.'
                : 'Add the flagged required fittings for a pet-safe, compliant home.'}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
