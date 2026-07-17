import { useFeature } from '../../../features/useFeature'
import { isMultiLevel, planLevels } from '../../../floorplan/levels'
import { enterVr } from '../../../scene/xr/xrStore'
import { captureThumb } from '../../../state/storage/slotThumbs'
import { useStore } from '../../../state/store'
import { PresentationSetup } from '../../presentation/PresentationSetup'
import { DayNightClipSetup } from '../../scene/DayNightClipSetup'
import { Icon } from '../icons'
import { Item, Section } from './parts'

/** View — combined camera + framing (mirrors the desktop View menu).
 *  Orbit/Walk always; top/reset/turntable/saved only in the overview (the room
 *  editor frames its own room). */
export function ViewSection({
  activeId,
  act,
  vrSupported,
}: {
  activeId: string
  act: (fn: () => void, opts?: { keep?: boolean; defer?: boolean }) => () => void
  vrSupported: boolean
}) {
  const s = useStore
  const cameraMode = useStore((st) => st.cameraMode)
  const viewLevelId = useStore((st) => st.viewLevelId)
  const mobilePlan = useStore((st) => st.floorPlan)
  const autoRotate = useStore((st) => st.autoRotate)
  const verticalLock = useStore((st) => st.verticalLock)
  const parallelProjection = useStore((st) => st.parallelProjection)
  const roomEditorActive = useStore((st) => st.roomEditor.active)
  const savedViews = useStore((st) => st.savedViews)

  const fVr = useFeature('vrWalkthrough')
  const fSavedViews = useFeature('savedViews')
  const fPresentation = useFeature('presentation')
  const fPanoTour = useFeature('panoTour')
  const fTwoPointPerspective = useFeature('twoPointPerspective')
  const fParallelProjection = useFeature('parallelProjection')
  const fDayNightClip = useFeature('dayNightClip')

  return (
    <Section id="view" title="View" icon="Orbit" activeId={activeId}>
      <div className="m-sub-h">Camera</div>
      <Item
        icon="Orbit"
        label="Orbit"
        sub="Look around the model"
        on={cameraMode === 'orbit'}
        onClick={act(() => s.getState().setCameraMode('orbit'))}
      />
      <Item
        icon="Walk"
        label="Walk"
        sub="First-person walkthrough"
        on={cameraMode === 'firstPerson'}
        onClick={act(() => s.getState().setCameraMode('firstPerson'))}
      />
      {fVr && vrSupported ? (
        <Item
          icon="Walk"
          label="Enter VR"
          sub="Immersive walkthrough on your headset"
          onClick={act(() => {
            s.getState().setVrActive(true)
            void enterVr()
          })}
        />
      ) : null}
      {isMultiLevel(mobilePlan) ? (
        <>
          <div className="m-sub-h">Levels</div>
          <Item
            icon="TopView"
            label="All levels"
            on={viewLevelId === 'all'}
            onClick={act(() => s.getState().setViewLevel('all'), { keep: true })}
          />
          {planLevels(mobilePlan).map((l) => (
            <Item
              key={l.id}
              icon="TopView"
              label={l.name}
              // Walk mode: picking a storey teleports the walker (ML6c).
              sub={cameraMode === 'firstPerson' ? 'Walk this storey' : undefined}
              on={viewLevelId === l.id}
              onClick={act(() => s.getState().setViewLevel(l.id), { keep: true })}
            />
          ))}
        </>
      ) : null}
      {!roomEditorActive ? (
        <>
          <div className="m-sub-h">Framing</div>
          <Item
            icon="TopView"
            label="Top view"
            sub="Fit the whole flat, top-down"
            onClick={act(() => s.getState().requestTopView(), { defer: true })}
          />
          <Item
            icon="Reset"
            label="Reset view"
            sub="Fit the 3D overview"
            onClick={act(() => s.getState().requestHomeView(), { defer: true })}
          />
          <Item
            icon="Turntable"
            label="Turntable"
            sub="Slowly auto-orbit"
            on={autoRotate}
            onClick={act(() => s.getState().toggleAutoRotate(), { keep: true })}
          />
          {fTwoPointPerspective ? (
            <Item
              icon="AlignX"
              label="Vertical lock"
              sub="Keep wall corners parallel"
              on={verticalLock}
              onClick={act(() => s.getState().toggleVerticalLock(), { keep: true })}
            />
          ) : null}
          {fParallelProjection ? (
            <Item
              icon="Cube"
              label="Parallel projection"
              sub="Orthographic dollhouse view"
              on={parallelProjection}
              newFlag="parallelProjection"
              onClick={act(() => s.getState().toggleParallelProjection(), { keep: true })}
            />
          ) : null}
          {fSavedViews ? (
            <Item
              icon="Plus"
              label="Save current view"
              sub="Bookmark this camera angle"
              onClick={act(async () => {
                const thumb = captureThumb()
                const name = await s.getState().promptText({
                  title: 'Save camera view',
                  label: 'Name this view',
                  defaultValue: `View ${savedViews.length + 1}`,
                  submitLabel: 'Save',
                })
                if (name) s.getState().saveCurrentView(name, thumb)
              })}
            />
          ) : null}
          {fSavedViews && savedViews.length > 0 ? (
            fPresentation && fPanoTour ? (
              <PresentationSetup />
            ) : fPresentation ? (
              <Item
                icon="Walkthrough"
                label="Present"
                sub="Full-screen saved-views slideshow"
                onClick={act(() => s.getState().setPresenting(true))}
              />
            ) : null
          ) : null}
          {fSavedViews && savedViews.length > 1 ? (
            <Item
              icon="Walkthrough"
              label="Cinematic tour"
              sub="Fly through your saved views"
              onClick={act(() => s.getState().setTouring('views'))}
            />
          ) : null}
          {fSavedViews && savedViews.length > 1 && fDayNightClip ? <DayNightClipSetup /> : null}
        </>
      ) : null}
      {!roomEditorActive &&
        fSavedViews &&
        savedViews.map((v) => (
          <div key={v.id} className="m-saved-view">
            <button
              type="button"
              className="m-item m-saved-view-go"
              onClick={act(() => s.getState().applyView(v.id))}
            >
              {v.thumb ? (
                <img src={v.thumb} alt="" className="saved-view-thumb" />
              ) : (
                <Icon.Eye className="icn" width={18} height={18} />
              )}
              <span className="m-item-tx">
                <span className="m-item-l">{v.name}</span>
              </span>
            </button>
            {fPresentation ? (
              <button
                type="button"
                className="m-saved-view-del"
                aria-label={`Present ${v.name} as a 360° slide`}
                aria-pressed={!!v.pano}
                style={v.pano ? { color: 'var(--accent)' } : undefined}
                onClick={() => s.getState().setViewPano(v.id, !v.pano)}
              >
                <span style={{ fontSize: 10, fontWeight: 700 }}>360°</span>
              </button>
            ) : null}
            <button
              type="button"
              className="m-saved-view-del"
              aria-label={`Delete view ${v.name}`}
              onClick={() => s.getState().deleteView(v.id)}
            >
              <Icon.Trash width={16} height={16} />
            </button>
          </div>
        ))}
    </Section>
  )
}
