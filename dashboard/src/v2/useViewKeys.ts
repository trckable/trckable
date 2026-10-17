// The keys of both screens: L is Live, B the Briefing, E opens Explore. Not while typing, nor while a panel is open.
import { useEffect } from 'react'
import { switchTab } from '../features/live/switchView'
import { pressed } from '../lib/keys'
import { isShared } from '../lib/me'
import { goExplore } from './briefing/deeper'

export function useViewKeys(here: 'live' | 'briefing') {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tg = (e.target as HTMLElement).tagName
      if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return
      if (document.querySelector('.xscrim.on, .pal.on, .cd.on')) return
      if (pressed(e, 'live') && !isShared()) void switchTab('live', here)
      else if (pressed(e, 'briefing')) void switchTab('briefing', here)
      else if (pressed(e, 'explore')) goExplore()
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [here])
}
