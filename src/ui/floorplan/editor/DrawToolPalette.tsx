import type { ElectricalKind, PlumbingKind } from '../../../floorplan/types'
import { Icon } from '../../toolbar/icons'
import { MenuLabel } from '../../toolbar/ToolbarMenu'
import { ELECTRICAL_MEP_KINDS, PLUMBING_MEP_KINDS } from './mepToolKinds'
import { PlanMenu } from './PlanMenu'
import type { Tool } from './planConstants'

export interface MepSelection {
  family: 'electrical' | 'plumbing'
  kind: ElectricalKind | PlumbingKind
}

/**
 * The three always-visible tools. `on` is the single source for both the visual
 * `.on` class and `aria-pressed`, so the two can't disagree; 'scale' shares the
 * Select button because scaling is a select-mode gesture.
 */
const SIMPLE_TOOLS: {
  t: Tool
  label: string
  title: string
  on: (tool: Tool) => boolean
  icon?: true
}[] = [
  {
    t: 'select',
    label: 'Select',
    title: 'Select / move — click an element to select it, drag to move',
    on: (tool) => tool === 'select' || tool === 'scale',
    icon: true,
  },
  {
    t: 'wall',
    label: 'Wall',
    title: 'Wall — drag to draw; snaps to 15° angles (hold Shift for any angle)',
    on: (tool) => tool === 'wall',
  },
  {
    t: 'split',
    label: 'Split',
    title: 'Split — click a wall to split it in two',
    on: (tool) => tool === 'split',
  },
]

/**
 * Desktop drawing-tool palette: Select/Wall/Split as direct buttons, plus the
 * Room / Opening / Markup / MEP tool groups collapsed into labelled `PlanMenu`
 * dropdowns so the toolbar stays a single row. Extracted from `FloorPlanEditor`
 * (REFAC-2) — purely presentational, driven by the active `tool` + a `onPick`
 * callback the caller wires to its own tool-switch side effects. The MEP group
 * (electrical/plumbing points, MEP layer G1 PR3) is flag-gated separately
 * (`fMep`) since it's Pro-tier and its buttons arm BOTH the `'mep'` tool AND a
 * specific kind in one click (`onPickMep`), unlike the other groups which only
 * pick a `Tool`.
 */
export function DrawToolPalette({
  tool,
  onPick,
  fPolyline,
  fMep,
  mep,
  onPickMep,
}: {
  tool: Tool
  onPick: (t: Tool) => void
  fPolyline: boolean
  fMep: boolean
  mep: MepSelection
  onPickMep: (sel: MepSelection) => void
}) {
  const toolGroups: { label: string; tools: { t: Tool; label: string; title: string }[] }[] = [
    {
      label: 'Room',
      tools: [
        {
          t: 'room',
          label: 'Rectangle',
          title: 'Rectangular room — drag a rectangle (area is computed)',
        },
        {
          t: 'polyroom',
          label: 'Polygon',
          title:
            'Polygon room — draw an L-shaped / non-rectangular room: click each corner, then click the first corner (or press Enter) to close it. Esc cancels.',
        },
        {
          t: 'autoroom',
          label: 'Auto',
          title: 'Auto room — click inside a wall-enclosed area to make a room from it',
        },
      ],
    },
    {
      label: 'Opening',
      tools: [
        { t: 'door', label: 'Door', title: 'Door — click on a wall to add a door' },
        { t: 'window', label: 'Window', title: 'Window — click on a wall to add a window' },
      ],
    },
    {
      label: 'Markup',
      tools: [
        { t: 'text', label: 'Text', title: 'Text note — click to place a label' },
        { t: 'dimension', label: 'Dimension', title: 'Dimension line — drag between two points' },
        ...(fPolyline
          ? [
              {
                t: 'polyline' as Tool,
                label: 'Polyline',
                title:
                  'Polyline markup — click vertices, Enter to finish (open), click the first to close',
              },
            ]
          : []),
      ],
    },
  ]

  return (
    <div className="draw-tools">
      <div className="seg accent">
        {/* These three are toggle buttons, not a Segmented radiogroup: the real
            tool state space also includes every tool in the dropdowns below, so
            a radiogroup over three of ten would misreport it. `aria-pressed`
            must therefore track the SAME condition as the visual `on` class on
            every button — the Select button previously rendered `on` for the
            'scale' tool while reporting aria-pressed=false, so a screen-reader
            user saw an unpressed button the sighted user saw lit (UIUX-75). */}
        {SIMPLE_TOOLS.map((x) => {
          const on = x.on(tool)
          return (
            <button
              key={x.t}
              type="button"
              onClick={() => onPick(x.t)}
              className={on ? 'on' : ''}
              title={x.title}
              aria-label={x.icon ? x.label : undefined}
              aria-pressed={on}
            >
              {x.icon ? <Icon.Select width={16} height={16} /> : x.label}
            </button>
          )
        })}
      </div>
      {toolGroups.map((g) => (
        <PlanMenu
          key={g.label}
          label={g.label}
          width={200}
          active={g.tools.some((x) => x.t === tool)}
        >
          <div className="action-grid">
            {g.tools.map((x) => (
              <button
                key={x.t}
                type="button"
                className={`act${tool === x.t ? ' on' : ''}`}
                aria-current={tool === x.t}
                title={x.title}
                onClick={() => onPick(x.t)}
              >
                {x.label}
              </button>
            ))}
          </div>
        </PlanMenu>
      ))}
      {fMep && (
        <PlanMenu label="MEP" width={220} active={tool === 'mep'}>
          <MenuLabel>Electrical</MenuLabel>
          <div className="action-grid two">
            {ELECTRICAL_MEP_KINDS.map((x) => (
              <button
                key={`e-${x.kind}`}
                type="button"
                className={`act${tool === 'mep' && mep.family === 'electrical' && mep.kind === x.kind ? ' on' : ''}`}
                aria-current={tool === 'mep' && mep.family === 'electrical' && mep.kind === x.kind}
                title={x.title}
                onClick={() => onPickMep({ family: 'electrical', kind: x.kind })}
              >
                {x.label}
              </button>
            ))}
          </div>
          <MenuLabel>Plumbing</MenuLabel>
          <div className="action-grid two">
            {PLUMBING_MEP_KINDS.map((x) => (
              <button
                key={`p-${x.kind}`}
                type="button"
                className={`act${tool === 'mep' && mep.family === 'plumbing' && mep.kind === x.kind ? ' on' : ''}`}
                aria-current={tool === 'mep' && mep.family === 'plumbing' && mep.kind === x.kind}
                title={x.title}
                onClick={() => onPickMep({ family: 'plumbing', kind: x.kind })}
              >
                {x.label}
              </button>
            ))}
          </div>
        </PlanMenu>
      )}
    </div>
  )
}
