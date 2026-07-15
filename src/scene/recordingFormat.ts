/**
 * Chosen container/codec for a canvas recording, with the honest file
 * extension + `Blob` type to match.
 */
export interface RecordingFormat {
  /** MIME string to pass to `MediaRecorder`, or `undefined` to let it pick its
   *  own default (nothing in the candidate lists was supported). */
  mimeType: string | undefined
  /** Download extension — always matches what actually gets encoded. */
  extension: 'mp4' | 'webm'
  /** `Blob` type used to assemble the recorded chunks. */
  blobType: string
}

// One ordered candidate list, tried top to bottom (first supported wins). MP4
// (H.264/avc1) is preferred — it plays natively everywhere (QuickTime, iOS
// Photos, Windows, most editors) whereas .webm won't open in many of those.
// Chrome/Edge only advertise `video/mp4` from MediaRecorder when the platform
// exposes a hardware/OS H.264 encoder, so it MUST be probed at runtime via
// `MediaRecorder.isTypeSupported()`; Safari records mp4 natively; Firefox does
// not, and cleanly falls through to the WebM (VP9/VP8) candidates below.
// Refs: MDN MediaRecorder.isTypeSupported; chromestatus.com/feature/5163469011943424
//       ("MP4 container support for MediaRecorder").
const CANDIDATES: { mime: string; extension: 'mp4' | 'webm'; blobType: string }[] = [
  { mime: 'video/mp4;codecs=avc1.640028', extension: 'mp4', blobType: 'video/mp4' }, // High profile
  { mime: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4', blobType: 'video/mp4' }, // Baseline (widest)
  { mime: 'video/mp4;codecs=avc1', extension: 'mp4', blobType: 'video/mp4' },
  { mime: 'video/mp4', extension: 'mp4', blobType: 'video/mp4' },
  { mime: 'video/webm;codecs=vp9', extension: 'webm', blobType: 'video/webm' },
  { mime: 'video/webm;codecs=vp8', extension: 'webm', blobType: 'video/webm' },
  { mime: 'video/webm', extension: 'webm', blobType: 'video/webm' },
]

/**
 * Pick the best recording format the browser can actually encode. Pure over an
 * injected `isTypeSupported` so it's unit-testable without a real
 * `MediaRecorder`. Prefers MP4 (H.264), then WebM (VP9/VP8), then a bare
 * unlabelled default — the extension/blobType are always kept honest with the
 * container that will be produced.
 */
export function pickRecordingFormat(isTypeSupported: (type: string) => boolean): RecordingFormat {
  for (const c of CANDIDATES) {
    if (isTypeSupported(c.mime))
      return { mimeType: c.mime, extension: c.extension, blobType: c.blobType }
  }
  // Nothing matched — let MediaRecorder use its implementation default. Real
  // engines that reach here still emit WebM, so label it as such.
  return { mimeType: undefined, extension: 'webm', blobType: 'video/webm' }
}

/**
 * Reconcile the format we requested with the one the recorder actually selected.
 * `MediaRecorder.mimeType` (read after construction) reports the real container —
 * but the spec allows it to be `''` on some engines. Derive the honest
 * extension/blobType from the actual MIME when it names a known container, else
 * keep the requested format. Pure so it's unit-testable without a real recorder.
 */
export function resolveActualFormat(
  requested: RecordingFormat,
  actualMimeType: string,
): RecordingFormat {
  const mime = actualMimeType.toLowerCase()
  if (mime.includes('mp4'))
    return { mimeType: actualMimeType, extension: 'mp4', blobType: 'video/mp4' }
  if (mime.includes('webm'))
    return { mimeType: actualMimeType, extension: 'webm', blobType: 'video/webm' }
  return requested
}
