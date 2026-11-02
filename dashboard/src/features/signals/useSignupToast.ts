// A signup on the stream is a moment like a sale: the same toast, browser notice and chime (the bell lists them from the server).
import { useMemo } from 'react'
import type { Visit } from '../../lib/api'
import { isSignup, signupLine } from './signupLine'
import { useMomentToast } from './useMomentToast'

const tag = (v: Visit) => `signup-${v.ts}-${v.visitor ?? ''}`
const loud = () => true

export function useSignupToast(visits: (Visit & { id: number })[], goal: string | undefined) {
  const items = useMemo(() => visits.filter((v) => isSignup(v, goal)), [visits, goal])
  useMomentToast({ items, line: signupLine, tag, loud })
}
