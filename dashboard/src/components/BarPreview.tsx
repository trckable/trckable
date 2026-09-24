// A preview of the cookie bar that is the cookie bar: the same markup and the
// same stylesheet the tracker ships, in a shadow root of its own, so what the
// owner sees here is what a visitor gets — custom CSS included.
import { useEffect, useRef } from 'react'
import { BAR_HTML, BAR_STYLE } from '@trckable/tracker/bar'

export function BarPreview({ text, accept, decline, policy, css }: { text: string; accept: string; decline: string; policy?: string; css?: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' })
    root.innerHTML = '<style>' + BAR_STYLE + '</style>' + BAR_HTML
    if (css) root.firstChild!.appendChild(document.createTextNode(css))
    const bar = root.querySelector('div')!
    // Fixed inside the page would cover the dashboard; the preview keeps the
    // bar's own size and shape and sits in its card.
    bar.style.position = 'static'
    bar.style.boxShadow = 'none'
    const p = root.querySelector('p')!
    p.textContent = text
    if (policy) {
      const a = document.createElement('a')
      a.textContent = 'Privacy'
      a.href = policy
      a.onclick = (e) => e.preventDefault()
      p.append(' ', a)
    }
    const btn = root.querySelectorAll('button')
    btn[0].textContent = decline
    btn[1].textContent = accept
    for (const b of btn) b.tabIndex = -1
  }, [text, accept, decline, policy, css])

  return <div ref={host} className="bar-real" aria-hidden="true" />
}
