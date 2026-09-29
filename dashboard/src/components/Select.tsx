// A native select in the product's control style: border, chevron, the height
// and radius of the buttons beside it. The ring is for the keyboard only
// (Select.css); the list itself stays the browser's, so it works everywhere.
import { ChevronDown } from 'lucide-react'
import type { ReactNode, SelectHTMLAttributes, SyntheticEvent } from 'react'
import './Select.css'

// Browsers count a click on a select as keyboard-style focus, so the box
// remembers the mouse itself (data-mouse) until the next key or blur.
const mouse = (e: SyntheticEvent<HTMLElement>, on: boolean) => e.currentTarget.closest('label')?.toggleAttribute('data-mouse', on)

export function Select({ mark, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { mark?: ReactNode }) {
  return (
    <label className={className ? 'select ' + className : 'select'}>
      {mark}
      <select {...rest} onMouseDown={(e) => mouse(e, true)} onKeyDown={(e) => mouse(e, false)} onBlur={(e) => mouse(e, false)}>{children}</select>
      <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
    </label>
  )
}
