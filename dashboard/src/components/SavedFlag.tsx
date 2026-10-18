import { useState } from 'react'
// "Saved" that fades in after a save and away again. The words are there only while it shows, so nothing says "Saved" before anything was changed;
// the live region stays, so a screen reader hears it when it appears.

/** "Saved" that fades away, so a save needs no button and no banner: the flag, and what shows it for a moment. */
export function useSaved() {
  const [saved, setSaved] = useState(false)
  return [saved, () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }] as const
}

export function SavedFlag({ on }: { on: boolean }) {
  return (
    <span className={on ? 'saved on' : 'saved'} aria-live="polite">
      {on ? 'Saved' : ''}
    </span>
  )
}
