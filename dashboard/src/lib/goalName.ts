// A goal as people read it: its own label when it has one, else a name made from the event's: the two the script sends
// by itself in words, any other in sentence case ("signup_done" is "Signup done"). Pure: goalName.test.ts.
import { defineCopy } from '../i18n'

const copy = defineCopy('goalname', {
  outbound: 'Outbound clicks',
  form: 'Form submissions',
})

const KNOWN: Record<string, () => string> = { outbound_click: () => copy.outbound, form_submit: () => copy.form }

export function goalName(label: string | undefined, value: string): string {
  if (label) return label
  const known = KNOWN[value]
  if (known) return known()
  const words = value.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
