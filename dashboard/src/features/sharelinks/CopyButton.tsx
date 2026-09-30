// Copy a piece of text, and say so: the label turns into a check for a moment
// and a toast confirms it. One button for the Created screen (with its label)
// and the list's rows (an icon).
import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from '../../components/Toast'
import { copy } from './copy'

interface Props {
  text: string
  label: string
  toastText: string
  primary?: boolean
  first?: boolean
  /** An icon button for a row: the label is its name, not its text. */
  icon?: boolean
}

export function CopyButton({ text, label, toastText, primary, first, icon }: Props) {
  const [done, setDone] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  // The first thing to do here is copy, so focus starts on it, without the scroll autoFocus adds.
  useEffect(() => {
    if (first) btn.current?.focus({ preventScroll: true })
  }, [first])
  const run = () => {
    const clip = navigator.clipboard
    if (!clip) return toast(copy.copyFailed, 'error')
    clip
      .writeText(text)
      .then(() => {
        setDone(true)
        toast(toastText)
        setTimeout(() => setDone(false), 1500)
      })
      .catch(() => toast(copy.copyFailed, 'error'))
  }
  const mark = done ? <Check size={15} strokeWidth={1.75} aria-hidden="true" /> : <Copy size={15} strokeWidth={1.75} aria-hidden="true" />
  if (icon)
    return (
      <button type="button" ref={btn} className="sl-icon" aria-label={label} title={done ? copy.copied : copy.copy} onClick={run}>
        {mark}
      </button>
    )
  return (
    <button type="button" ref={btn} className={primary ? 'btn primary' : 'btn'} onClick={run}>
      {mark}
      {done ? copy.copied : label}
    </button>
  )
}
