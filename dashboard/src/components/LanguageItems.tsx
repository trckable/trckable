// The avatar menu's language: one row that names the language, and the list it
// opens in the same menu (Auto follows the browser). Part of AccountItems's chunk.
import { useEffect, useRef } from 'react'
import { Check, ChevronLeft, ChevronRight, Languages } from 'lucide-react'
import { chooseLang, chosen } from '../i18n/choose'
import { LANGUAGES } from '../i18n/languages'
import type { MenuItems } from '../lib/headerMenu'
import { copy } from './itemsCopy'

/** What is chosen, in words: the language in its own name, or Auto. */
const nameOf = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? copy.languageAuto

/** The row in the menu: the language now, and a way into the list. */
export function LanguageRow({ onOpen, back }: { onOpen: () => void; back: boolean }) {
  const row = useRef<HTMLButtonElement>(null)
  // Coming back from the list, focus is on the row it opened from.
  useEffect(() => {
    if (back) row.current?.focus()
  }, [back])
  return (
    <button type="button" role="menuitem" aria-haspopup="true" ref={row} onClick={onOpen}>
      <Languages size={18} strokeWidth={1.75} aria-hidden="true" />
      {copy.language}
      <span className="menu-value">{nameOf(chosen())}</span>
      <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

/** The list: Auto, then each language by its own name. Choosing starts the page again in it. */
export function LanguageList({ go, onBack }: { go: Parameters<MenuItems>[0]; onBack: () => void }) {
  const now = chosen()
  const current = useRef<HTMLButtonElement>(null)
  // The list opens onto what is chosen, so the arrows start from there.
  useEffect(() => current.current?.focus(), [])
  const options = [{ code: 'auto', name: copy.languageAuto }, ...LANGUAGES]
  return (
    <>
      <button type="button" role="menuitem" onClick={onBack}>
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        {copy.language}
      </button>
      {options.map((o) => (
        <button key={o.code} type="button" role="menuitemradio" lang={o.code === 'auto' ? undefined : o.code} aria-checked={now === o.code} ref={now === o.code ? current : undefined} onClick={go(() => chooseLang(o.code))}>
          <span className="menu-check" aria-hidden="true">{now === o.code && <Check size={16} strokeWidth={2} />}</span>
          {o.name}
        </button>
      ))}
    </>
  )
}
