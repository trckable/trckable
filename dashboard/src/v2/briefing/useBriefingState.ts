// What the Briefing remembers while it is open: the card that is opened, whether "More" is open, which sheet is up,
// the email switch and the row of keys (hidden for good once used).
import { useCallback, useState } from 'react'
import type { Story } from './cards'

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const put = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* a blocked store only forgets */
  }
}

export function useBriefingState(site: string) {
  const [open, setOpen] = useState<Story | null>(null)
  const [all, setAll] = useState(false)
  const [sheet, setSheet] = useState<'notes' | 'mail' | null>(null)
  const [addNote, setAddNote] = useState(false)
  const [how, setHow] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<Set<string>>(new Set())
  const [kf, setKf] = useState<string | null>(null)
  const [mail, setMail] = useState(() => get(`trckable:mail:${site}`) !== 'off')
  const toggleMail = useCallback(() => {
    setMail((m) => {
      put(`trckable:mail:${site}`, m ? 'off' : 'on')
      return !m
    })
  }, [site])
  const flip = (set: Set<string>, k: string) => {
    const n = new Set(set)
    if (!n.delete(k)) n.add(k)
    return n
  }
  const toggleHow = useCallback((k: string) => setHow((h) => flip(h, k)), [])
  const markDone = useCallback((k: string) => setDone((d) => new Set(d).add(k)), [])
  return { how, toggleHow, done, markDone, kf, setKf, open, setOpen, all, setAll, sheet, setSheet, addNote, setAddNote, mail, toggleMail }
}
