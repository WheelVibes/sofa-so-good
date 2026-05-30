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
import { SofaSectional } from './SofaSectional';
import { FeatureWall } from './FeatureWall';
import { ConsoleTable } from './ConsoleTable';
import { Sideboard } from './Sideboard';
import { BarCart } from './BarCart';
import { Ottoman } from './Ottoman';
import { Bench } from './Bench';
import { CubeShelf } from './CubeShelf';
import { DiningTable } from './DiningTable';
import { KitchenCounter } from './KitchenCounter';
import { Wardrobe } from './Wardrobe';
import { Desk } from './Desk';
import { Bookshelf } from './Bookshelf';
import { TVConsole } from './TVConsole';
import { DiningChair } from './DiningChair';
import { Armchair } from './Armchair';
import { CoffeeTable } from './CoffeeTable';
import { Nightstand } from './Nightstand';
import { Rug } from './Rug';
import { PottedPlant } from './PottedPlant';
import { FlatscreenTV } from './FlatscreenTV';
import { AirconUnit } from './AirconUnit';
import { Refrigerator } from './Refrigerator';
import { FloorLamp } from './FloorLamp';
import { Toilet } from './Toilet';
import { BathroomSink } from './BathroomSink';
import { CeilingLight } from './CeilingLight';
import { CeilingFan } from './CeilingFan';
import { Stove } from './Stove';
import { WashingMachine } from './WashingMachine';
import { Curtain } from './Curtain';
import { WallArt } from './WallArt';
import { OfficeChair } from './OfficeChair';
import { WallCabinet } from './WallCabinet';
import { Dresser } from './Dresser';
import { BarStool } from './BarStool';
import { Shower } from './Shower';
import { Mirror } from './Mirror';
import { Monitor } from './Monitor';
import { RangeHood } from './RangeHood';
import { TableLamp } from './TableLamp';
import { Microwave } from './Microwave';
import { DryingRack } from './DryingRack';
import { TabletopDecor } from './TabletopDecor';
import { ShoeCabinet } from './ShoeCabinet';
import { WallShelf } from './WallShelf';
import { WallSconce } from './WallSconce';
import { CoveLight } from './CoveLight';
import { FloorMirror } from './FloorMirror';
import { RollerBlind } from './RollerBlind';
import { SideTable } from './SideTable';
import { WallClock } from './WallClock';
import { StandingFan } from './StandingFan';
import { TowelRail } from './TowelRail';
import { BunkBed } from './BunkBed';

export type PrimitiveComponent = ComponentType<{ props: ParamProps }>;

export const PRIMITIVE_COMPONENTS: Record<PrimitiveKind, PrimitiveComponent> = {
  Bed,
  Sofa,
  SofaSectional,
  FeatureWall,
  ConsoleTable,
  Sideboard,
  BarCart,
  Ottoman,
  Bench,
  CubeShelf,
  DiningTable,
  KitchenCounter,
  Wardrobe,
  Desk,
  Bookshelf,
  TVConsole,
  DiningChair,
  Armchair,
  CoffeeTable,
  Nightstand,
  Rug,
  PottedPlant,
  FlatscreenTV,
  AirconUnit,
  Refrigerator,
  FloorLamp,
  Toilet,
  BathroomSink,
  CeilingLight,
  CeilingFan,
  Stove,
  WashingMachine,
  Curtain,
  WallArt,
  OfficeChair,
  WallCabinet,
  Dresser,
  BarStool,
  Shower,
  Mirror,
  Monitor,
  RangeHood,
  TableLamp,
  Microwave,
  DryingRack,
  TabletopDecor,
  ShoeCabinet,
  WallShelf,
  WallSconce,
  CoveLight,
  FloorMirror,
  RollerBlind,
  SideTable,
  WallClock,
  StandingFan,
  TowelRail,
  BunkBed,
};
