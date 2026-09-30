// Who is signed in, for the header's avatar: read once, and again whenever
// the account window changes the name or the picture.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { api, type Profile } from './api'

// The cache-buster of every picture on screen: one counter, moved by the
// same signal that says the name or the picture changed, so the header, the
// account window and the people list all change together.
let version = 0
const watchers = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('trckable:profile', () => {
    version += 1
    watchers.forEach((w) => w())
  })
}
const watch = (w: () => void) => {
  watchers.add(w)
  return () => void watchers.delete(w)
}

export function usePictureVersion() {
  return useSyncExternalStore(watch, () => version, () => 0)
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const v = usePictureVersion()
  useEffect(() => {
    const load = () => api.profile().then(setProfile).catch(() => {})
    void load()
    const again = () => void load()
    window.addEventListener('trckable:profile', again)
    return () => window.removeEventListener('trckable:profile', again)
  }, [])
  return { profile, v }
}
