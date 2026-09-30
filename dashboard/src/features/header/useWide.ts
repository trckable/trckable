// Whether the screen is a desktop's width (1024 px and up): there the Live | Data
// switch sits in the header's right group; a phone or a tablet keeps it in
// the row under the header.
import { useSyncExternalStore } from 'react'

const query = '(min-width: 1024px)'
const match = () => typeof matchMedia === 'function' && matchMedia(query).matches
const watch = (fn: () => void) => {
  const mq = matchMedia(query)
  mq.addEventListener('change', fn)
  return () => mq.removeEventListener('change', fn)
}

export const useWide = () => useSyncExternalStore(watch, match, () => false)
