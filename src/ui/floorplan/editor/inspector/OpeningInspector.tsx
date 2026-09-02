import { useFeature } from '../../../../features/useFeature'
import { resolveDoorLeafMaterialKind } from '../../../../floorplan/doorMaterial'
import { doorHinge, doorSwing } from '../../../../floorplan/doorSwing'
import type { PlanLevel } from '../../../../floorplan/levels'
import { defaultOpeningName } from '../../../../floorplan/planElementName'
import { type PlanOpening, wallLength } from '../../../../floorplan/types'
import { useStore } from '../../../../state/store'
import { ColorPicker } from '../../../controls/ColorPicker'
import { Select } from '../../../controls/Select'
import { Icon } from '../../../toolbar/icons'
import { ActBtn, NameField, Num, SiteMeasuredField } from './shared'

/** Inspector body for a selected opening (door / window). Reads edits/state from
 *  the store exactly as the inline dispatcher code did. */
export function OpeningInspector({
  opening: o,
  level,
  levelId,
}: {
  opening: PlanOpening
  level: PlanLevel
  levelId?: string
}) {
  const a = useStore.getState()
  const openingStylesOn = useFeature('openingStyles')
  const elementColorsOn = useFeature('elementColors')
  const siteMeasurementsOn = useFeature('siteMeasurements')
  const wall = level.walls.find((x) => x.id === o.wallId)
  const maxOff = wall ? Math.max(0, wallLength(wall) - o.width) : o.offset
  return (
    <div className="space-y-2">
      <div className="sec-h">
        <span className="capitalize">{o.kind}</span>
      </div>
      <NameField
        value={o.name}
        placeholder={defaultOpeningName(o)}
        // Editing the name makes it permanent (clears the auto-assigned flag)
        // so a later room rename never overwrites it again.
        onChange={(v) => a.updateOpening(o.id, { name: v, nameAuto: undefined }, levelId)}
      />
      <div className={`action-grid${o.kind === 'door' ? '' : ' two'}`}>
        {o.kind === 'door' ? (
          <>
            <ActBtn
              label="Flip hinge"
              icon={<Icon.FlipH width={16} height={16} />}
              disabled={o.locked}
              title="Pivot on the opposite jamb"
              onClick={() =>
                a.updateOpening(
                  o.id,
                  { hinge: doorHinge(o) === 'start' ? 'end' : 'start' },
                  levelId,
                )
              }
            />
            <ActBtn
              label="Flip swing"
              icon={<Icon.FlipV width={16} height={16} />}
              disabled={o.locked}
              title="Swing the leaf to the wall's other side"
              onClick={() =>
                a.updateOpening(
                  o.id,
                  { swing: doorSwing(o) === 'left' ? 'right' : 'left' },
                  levelId,
                )
              }
            />
          </>
        ) : null}
        <ActBtn
          label="Duplicate"
          icon={<Icon.Copy width={16} height={16} />}
          title={`Make a copy of this ${o.kind}`}
          onClick={() => a.duplicateOpening(o.id, levelId)}
        />
        <ActBtn
          label={o.locked ? 'Locked' : 'Lock'}
          icon={
            o.locked ? <Icon.Lock width={16} height={16} /> : <Icon.Unlock width={16} height={16} />
          }
          on={o.locked}
          title={o.locked ? 'Unlock — allow moving/editing' : 'Lock in place'}
          onClick={() => a.updateOpening(o.id, { locked: !o.locked || undefined }, levelId)}
        />
        <ActBtn
          label="Delete"
          icon={<Icon.Trash width={16} height={16} />}
          danger
          disabled={o.locked}
          onClick={() => a.removeOpening(o.id, levelId)}
        />
      </div>
      <Num
        label="Offset (m)"
        value={o.offset}
        min={0}
        onChange={(v) =>
          a.updateOpening(o.id, { offset: Math.max(0, Math.min(maxOff, v)) }, levelId)
        }
      />
      <Num
        label="Width (m)"
        value={o.width}
        min={0.1}
        onChange={(v) => a.updateOpening(o.id, { width: Math.max(0.1, v) }, levelId)}
      />
      {siteMeasurementsOn ? (
        <SiteMeasuredField kind="opening" targetId={o.id} modelMm={Math.round(o.width * 1000)} />
      ) : null}
      <Num
        label="Sill (m)"
        value={o.sill}
        min={0}
        onChange={(v) => a.updateOpening(o.id, { sill: Math.max(0, v) }, levelId)}
      />
      <Num
        label="Head (m)"
        value={o.head}
        min={0.1}
        onChange={(v) => a.updateOpening(o.id, { head: Math.max(0.1, v) }, levelId)}
      />
      {o.kind === 'door' && (
        <>
          <div className="row" style={{ padding: '6px 0', alignItems: 'center' }}>
            <span className="label">Hinge</span>
            <div className="seg" style={{ marginLeft: 'auto' }}>
              {(['start', 'end'] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`capitalize${doorHinge(o) === h ? ' on' : ''}`}
                  onClick={() => a.updateOpening(o.id, { hinge: h }, levelId)}
                  title={`Pivot the door on the ${h} jamb of the opening`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ padding: '6px 0', alignItems: 'center' }}>
            <span className="label">Swing</span>
            <div className="seg" style={{ marginLeft: 'auto' }}>
              {(['left', 'right'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`capitalize${doorSwing(o) === s ? ' on' : ''}`}
                  onClick={() => a.updateOpening(o.id, { swing: s }, levelId)}
                  title={`Swing the leaf to the wall's ${s}-hand side`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {openingStylesOn ? (
        <div className="row" style={{ padding: '6px 0', alignItems: 'center' }}>
          <span className="label">Style</span>
          <Select
            className="input"
            style={{ marginLeft: 'auto', maxWidth: '56%' }}
            value={o.style ?? (o.kind === 'door' ? 'panel' : 'plain')}
            onChange={(v) => a.updateOpening(o.id, { style: v }, levelId)}
            ariaLabel="Style"
            options={(o.kind === 'door'
              ? [
                  ['panel', 'Panelled'],
                  ['flush', 'Flush'],
                  ['glazed', 'Glazed'],
                  ['bifold', 'Bifold'],
                  ['sliding', 'Sliding'],
                  ['double', 'Double'],
                ]
              : [
                  ['plain', 'Plain glass'],
                  ['grille', 'Safety grille'],
                  ['invisible-grille', 'Invisible grille'],
                  ['louvre', 'Louvre'],
                  ['sliding', 'Sliding'],
                  ['casement', 'Casement'],
                  ['awning', 'Awning (top-hung vent)'],
                  ['hopper', 'Hopper (bottom-hung)'],
                  ['transom', 'Transom vent'],
                ]
            ).map(([v, label]) => ({ value: v, label }))}
          />
        </div>
      ) : null}
      {openingStylesOn && o.kind === 'window' ? (
        <div className="row" style={{ padding: '6px 0', alignItems: 'center' }}>
          <span className="label">Glass</span>
          <Select
            className="input"
            style={{ marginLeft: 'auto', maxWidth: '56%' }}
            value={o.material ?? 'clear'}
            onChange={(v) => a.updateOpening(o.id, { material: v }, levelId)}
            ariaLabel="Glass"
            options={[
              { value: 'clear', label: 'Clear' },
              { value: 'frosted', label: 'Frosted' },
              { value: 'textured', label: 'Textured / patterned' },
              { value: 'glass-block', label: 'Glass blocks' },
            ]}
          />
        </div>
      ) : null}
      {openingStylesOn && o.kind === 'door' ? (
        <div className="row" style={{ padding: '6px 0', alignItems: 'center' }}>
          <span className="label">Material</span>
          <Select
            className="input"
            style={{ marginLeft: 'auto', maxWidth: '56%' }}
            value={resolveDoorLeafMaterialKind(o)}
            onChange={(v) => a.updateOpening(o.id, { material: v }, levelId)}
            ariaLabel="Material"
            options={[
              { value: 'painted', label: 'Painted' },
              { value: 'wood', label: 'Timber / wood grain' },
              { value: 'vinyl', label: 'Vinyl / PVC laminate' },
              { value: 'metal', label: 'Metal / aluminium' },
            ]}
          />
        </div>
      ) : null}
      {elementColorsOn ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="label">{o.kind === 'door' ? 'Leaf colour' : 'Glass tint'}</span>
          <span className="flex items-center gap-2">
            <ColorPicker
              ariaLabel={o.kind === 'door' ? 'Leaf colour' : 'Glass tint'}
              value={o.color ?? (o.kind === 'door' ? '#9d7c54' : '#bcd4e6')}
              onChange={(hex) => a.updateOpening(o.id, { color: hex }, levelId)}
            />
            {o.color ? (
              <button
                type="button"
                className="text-[10px] text-[var(--text-3)] hover:text-[var(--text-2)]"
                onClick={() => a.updateOpening(o.id, { color: undefined }, levelId)}
              >
                reset
              </button>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  )
}
