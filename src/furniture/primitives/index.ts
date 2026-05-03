/**
 * Map from PrimitiveKind → React component for the Furniture renderer.
 *
 * Adding a new primitive = one entry here, one new file alongside it,
 * and one BUILTIN_CATALOG entry referencing the new PrimitiveKind.
 */

import type { ComponentType } from 'react';
import type { ParamProps, PrimitiveKind } from '../types';
import { Bed } from './Bed';
import { Sofa } from './Sofa';
import { DiningTable } from './DiningTable';
import { KitchenCounter } from './KitchenCounter';
import { Wardrobe } from './Wardrobe';
import { Desk } from './Desk';
import { Bookshelf } from './Bookshelf';
import { TVConsole } from './TVConsole';
import { WallShelf } from './WallShelf';
import { SectionalSofa } from './SectionalSofa';
import { OpenWardrobe } from './OpenWardrobe';

export type PrimitiveComponent = ComponentType<{ props: ParamProps }>;

export const PRIMITIVE_COMPONENTS: Record<PrimitiveKind, PrimitiveComponent> = {
  Bed,
  Sofa,
  DiningTable,
  KitchenCounter,
  Wardrobe,
  Desk,
  Bookshelf,
  TVConsole,
  WallShelf,
  SectionalSofa,
  OpenWardrobe,
};
