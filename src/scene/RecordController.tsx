import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'

/** True when the browser can record a canvas stream to a video file. */
export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  )
}

const MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

type CaptureTrack = MediaStreamTrack & { requestFrame?: () => void }

/**
 * Records the live WebGL canvas to a downloadable .webm while `recording` is
 * true (toggled from the toolbar). Uses a manual-frame capture stream
 * (`captureStream(0)`) and pushes each rendered frame via `track.requestFrame`
 * from the render loop — reliable regardless of compositor behaviour (and it
 * works because the canvas keeps a readable drawing buffer). Post-processing
 * and the turntable orbit are included; stopping triggers the download.
 */
export function RecordController() {
  const { gl } = useThree()
  const recording = useStore((s) => s.recording)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const trackRef = useRef<CaptureTrack | null>(null)

  useEffect(() => {
    if (!recording) return
    if (!canRecord()) {
      useStore.getState().setRecording(false)
      return
    }
    let rec: MediaRecorder
    const chunks: Blob[] = []
    try {
      const canvas = gl.domElement as HTMLCanvasElement & {
        captureStream(fps?: number): MediaStream
      }
      const stream = canvas.captureStream(0) // 0 → frames pushed manually
      trackRef.current = stream.getVideoTracks()[0] as CaptureTrack
      const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t))
      rec = new MediaRecorder(
        stream,
        mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined,
      )
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        a.href = url
        a.download = `hdb-design-${stamp}.webm`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
      }
      // Timeslice flushes encoded data periodically rather than only on stop,
      // which is more reliable across browser MediaRecorder implementations.
      rec.start(250)
      recorderRef.current = rec
    } catch {
      useStore.getState().setRecording(false)
      return
    }
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
      recorderRef.current = null
      trackRef.current = null
    }
  }, [recording, gl])

  // Push one captured frame per rendered frame while recording.
  useFrame(() => {
    if (recording && trackRef.current?.requestFrame) trackRef.current.requestFrame()
  })

  return null
}
