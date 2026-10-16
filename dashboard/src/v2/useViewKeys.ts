// The keys of both screens: L is Live, B the Briefing, E opens Explore. Not while typing, nor while a panel is open.
import { useEffect } from 'react'
import { switchTab } from '../features/live/switchView'
import { goExplore } from './briefing/deeper'

export function useViewKeys(here: 'live' | 'briefing') {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tg = (e.target as HTMLElement).tagName
      if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return
      if (document.querySelector('.xscrim.on, .pal.on, .cd.on')) return
      const k = e.key.toLowerCase()
      if (k === 'l') void switchTab('live', here)
      else if (k === 'b') void switchTab('briefing', here)
      else if (k === 'e') goExplore()
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [here])
}
