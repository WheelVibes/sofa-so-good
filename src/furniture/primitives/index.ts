/**
 * Map from PrimitiveKind → React component for the Furniture renderer.
 *
 * Adding a new primitive = one entry here, one new file alongside it,
 * and one BUILTIN_CATALOG entry referencing the new PrimitiveKind.
 */

import type { ComponentType } from 'react'
import type { ParamProps, PrimitiveKind } from '../types'
import { AirconUnit } from './AirconUnit'
import { Aquarium } from './Aquarium'
import { Armchair } from './Armchair'
import { BarCart } from './BarCart'
import { BarStool } from './BarStool'
import { BathroomSink } from './BathroomSink'
import { Bathtub } from './Bathtub'
import { Bed } from './Bed'
import { Bench } from './Bench'
import { BookStack } from './BookStack'
import { Bookshelf } from './Bookshelf'
import { BunkBed } from './BunkBed'
import { CabinetCorner } from './CabinetCorner'
import { CabinetBase, CabinetTall, CabinetWall } from './CabinetModule'
import { CandleCluster } from './CandleCluster'
import { CeilingFan } from './CeilingFan'
import { CeilingLight } from './CeilingLight'
import { ChaiseLounge } from './ChaiseLounge'
import { ChangingTable } from './ChangingTable'
import { CoatRack } from './CoatRack'
import { CoffeeTable } from './CoffeeTable'
import { ConsoleTable } from './ConsoleTable'
import { CoveLight } from './CoveLight'
import { Crib } from './Crib'
import { CubeShelf } from './CubeShelf'
import { Curtain } from './Curtain'
import { Desk } from './Desk'
import { DeskPlant } from './DeskPlant'
import { DiningChair } from './DiningChair'
import { DiningTable } from './DiningTable'
import { Dishwasher } from './Dishwasher'
import { Dresser } from './Dresser'
import { DryingRack } from './DryingRack'
import { FeatureWall } from './FeatureWall'
import { Fireplace } from './Fireplace'
import { FlatscreenTV } from './FlatscreenTV'
import { FloorLamp } from './FloorLamp'
import { FloorMirror } from './FloorMirror'
import { FloorSpeaker } from './FloorSpeaker'
import { FloorVase } from './FloorVase'
import { FruitBowl } from './FruitBowl'
import { GarmentRack } from './GarmentRack'
import { HangingPlant } from './HangingPlant'
import { HighChair } from './HighChair'
import { KitchenCounter } from './KitchenCounter'
import { KitchenIsland } from './KitchenIsland'
import { LaundryHamper } from './LaundryHamper'
import { MagazineStack } from './MagazineStack'
import { Microwave } from './Microwave'
import { Mirror } from './Mirror'
import { Monitor } from './Monitor'
import { Nightstand } from './Nightstand'
import { OfficeChair } from './OfficeChair'
import { Ottoman } from './Ottoman'
import { OutdoorChair } from './OutdoorChair'
import { OutdoorLounger } from './OutdoorLounger'
import { OutdoorParasol } from './OutdoorParasol'
import { OutdoorTable } from './OutdoorTable'
import { Oven } from './Oven'
import { PetBed } from './PetBed'
import { PhotoFrameCluster } from './PhotoFrameCluster'
import { Piano } from './Piano'
import { PlanterTrough } from './PlanterTrough'
import { PottedPlant } from './PottedPlant'
import { RangeHood } from './RangeHood'
import { Refrigerator } from './Refrigerator'
import { RollerBlind } from './RollerBlind'
import { RoomDivider } from './RoomDivider'
import { Rug } from './Rug'
import { ShoeCabinet } from './ShoeCabinet'
import { Shower } from './Shower'
import { Sideboard } from './Sideboard'
import { SideTable } from './SideTable'
import { SmallSculpture } from './SmallSculpture'
import { Sofa } from './Sofa'
import { SofaSectional } from './SofaSectional'
import { Soundbar } from './Soundbar'
import { Staircase } from './Staircase'
import { StandingFan } from './StandingFan'
import { Stove } from './Stove'
import { TableLamp } from './TableLamp'
import { TabletopDecor } from './TabletopDecor'
import { ThrowBlanket } from './ThrowBlanket'
import { ThrowCushion } from './ThrowCushion'
import { ToddlerBed } from './ToddlerBed'
import { Toilet } from './Toilet'
import { TowelLadder } from './TowelLadder'
import { TowelRail } from './TowelRail'
import { ToyStorage } from './ToyStorage'
import { TVConsole } from './TVConsole'
import { Vanity } from './Vanity'
import { WallArt } from './WallArt'
import { WallCabinet } from './WallCabinet'
import { WallClock } from './WallClock'
import { WallMirror } from './WallMirror'
import { WallSconce } from './WallSconce'
import { WallShelf } from './WallShelf'
import { WallTapestry } from './WallTapestry'
import { Wardrobe } from './Wardrobe'
import { WashingMachine } from './WashingMachine'
import { WineCooler } from './WineCooler'

export type PrimitiveComponent = ComponentType<{ props: ParamProps }>

export const PRIMITIVE_COMPONENTS: Record<PrimitiveKind, PrimitiveComponent> = {
  Bed,
  Sofa,
  SofaSectional,
  FeatureWall,
  ConsoleTable,
  Sideboard,
  BarCart,
  Ottoman,
  RoomDivider,
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
  Staircase,
  Mirror,
  Monitor,
  RangeHood,
  TableLamp,
  Microwave,
  DryingRack,
  LaundryHamper,
  TabletopDecor,
  ShoeCabinet,
  WallShelf,
  WallSconce,
  WallTapestry,
  CoveLight,
  FloorMirror,
  RollerBlind,
  SideTable,
  WallClock,
  StandingFan,
  TowelLadder,
  TowelRail,
  ToyStorage,
  ToddlerBed,
  BunkBed,
  Crib,
  Soundbar,
  FloorSpeaker,
  WallMirror,
  FloorVase,
  GarmentRack,
  HighChair,
  ChangingTable,
  Bathtub,
  CoatRack,
  HangingPlant,
  ChaiseLounge,
  KitchenIsland,
  PetBed,
  Aquarium,
  Piano,
  Fireplace,
  Vanity,
  CabinetBase,
  CabinetWall,
  CabinetTall,
  CabinetCorner,
  Dishwasher,
  Oven,
  WineCooler,
  PlanterTrough,
  OutdoorChair,
  OutdoorTable,
  OutdoorParasol,
  OutdoorLounger,
  BookStack,
  ThrowCushion,
  ThrowBlanket,
  CandleCluster,
  FruitBowl,
  MagazineStack,
  SmallSculpture,
  DeskPlant,
  PhotoFrameCluster,
}
