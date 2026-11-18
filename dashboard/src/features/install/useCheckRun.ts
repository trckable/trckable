// What a press on "Check now" shows: the look runs for at least MIN_MS even when the answer is quicker, so the press is
// seen; then the outcome stays until the next press. A press while a look runs is ignored.
import { useEffect, useRef, useState } from 'react'
import type { InstallCheckHandle } from './useInstallCheck'

export const MIN_MS = 700

export type Outcome = 'none' | 'seen' | 'failed'

export function useCheckRun(check: InstallCheckHandle) {
  const [running, setRunning] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>('none')
  // When the outcome was shown (ms), for "checked 11:43".
  const [shownAt, setShownAt] = useState(0)
  // How many presses so far: the first visit's ring pings once for each, and the button gives one nudge for each "no visit yet".
  const [presses, setPresses] = useState(0)
  const from = useRef({ at: check.at, started: 0 })
  const phase = check.state.phase
  // Rate limited: the check looks again by itself when the wait is over, so a press cannot bring it forward.
  const limited = phase === 'limited' && !running

  const press = () => {
    if (running || limited) return
    from.current = { at: check.at, started: Date.now() }
    setRunning(true)
    setPresses((n) => n + 1)
    check.start()
  }

  // The look has ended when it has stamped a new time; the outcome shows once MIN_MS have passed.
  useEffect(() => {
    if (!running || check.at === from.current.at || phase === 'checking') return
    const wait = Math.max(0, MIN_MS - (Date.now() - from.current.started))
    const timer = setTimeout(() => {
      setShownAt(check.at ?? 0)
      // Rate limited reads as a plain "no visit yet": the check looks again by itself.
      setOutcome(phase === 'failed' ? 'failed' : 'seen')
      setRunning(false)
    }, wait)
    return () => clearTimeout(timer)
  }, [running, check.at, phase])

  return { running, limited, outcome, shownAt, presses, press }
}
