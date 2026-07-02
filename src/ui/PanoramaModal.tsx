import { useCallback, useEffect, useState } from 'react'
import { useFeature } from '../features/useFeature'
import { capturePanorama } from '../scene/panorama/capturePanorama'
import { useStore } from '../state/store'
import { Button } from './controls/Button'
import { Modal } from './Modal'
import { PanoramaViewer } from './panorama/PanoramaViewer'

/**
 * 360° panorama: captures an equirect render from the current viewpoint
 * (via `PanoramaController`) and shows it in the shared drag-to-look sphere
 * viewer (`panorama/PanoramaViewer`, also used by the 360° slides in
 * presentation mode) with a PNG download.
 */
export function PanoramaModal() {
  const open = useStore((s) => s.panoramaOpen)
  const setOpen = useStore((s) => s.setPanoramaOpen)
  const fPanoTour = useFeature('panoTour')
  const [pano, setPano] = useState<HTMLCanvasElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const capture = useCallback(() => {
    setBusy(true)
    setFailed(false)
    // Let the modal paint its "capturing" state before the blocking renders.
    setTimeout(() => {
      void capturePanorama().then((res) => {
        setPano(res?.canvas ?? null)
        setFailed(!res)
        setBusy(false)
      })
    }, 30)
  }, [])

  useEffect(() => {
    if (open) capture()
    else {
      setPano(null)
      setFailed(false)
    }
  }, [open, capture])

  const download = () => {
    if (!pano) return
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const a = document.createElement('a')
    a.href = pano.toDataURL('image/png')
    a.download = `hdb-panorama-${stamp}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    useStore.getState().notify.start({ title: 'Panorama saved to your downloads', kind: 'success' })
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="360° Panorama"
      sub="Captured from where you're looking — drag to look around, scroll to zoom"
      width="var(--modal-lg)"
      panelId="panorama"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button onClick={capture} disabled={busy}>
              Re-capture
            </Button>
            {fPanoTour ? (
              <Button
                title="Save this viewpoint as a 360° tour stop (File → 360° tour)"
                onClick={() => {
                  const st = useStore.getState()
                  const id = st.addPanoTourStopHere()
                  const label = useStore.getState().panoTourStops.find((t) => t.id === id)?.label
                  st.notify.start(
                    id
                      ? { title: `Added tour stop “${label}”`, kind: 'success' }
                      : { title: 'Tour is full — remove a stop first', kind: 'error' },
                  )
                }}
              >
                Add to tour
              </Button>
            ) : null}
          </div>
          <Button variant="accent" onClick={download} disabled={!pano}>
            Download PNG
          </Button>
        </div>
      }
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: 'var(--surface-3)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {pano ? <PanoramaViewer pano={pano} /> : null}
        {busy || !pano ? (
          <div
            className="panel-sub"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textTransform: 'none',
              letterSpacing: 0,
            }}
          >
            {busy ? 'Capturing panorama…' : failed ? 'Could not capture — try again.' : ''}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
