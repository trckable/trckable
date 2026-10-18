// How many parts of the page on screen are still waiting for their numbers or their code. The foot under every page reads
// it: it stays unseen until the page has its height, so it does not slide down when a slow line brings the content.
import { useEffect } from 'react'
import { miniStore } from './miniStore'

export const pageLoading = miniStore(0)

/** Counts this part as loading while `loading` is true, and stops counting when it is done or gone. */
export function usePageLoading(loading: boolean) {
  useEffect(() => {
    if (!loading) return
    pageLoading.set(pageLoading.get() + 1)
    return () => pageLoading.set(pageLoading.get() - 1)
  }, [loading])
}

/** Drawn inside a loading shape (a Suspense fallback): the page counts as loading while the shape is there. */
export function PageHold() {
  usePageLoading(true)
  return null
}
