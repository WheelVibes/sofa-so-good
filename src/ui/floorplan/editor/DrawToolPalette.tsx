import { Icon } from '../../toolbar/icons'
import { PlanMenu } from './PlanMenu'
import type { Tool } from './planConstants'

/**
 * Desktop drawing-tool palette: Select/Wall/Split as direct buttons, plus the
 * Room / Opening / Markup tool groups collapsed into labelled `PlanMenu`
 * dropdowns so the toolbar stays a single row. Extracted from `FloorPlanEditor`
 * (REFAC-2) — purely presentational, driven by the active `tool` + a `onPick`
 * callback the caller wires to its own tool-switch side effects.
 */
export function DrawToolPalette({
  tool,
  onPick,
  fPolyline,
}: {
  tool: Tool
  onPick: (t: Tool) => void
  fPolyline: boolean
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
    <div className="flex items-center gap-1" style={{ marginLeft: 4 }}>
      <div className="seg accent">
        <button
          type="button"
          onClick={() => onPick('select')}
          className={tool === 'select' || tool === 'scale' ? 'on' : ''}
          title="Select / move — click an element to select it, drag to move"
          aria-label="Select"
          aria-pressed={tool === 'select'}
        >
          <Icon.Select width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => onPick('wall')}
          className={tool === 'wall' ? 'on' : ''}
          title="Wall — drag to draw; snaps to 15° angles (hold Shift for any angle)"
        >
          Wall
        </button>
        <button
          type="button"
          onClick={() => onPick('split')}
          className={tool === 'split' ? 'on' : ''}
          title="Split — click a wall to split it in two"
        >
          Split
        </button>
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
    </div>
  )
}
