import type { FurnitureDef } from '../types'

/**
 * Pet fittings & furniture (Pet program, Stage P1). Part of the built-in catalog
 * (see ../builtinCatalog.ts), gated behind the `petFittings` feature flag.
 *
 * P1 ships the foundations + the Singapore-compliance fittings: the pet bed
 * (moved here from `decor`, id unchanged), the Cat-Management-Framework window /
 * balcony safety mesh screen (`windowBound`), the doorway pet gate + pet-door
 * insert (`doorBound`), and a freestanding playpen. All procedural, real-metre,
 * structurally sound.
 */
export const PETS_DEFS = {
  'pet-bed': {
    kind: 'parametric',
    id: 'pet-bed',
    name: 'Pet bed',
    keywords: ['dog bed', 'cat bed', 'pet', 'basket', 'dog', 'cat'],
    category: 'pets',
    primitive: 'PetBed',
    defaultFootprint: { w: 0.7, d: 0.7, h: 0.22 },
    footprintParams: { w: 'size', d: 'size' },
    paramSchema: [
      {
        kind: 'number',
        key: 'size',
        label: 'Size',
        min: 0.45,
        max: 1.1,
        step: 0.05,
        default: 0.7,
        unit: 'm',
      },
      {
        kind: 'enum',
        key: 'shape',
        label: 'Shape',
        default: 'round',
        options: [
          { value: 'round', label: 'Round basket' },
          { value: 'rect', label: 'Rectangular mat' },
        ],
      },
      { kind: 'color', key: 'color', label: 'Bolster', default: '#9b6f52' },
      { kind: 'color', key: 'cushion', label: 'Cushion', default: '#d8c9b0' },
    ],
  },
  'window-mesh-screen': {
    kind: 'parametric',
    id: 'window-mesh-screen',
    name: 'Window mesh screen',
    keywords: [
      'cat',
      'mesh',
      'screen',
      'safety',
      'CMF',
      'compliance',
      'window',
      'balcony',
      'net',
      'grille',
    ],
    category: 'pets',
    primitive: 'WindowMeshScreen',
    defaultFootprint: { w: 1.2, d: 0.08, h: 2.1 },
    // Sits flat on a window opening — never blocks floor placement.
    noClip: true,
    // Window-bound: statically placed on a window (no move/rotate/flip);
    // placement snaps + sizes it to the opening (width + sill/head).
    windowBound: true,
    paramSchema: [
      { kind: 'color', key: 'frameColor', label: 'Frame', default: '#3a3d42' },
      {
        kind: 'enum',
        key: 'frameFinish',
        label: 'Frame finish',
        default: 'satin',
        options: [
          { value: 'satin', label: 'Satin' },
          { value: 'black-steel', label: 'Black steel' },
        ],
      },
      {
        kind: 'enum',
        key: 'density',
        label: 'Mesh density',
        default: 'fine',
        options: [
          { value: 'fine', label: 'Fine (cat-safe)' },
          { value: 'standard', label: 'Standard' },
        ],
      },
      {
        kind: 'enum',
        key: 'frameStyle',
        label: 'Frame style',
        default: 'slim',
        options: [
          { value: 'slim', label: 'Slim' },
          { value: 'box', label: 'Box section' },
        ],
      },
      { kind: 'color', key: 'meshColor', label: 'Mesh', default: '#2b2d31' },
    ],
  },
  'pet-gate': {
    kind: 'parametric',
    id: 'pet-gate',
    name: 'Pet gate',
    keywords: ['dog', 'cat', 'gate', 'barrier', 'doorway', 'safety', 'stair gate'],
    category: 'pets',
    primitive: 'PetGate',
    defaultFootprint: { w: 0.85, d: 0.06, h: 0.75 },
    noClip: true,
    // Door-bound: statically placed spanning a doorway (no move/rotate/flip);
    // placement snaps + sizes it to the door opening.
    doorBound: true,
    paramSchema: [
      {
        kind: 'number',
        key: 'height',
        label: 'Height',
        min: 0.6,
        max: 1.1,
        step: 0.05,
        default: 0.75,
        unit: 'm',
      },
      {
        kind: 'enum',
        key: 'style',
        label: 'Style',
        default: 'bars',
        options: [
          { value: 'bars', label: 'Bars' },
          { value: 'mesh', label: 'Mesh' },
        ],
      },
      { kind: 'color', key: 'color', label: 'Colour', default: '#6b6f76' },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Finish',
        default: 'satin',
        options: [
          { value: 'satin', label: 'Satin' },
          { value: 'black-steel', label: 'Black steel' },
        ],
      },
      {
        kind: 'enum',
        key: 'flap',
        label: 'Walk-through flap',
        default: 'no',
        options: [
          { value: 'no', label: 'None' },
          { value: 'yes', label: 'Flap section' },
        ],
      },
    ],
  },
  'pet-door-insert': {
    kind: 'parametric',
    id: 'pet-door-insert',
    name: 'Pet door insert',
    keywords: ['dog', 'cat', 'flap', 'pet door', 'doggie door', 'cat flap', 'doorway'],
    category: 'pets',
    primitive: 'PetDoorInsert',
    defaultFootprint: { w: 0.82, d: 0.06, h: 0.6 },
    noClip: true,
    doorBound: true,
    paramSchema: [
      {
        kind: 'enum',
        key: 'flapSize',
        label: 'Flap size',
        default: 'M',
        options: [
          { value: 'S', label: 'Small' },
          { value: 'M', label: 'Medium' },
        ],
      },
      { kind: 'color', key: 'frameColor', label: 'Frame', default: '#c9c4bb' },
    ],
  },
  'pet-playpen': {
    kind: 'parametric',
    id: 'pet-playpen',
    name: 'Pet playpen',
    keywords: ['dog', 'cat', 'puppy', 'playpen', 'pen', 'enclosure', 'crate', 'fence'],
    category: 'pets',
    primitive: 'PetPlaypen',
    defaultFootprint: { w: 1.25, d: 1.25, h: 0.7 },
    // Clear floor in front so the pen has access space (IKEA design semantics).
    frontClearance: 0.5,
    paramSchema: [
      {
        kind: 'integer',
        key: 'panels',
        label: 'Panels',
        min: 4,
        max: 8,
        default: 6,
      },
      {
        kind: 'number',
        key: 'panelWidth',
        label: 'Panel width',
        min: 0.4,
        max: 0.9,
        step: 0.05,
        default: 0.6,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'panelHeight',
        label: 'Panel height',
        min: 0.45,
        max: 1.0,
        step: 0.05,
        default: 0.7,
        unit: 'm',
      },
      { kind: 'color', key: 'color', label: 'Wire', default: '#5b6068' },
      {
        kind: 'enum',
        key: 'wireFinish',
        label: 'Finish',
        default: 'satin',
        options: [
          { value: 'satin', label: 'Satin' },
          { value: 'black-steel', label: 'Black steel' },
        ],
      },
    ],
  },
} satisfies Record<string, FurnitureDef>
