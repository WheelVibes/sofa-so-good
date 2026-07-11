import { useEffect, useState } from 'react'
import { MOBILE_MEDIA_QUERY } from './breakpoints'

/** Tracks the ≤640px "mobile" breakpoint (matches `body.mobile` toggled in App). */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MEDIA_QUERY).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY)
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}
