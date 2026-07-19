import {
  type StaircaseRailing,
  type StaircaseStyle,
  staircaseFootprintParts,
} from '../primitives/staircaseModel'
import type { FurnitureDef, ParamProps } from '../types'

/** Read the live staircase spec off an item's props (with the schema defaults),
 *  so the honest plan footprint tracks the current style/step/size params. */
function stairSpecFromProps(props: ParamProps) {
  const num = (k: string, d: number) => (typeof props[k] === 'number' ? (props[k] as number) : d)
  const str = <T extends string>(k: string, d: T) =>
    typeof props[k] === 'string' ? (props[k] as T) : d
  return {
    style: str<StaircaseStyle>('style', 'straight'),
    steps: num('steps', 13),
    width: num('width', 0.9),
    riserHeight: num('riserHeight', 0.17),
    treadDepth: num('treadDepth', 0.26),
    railing: str<StaircaseRailing>('railing', 'side'),
  }
}

/** others furniture definitions. Part of the built-in catalog (see ../builtinCatalog.ts). */
export const OTHERS_DEFS = {
  staircase: {
    kind: 'parametric',
    id: 'staircase',
    name: 'Staircase',
    keywords: ['stairs', 'steps', 'stairway', 'flight'],
    category: 'others',
    primitive: 'Staircase',
    defaultFootprint: { w: 0.9, d: 3.4, h: 2.2 },
    verticalSpan: { base: 0, top: 2.2 },
    footprintParams: { w: 'width' },
    // Honest plan footprint: an L/U-shape occupies an L/U (not the full box), and
    // a straight flight's depth tracks its step count — see staircaseModel.ts.
    footprintParts: (props) => staircaseFootprintParts(stairSpecFromProps(props)),
    paramSchema: [
      {
        kind: 'enum',
        key: 'style',
        label: 'Style',
        default: 'straight',
        options: [
          { value: 'straight', label: 'Straight' },
          { value: 'lshape', label: 'L-shaped' },
          { value: 'ushape', label: 'U-shaped' },
          { value: 'spiral', label: 'Spiral' },
        ],
      },
      { kind: 'number', key: 'steps', label: 'Steps', min: 2, max: 24, step: 1, default: 13 },
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 0.6,
        max: 1.6,
        step: 0.05,
        default: 0.9,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'riserHeight',
        label: 'Riser',
        min: 0.12,
        max: 0.2,
        step: 0.005,
        default: 0.17,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'treadDepth',
        label: 'Tread',
        min: 0.22,
        max: 0.32,
        step: 0.005,
        default: 0.26,
        unit: 'm',
      },
      {
        kind: 'enum',
        key: 'railing',
        label: 'Railing',
        default: 'side',
        options: [
          { value: 'none', label: 'None' },
          { value: 'side', label: 'One side' },
          { value: 'both', label: 'Both sides' },
        ],
      },
      { kind: 'color', key: 'color', label: 'Timber', default: '#9c6b3f' },
    ],
  },
} satisfies Record<string, FurnitureDef>
