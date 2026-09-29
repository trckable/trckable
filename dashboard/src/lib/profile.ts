// Who is signed in, for the header's avatar: read once, and again whenever
// the account window changes the name or the picture.
import { useEffect, useState } from 'react'
import { api, type Profile } from './api'

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [v, bump] = useState(0) // cache-buster after a new picture
  useEffect(() => {
    const load = () => api.profile().then(setProfile).catch(() => {})
    void load()
    const again = () => {
      bump((n) => n + 1)
      void load()
    }
    window.addEventListener('trckable:profile', again)
    return () => window.removeEventListener('trckable:profile', again)
  }, [])
  return { profile, v }
}
