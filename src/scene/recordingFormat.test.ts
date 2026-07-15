import { describe, expect, it } from 'vitest'
import { pickRecordingFormat, resolveActualFormat } from './recordingFormat'

/** Build a fake `isTypeSupported` that returns true for the given MIME set. */
const supports =
  (...types: string[]) =>
  (t: string) =>
    types.includes(t)

describe('pickRecordingFormat', () => {
  it('prefers MP4 (H.264) when the browser can encode it', () => {
    const fmt = pickRecordingFormat(supports('video/mp4;codecs=avc1.640028', 'video/webm'))
    expect(fmt).toEqual({
      mimeType: 'video/mp4;codecs=avc1.640028',
      extension: 'mp4',
      blobType: 'video/mp4',
    })
  })

  it('picks MP4 even when only a looser mp4 candidate is supported', () => {
    const fmt = pickRecordingFormat(supports('video/mp4'))
    expect(fmt.extension).toBe('mp4')
    expect(fmt.mimeType).toBe('video/mp4')
    expect(fmt.blobType).toBe('video/mp4')
  })

  it('falls back to WebM (VP9 first) when no MP4 candidate is supported', () => {
    const fmt = pickRecordingFormat(supports('video/webm;codecs=vp9', 'video/webm;codecs=vp8'))
    expect(fmt).toEqual({
      mimeType: 'video/webm;codecs=vp9',
      extension: 'webm',
      blobType: 'video/webm',
    })
  })

  it('drops to VP8 when VP9 is unavailable', () => {
    const fmt = pickRecordingFormat(supports('video/webm;codecs=vp8', 'video/webm'))
    expect(fmt.mimeType).toBe('video/webm;codecs=vp8')
    expect(fmt.extension).toBe('webm')
  })

  it('returns an unlabelled default (still .webm) when nothing matches', () => {
    const fmt = pickRecordingFormat(() => false)
    expect(fmt).toEqual({ mimeType: undefined, extension: 'webm', blobType: 'video/webm' })
  })
})

describe('resolveActualFormat', () => {
  const mp4 = {
    mimeType: 'video/mp4;codecs=avc1.640028',
    extension: 'mp4',
    blobType: 'video/mp4',
  } as const
  const webm = {
    mimeType: 'video/webm;codecs=vp9',
    extension: 'webm',
    blobType: 'video/webm',
  } as const

  it('keeps the requested format when the recorder reports no mimeType', () => {
    expect(resolveActualFormat(mp4, '')).toEqual(mp4)
  })

  it('echoes the requested format when the actual mime agrees', () => {
    expect(resolveActualFormat(mp4, 'video/mp4;codecs=avc1.640028')).toEqual({
      mimeType: 'video/mp4;codecs=avc1.640028',
      extension: 'mp4',
      blobType: 'video/mp4',
    })
  })

  it('follows the actual mime when the recorder picked WebM despite an MP4 request', () => {
    expect(resolveActualFormat(mp4, 'video/webm;codecs=vp8')).toEqual({
      mimeType: 'video/webm;codecs=vp8',
      extension: 'webm',
      blobType: 'video/webm',
    })
  })

  it('detects the container even with extra codec params or casing', () => {
    expect(resolveActualFormat(webm, 'VIDEO/MP4; codecs="avc1.42E01E"').extension).toBe('mp4')
  })

  it('keeps the requested format for an unknown container', () => {
    expect(resolveActualFormat(webm, 'video/x-matroska')).toEqual(webm)
  })
})
