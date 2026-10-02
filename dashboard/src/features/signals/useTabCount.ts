// The browser tab's title and icon say who is online: "● 8 · trckable" and a
// small green dot on the icon. Both go back when nobody is on, when it is
// turned off in Account, and when the dashboard is left. A still dot and a
// plain title: nothing moves, so there is nothing for reduced motion to stop.
import { useEffect, useRef } from 'react'
import { usePref } from './prefs'
import { baseTitle, dotted, tabTitle } from './tabTitle'

const iconLink = () => document.querySelector<HTMLLinkElement>('link[rel~="icon"]')

let dotHref: Promise<string | null> | undefined
/** The icon with its dot, made once from the icon file itself. */
function withDot(link: HTMLLinkElement): Promise<string | null> {
  dotHref ??= fetch(link.href)
    .then((r) => (r.ok ? r.text() : ''))
    .then((svg) => (svg.includes('</svg>') ? 'data:image/svg+xml,' + encodeURIComponent(dotted(svg)) : null))
    .catch(() => null)
  return dotHref
}

export function useTabCount(online: number | null) {
  const [on] = usePref('tab')
  const base = useRef(baseTitle(document.title))
  const plain = useRef(iconLink()?.href ?? '')
  const live = on && !!online && online >= 1
  useEffect(() => {
    document.title = tabTitle(base.current, online, on)
  }, [online, on])
  useEffect(() => {
    const link = iconLink()
    if (!link) return
    let current = true
    if (live) {
      void withDot(link).then((href) => {
        if (current && href) link.href = href
      })
    } else if (plain.current) link.href = plain.current
    return () => {
      current = false
    }
  }, [live])
  // Leaving the dashboard leaves the page as it came.
  useEffect(() => {
    const title = base.current
    const icon = plain.current
    return () => {
      document.title = title
      const link = iconLink()
      if (link && icon) link.href = icon
    }
  }, [])
}
