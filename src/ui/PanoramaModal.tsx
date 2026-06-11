import { useCallback, useEffect, useState } from 'react'
import { capturePanorama } from '../scene/panorama/capturePanorama'
import { useStore } from '../state/store'
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
      width={720}
      panelId="panorama"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn" onClick={capture} disabled={busy}>
            Re-capture
          </button>
          <button type="button" className="btn btn-accent" onClick={download} disabled={!pano}>
            Download PNG
          </button>
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
