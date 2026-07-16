import { create } from 'zustand'
import {
  setFlatWallThicknessDefaults,
  setFlatWallThicknessOverrides,
} from '../apartment/wallSegments'
import type { FloorPlan } from '../floorplan/types'
import {
  APPEARANCE_INITIAL,
  type AppearanceSlice,
  createAppearanceSlice,
} from './slices/appearanceSlice'
import { AUTH_INITIAL, type AuthSlice, createAuthSlice } from './slices/authSlice'
import { BADGES_INITIAL, type BadgesSlice, createBadgesSlice } from './slices/badgesSlice'
import { CALLOUTS_INITIAL, type CalloutsSlice, createCalloutsSlice } from './slices/calloutsSlice'
import { CAMERA_INITIAL, type CameraSlice, createCameraSlice } from './slices/cameraSlice'
import {
  CAMERA_VIEWS_INITIAL,
  type CameraViewsSlice,
  createCameraViewsSlice,
} from './slices/cameraViewsSlice'
import {
  CLIPBOARD_INITIAL,
  type ClipboardSlice,
  createClipboardSlice,
} from './slices/clipboardSlice'
import {
  COLOR_PALETTE_INITIAL,
  type ColorPaletteSlice,
  createColorPaletteSlice,
} from './slices/colorPaletteSlice'
import { COMMENTS_INITIAL, type CommentsSlice, createCommentsSlice } from './slices/commentsSlice'
import { createDoorsSlice, DOORS_INITIAL, type DoorsSlice } from './slices/doorsSlice'
import {
  createDrawingCalloutsSlice,
  DRAWING_CALLOUTS_INITIAL,
  type DrawingCalloutsSlice,
} from './slices/drawingCalloutsSlice'
import {
  createFavouritesSlice,
  FAVOURITES_INITIAL,
  type FavouritesSlice,
} from './slices/favouritesSlice'
import {
  createFeatureFlagsSlice,
  FEATURE_FLAGS_INITIAL,
  type FeatureFlagsSlice,
} from './slices/featureFlagsSlice'
import { createFeaturesSlice, FEATURES_INITIAL, type FeaturesSlice } from './slices/featuresSlice'
import { createFinishesSlice, FINISHES_INITIAL, type FinishesSlice } from './slices/finishesSlice'
import {
  createFloorPlanSlice,
  FLOOR_PLAN_INITIAL,
  type FloorPlanSlice,
} from './slices/floorPlanSlice'
import { createGroupsSlice, type GroupsSlice } from './slices/groupsSlice'
import { createHistorySlice, HISTORY_INITIAL, type HistorySlice } from './slices/historySlice'
import {
  createInstalledPacksSlice,
  INSTALLED_PACKS_INITIAL,
  type InstalledPacksSlice,
} from './slices/installedPacksSlice'
import { createIsolateSlice, ISOLATE_INITIAL, type IsolateSlice } from './slices/isolateSlice'
import { createItemsSlice, ITEMS_INITIAL, type ItemsSlice } from './slices/itemsSlice'
import {
  createLightInteractSlice,
  LIGHT_INTERACT_INITIAL,
  type LightInteractSlice,
} from './slices/lightInteractSlice'
import {
  createLocalAssetsSlice,
  LOCAL_ASSETS_INITIAL,
  type LocalAssetsSlice,
} from './slices/localAssetsSlice'
import { createLocationSlice, LOCATION_INITIAL, type LocationSlice } from './slices/locationSlice'
import {
  createMeasurementsSlice,
  MEASUREMENTS_INITIAL,
  type MeasurementsSlice,
} from './slices/measurementsSlice'
import {
  createNotificationsSlice,
  NOTIFICATIONS_INITIAL,
  type NotificationsSlice,
} from './slices/notificationsSlice'
import {
  createOrientationSlice,
  ORIENTATION_INITIAL,
  type OrientationSlice,
} from './slices/orientationSlice'
import { createPanoTourSlice, PANO_TOUR_INITIAL, type PanoTourSlice } from './slices/panoTourSlice'
import {
  createPlacementSlice,
  PLACEMENT_INITIAL,
  type PlacementSlice,
} from './slices/placementSlice'
import {
  createPriceRulesSlice,
  PRICE_RULES_INITIAL,
  type PriceRulesSlice,
} from './slices/priceRulesSlice'
import { createProjectSlice, PROJECT_INITIAL, type ProjectSlice } from './slices/projectSlice'
import { createPromptSlice, PROMPT_INITIAL, type PromptSlice } from './slices/promptSlice'
import {
  createQuoteTemplateSlice,
  QUOTE_TEMPLATE_INITIAL,
  type QuoteTemplateSlice,
} from './slices/quoteTemplateSlice'
import { createRecentSlice, RECENT_INITIAL, type RecentSlice } from './slices/recentSlice'
import {
  createRemoteCatalogSlice,
  REMOTE_CATALOG_INITIAL,
  type RemoteCatalogSlice,
} from './slices/remoteCatalogSlice'
import { createResetSlice, type ResetSlice } from './slices/resetSlice'
import {
  createSavedMaterialsSlice,
  SAVED_MATERIALS_INITIAL,
  type SavedMaterialsSlice,
} from './slices/savedMaterialsSlice'
import {
  createScreenInteractSlice,
  SCREEN_INTERACT_INITIAL,
  type ScreenInteractSlice,
} from './slices/screenInteractSlice'
import {
  createSelectionSlice,
  SELECTION_INITIAL,
  type SelectionSlice,
} from './slices/selectionSlice'
import {
  createSharedLibrarySlice,
  SHARED_LIBRARY_INITIAL,
  type SharedLibrarySlice,
} from './slices/sharedLibrarySlice'
import {
  createStyleClipboardSlice,
  STYLE_CLIPBOARD_INITIAL,
  type StyleClipboardSlice,
} from './slices/styleClipboardSlice'
import { createTimeSlice, TIME_INITIAL, type TimeSlice } from './slices/timeSlice'
import { createUiSlice, UI_INITIAL, type UiSlice } from './slices/uiSlice'
import {
  createUserAssetsSlice,
  USER_ASSETS_INITIAL,
  type UserAssetsSlice,
} from './slices/userAssetsSlice'
import {
  createUserComponentsSlice,
  USER_COMPONENTS_INITIAL,
  type UserComponentsSlice,
} from './slices/userComponentsSlice'
import {
  createUserProductsSlice,
  USER_PRODUCTS_INITIAL,
  type UserProductsSlice,
} from './slices/userProductsSlice'
import { createUserSetsSlice, USER_SETS_INITIAL, type UserSetsSlice } from './slices/userSetsSlice'
import {
  createUserStylesSlice,
  USER_STYLES_INITIAL,
  type UserStylesSlice,
} from './slices/userStylesSlice'
import {
  createWindowFixtureSlice,
  WINDOW_FIXTURE_INITIAL,
  type WindowFixtureSlice,
} from './slices/windowFixtureSlice'

