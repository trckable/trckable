import { useEffect, useState } from 'react'

/** Whether a media query matches, kept up to date. */
function useMedia(query: string) {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const change = () => setOn(mq.matches)
    mq.addEventListener('change', change)
    return () => mq.removeEventListener('change', change)
  }, [query])
  return on
}

/** True on phone-width screens, so the chart and cards can shrink. */
export const useNarrow = () => useMedia('(max-width: 640px)')
