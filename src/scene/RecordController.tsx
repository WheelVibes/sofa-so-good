import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { pickRecordingFormat } from './recordingFormat'

/** True when the browser can record a canvas stream to a video file. */
export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  )
}

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
  // Pending object-URL revoke timers, tracked so they can be cleared on unmount
  // (a download can fire `onstop` then unmount within the 2 s window — without
  // this the timer would run on a dead context). Multiple recordings in one
  // session each add their own handle, so we keep a set rather than a single ref.
  const revokeTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>())

  // Clear any still-pending revoke timers on unmount. They are best-effort
  // cleanup of already-downloaded blobs; the browser reclaims the object URLs on
  // page teardown anyway, so dropping them on unmount is safe.
  useEffect(() => {
    const timers = revokeTimersRef.current
    return () => {
      for (const handle of timers) clearTimeout(handle)
      timers.clear()
    }
  }, [])

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
      // MP4 (H.264) where the browser can encode it, else .webm — the extension
      // and blob type below stay honest with whichever container is produced.
      const fmt = pickRecordingFormat((t) => MediaRecorder.isTypeSupported(t))
      rec = new MediaRecorder(
        stream,
        fmt.mimeType ? { mimeType: fmt.mimeType, videoBitsPerSecond: 12_000_000 } : undefined,
      )
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: fmt.blobType })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        a.href = url
        a.download = `hdb-design-${stamp}.${fmt.extension}`
        document.body.appendChild(a)
        a.click()
        a.remove()
        const timers = revokeTimersRef.current
        const handle = setTimeout(() => {
          URL.revokeObjectURL(url)
          timers.delete(handle)
        }, 2000)
        timers.add(handle)
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