export interface RootState
  extends CameraSlice,
    TimeSlice,
    LocationSlice,
    MeasurementsSlice,
    CommentsSlice,
    DrawingCalloutsSlice,
    DoorsSlice,
    WindowFixtureSlice,
    ScreenInteractSlice,
    LightInteractSlice,
    ItemsSlice,
    SelectionSlice,
    GroupsSlice,
    UserAssetsSlice,
    ResetSlice,
    UiSlice,
    FinishesSlice,
    PlacementSlice,
    ClipboardSlice,
    HistorySlice,
    RemoteCatalogSlice,
    SharedLibrarySlice,
    LocalAssetsSlice,
    OrientationSlice,
    NotificationsSlice,
    InstalledPacksSlice,
    FloorPlanSlice,
    AppearanceSlice,
    FeaturesSlice,
    StyleClipboardSlice,
    UserSetsSlice,
    UserProductsSlice,
    UserComponentsSlice,
    UserStylesSlice,
    RecentSlice,
    CalloutsSlice,
    BadgesSlice,
    FavouritesSlice,
    SavedMaterialsSlice,
    ColorPaletteSlice,
    CameraViewsSlice,
    PanoTourSlice,
    PromptSlice,
    ProjectSlice,
    PriceRulesSlice,
    QuoteTemplateSlice,
    FeatureFlagsSlice,
    AuthSlice,
    IsolateSlice {
  __resetForTest: () => void
}

const INITIAL = {
  ...CAMERA_INITIAL,
  ...TIME_INITIAL,
  ...LOCATION_INITIAL,
  ...MEASUREMENTS_INITIAL,
  ...COMMENTS_INITIAL,
  ...DRAWING_CALLOUTS_INITIAL,
  ...DOORS_INITIAL,
  ...WINDOW_FIXTURE_INITIAL,
  ...SCREEN_INTERACT_INITIAL,
  ...LIGHT_INTERACT_INITIAL,
  ...ITEMS_INITIAL,
  ...SELECTION_INITIAL,
  ...USER_ASSETS_INITIAL,
  ...UI_INITIAL,
  ...FINISHES_INITIAL,
  ...PLACEMENT_INITIAL,
  ...CLIPBOARD_INITIAL,
  ...HISTORY_INITIAL,
  ...REMOTE_CATALOG_INITIAL,
  ...SHARED_LIBRARY_INITIAL,
  ...LOCAL_ASSETS_INITIAL,
  ...ORIENTATION_INITIAL,
  ...NOTIFICATIONS_INITIAL,
  ...INSTALLED_PACKS_INITIAL,
  ...FLOOR_PLAN_INITIAL,
  ...APPEARANCE_INITIAL,
  ...FEATURES_INITIAL,
  ...FEATURE_FLAGS_INITIAL,
  ...AUTH_INITIAL,
  ...USER_STYLES_INITIAL,
  ...RECENT_INITIAL,
  ...CALLOUTS_INITIAL,
  ...BADGES_INITIAL,
  ...FAVOURITES_INITIAL,
  ...SAVED_MATERIALS_INITIAL,
  ...COLOR_PALETTE_INITIAL,
  ...CAMERA_VIEWS_INITIAL,
  ...PANO_TOUR_INITIAL,
  ...PROMPT_INITIAL,
  ...PROJECT_INITIAL,
  ...QUOTE_TEMPLATE_INITIAL,
  ...PRICE_RULES_INITIAL,
  ...STYLE_CLIPBOARD_INITIAL,
  ...USER_SETS_INITIAL,
  ...ISOLATE_INITIAL,
  ...USER_PRODUCTS_INITIAL,
  ...USER_COMPONENTS_INITIAL,
}

