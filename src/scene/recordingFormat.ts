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

// Prefer MP4 (H.264/avc1) — it plays natively everywhere (QuickTime, iOS
// Photos, Windows, most editors) whereas .webm won't open in many of those.
// Chrome/Edge only advertise `video/mp4` from MediaRecorder when the platform
// exposes a hardware/OS H.264 encoder, so it MUST be probed at runtime via
// `MediaRecorder.isTypeSupported()`; Safari records mp4 natively; Firefox does
// not, and cleanly falls through to the .webm candidates below.
// Refs: MDN MediaRecorder.isTypeSupported; chromestatus.com/feature/5163469011943424
//       ("MP4 container support for MediaRecorder").
const MP4_CANDIDATES = [
  'video/mp4;codecs=avc1.640028', // High profile
  'video/mp4;codecs=avc1.42E01E', // Baseline profile (widest device support)
  'video/mp4;codecs=avc1',
  'video/mp4',
]
const WEBM_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

/**
 * Pick the best recording format the browser can actually encode. Pure over an
 * injected `isTypeSupported` so it's unit-testable without a real
 * `MediaRecorder`. Prefers MP4 (H.264), then WebM (VP9/VP8), then a bare
 * unlabelled default — the extension/blobType are always kept honest with the
 * container that will be produced.
 */
export function pickRecordingFormat(isTypeSupported: (type: string) => boolean): RecordingFormat {
  for (const mimeType of MP4_CANDIDATES) {
    if (isTypeSupported(mimeType)) return { mimeType, extension: 'mp4', blobType: 'video/mp4' }
  }
  for (const mimeType of WEBM_CANDIDATES) {
    if (isTypeSupported(mimeType)) return { mimeType, extension: 'webm', blobType: 'video/webm' }
  }
  // Nothing matched — let MediaRecorder use its implementation default. Real
  // engines that reach here still emit WebM, so label it as such.
  return { mimeType: undefined, extension: 'webm', blobType: 'video/webm' }
}