export const useStore = create<RootState>((set, get, api) => ({
  ...createCameraSlice(set, get, api),
  ...createTimeSlice(set, get, api),
  ...createLocationSlice(set, get, api),
  ...createMeasurementsSlice(set, get, api),
  ...createCommentsSlice(set, get, api),
  ...createDrawingCalloutsSlice(set, get, api),
  ...createDoorsSlice(set, get, api),
  ...createWindowFixtureSlice(set, get, api),
  ...createScreenInteractSlice(set, get, api),
  ...createLightInteractSlice(set, get, api),
  ...createItemsSlice(set, get, api),
  ...createSelectionSlice(set, get, api),
  ...createGroupsSlice(set, get, api),
  ...createUserAssetsSlice(set, get, api),
  ...createResetSlice(set, get, api),
  ...createUserStylesSlice(set, get, api),
  ...createUiSlice(set, get, api),
  ...createFinishesSlice(set, get, api),
  ...createPlacementSlice(set, get, api),
  ...createClipboardSlice(set, get, api),
  ...createHistorySlice(set, get, api),
  ...createRemoteCatalogSlice(set, get, api),
  ...createSharedLibrarySlice(set, get, api),
  ...createLocalAssetsSlice(set, get, api),
  ...createOrientationSlice(set, get, api),
  ...createNotificationsSlice(set, get, api),
  ...createInstalledPacksSlice(set, get, api),
  ...createFloorPlanSlice(set, get, api),
  ...createAppearanceSlice(set, get, api),
  ...createFeaturesSlice(set, get, api),
  ...createFeatureFlagsSlice(set, get, api),
  ...createAuthSlice(set, get, api),
  ...createRecentSlice(set, get, api),
  ...createCalloutsSlice(set, get, api),
  ...createBadgesSlice(set, get, api),
  ...createFavouritesSlice(set, get, api),
  ...createSavedMaterialsSlice(set, get, api),
  ...createColorPaletteSlice(set, get, api),
  ...createCameraViewsSlice(set, get, api),
  ...createPanoTourSlice(set, get, api),
  ...createPromptSlice(set, get, api),
  ...createProjectSlice(set, get, api),
  ...createQuoteTemplateSlice(set, get, api),
  ...createPriceRulesSlice(set, get, api),
  ...createStyleClipboardSlice(set, get, api),
  ...createUserSetsSlice(set, get, api),
  ...createUserProductsSlice(set, get, api),
  ...createUserComponentsSlice(set, get, api),
  ...createIsolateSlice(set, get, api),
  __resetForTest: () => set({ ...INITIAL }),
}))

// Keep the curated flat's module-level wall thickness in sync with the active
// plan: the plan-wide `wallThickness` default AND per-wall `thicknessM` overrides
// (the default plan's wall ids match the curated WALLS, so 2D-editor edits flow
// to the curated render). Custom plans resolve via `planWallThickness(wall, plan)`
// instead. Cheap reference guards; fired once now for the initial plan.
let lastWallThickness: FloorPlan['wallThickness']
let lastWalls: FloorPlan['walls'] | undefined
const applyFlatWallThickness = (plan: FloorPlan) => {
  if (plan.wallThickness !== lastWallThickness) {
    lastWallThickness = plan.wallThickness
    setFlatWallThicknessDefaults(plan.wallThickness)
  }
  if (plan.walls !== lastWalls) {
    lastWalls = plan.walls
    setFlatWallThicknessOverrides(plan.walls)
  }
}
applyFlatWallThickness(useStore.getState().floorPlan)
useStore.subscribe((s) => applyFlatWallThickness(s.floorPlan))

// Isolate/solo (FEAT-C) auto-clear: a stale solo view must never outlive the
// item it was framing, so `isolateActive` clears itself the moment the
// selection actually changes. This single watcher covers BOTH triggers the
// spec calls for — a plain selection change AND exiting the room editor
// (`uiSlice.exitRoomEditor` clears selection via `selectItem(null)`;
// `enterRoomEditor` clears it too on the way in) — without coupling
// `selectionSlice`/`uiSlice` to isolate state. Compares content, not
// reference, so a re-click of the same already-selected item (a fresh `[id]`
// array, same contents) doesn't spuriously drop isolate.
let lastSelectedItemIds: string[] = useStore.getState().selectedItemIds
const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i])
useStore.subscribe((s) => {
  if (s.isolateActive && !sameIds(s.selectedItemIds, lastSelectedItemIds)) {
    s.setIsolateActive(false)
  }
  lastSelectedItemIds = s.selectedItemIds
})
