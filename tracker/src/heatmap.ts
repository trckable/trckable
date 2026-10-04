// The heatmaps module: where people click on a page, where a click does
// nothing, and which form field they left a form at. A script of its own, sent
// after the base script only for a site that turned the module on, so the base
// script never carries a byte of it.
//
// It reports aggregates' raw material and nothing about a person: no visitor
// id, no cookie, no storage, no typed text. A click is an element (a short
// selector made of tag names, ids and class names) and where in that element
// it landed, in tenths of its width and height. A form field is its name. A
// batch goes out when the page is hidden, or once 20 are waiting.
//
// Wire format: {s site, u url, w window width, h page height, dev, i items}.
// An item is ['v'] (a page counted), ['c'|'d'|'r', selector, cx, cy, x, y, w, h]
// (a click, a dead click, a rage click: x and w in thousandths of the window,
// y and h in pixels from the top of the page) or ['fr'|'fd', "form>field"]
// (a field reached, a form left at that field).

export interface Heat {
  site: string
  api: string // the heat endpoint, e.g. https://stats.example.com/api/h
  sample: number // the share of page views that report, 0–1
  dev?: boolean
  hash?: boolean // routes are #/… (the base script's data-hash): a page is its path and its hash
}

const STABLE = /^[a-z][a-z-]{1,22}$/i // a name made of letters: not a build hash, not a counter
const NAME = /^(?!.*\d{3})[\w.[\]-]{1,40}$/ // a run of digits is a counter or an id, not a field's name
const MAX = 60 // items per page view

export function heat(c: Heat) {
  const w: any = window
  const d = document
  const nav = navigator
  const loc = location
  // The base script answers for who is counted: it sets this only when it runs.
  if (!w.__trk || nav.doNotTrack == '1' || (nav as any).globalPrivacyControl || !c.api.endsWith('/h')) return

  let q: any[][] = []
  let path = ''
  let url = ''
  let on = false
  let n = 0
  let hits: [number, string][] = []
  const fields: Record<string, string> = {} // form → the field last reached, until it is sent
  const reached = new Set<string>()

  const here = () => loc.pathname + (c.hash ? loc.hash : '')
  const flush = () => {
    if (q.length)
      fetch(c.api, {
        method: 'POST',
        body: JSON.stringify({ s: c.site, u: url, w: innerWidth, h: d.documentElement.scrollHeight, dev: c.dev ? 1 : 0, i: q }),
        keepalive: true,
      }).catch(() => {})
    q = []
  }
  // A form that was started and not sent is left at the last field reached.
  const leave = () => {
    for (const f in fields) {
      on && q.push(['fd', f + '>' + fields[f]])
      delete fields[f]
    }
    flush()
  }
  // Notices a new page (a route change in a single-page app): what was gathered
  // belongs to the last one, and the new one is sampled on its own.
  const page = () => {
    if (path == here()) return
    if (path) leave()
    path = here()
    url = loc.href
    n = 0
    reached.clear()
    on = Math.random() < c.sample
    if (on) q.push(['v'])
  }
  const add = (i: any[]) => {
    page()
    if (on && n++ < MAX) q.push(i)
    if (q.length > 19) flush()
  }

  // A short, stable name for an element: up to four levels of tag, class or id, and
  // its place among same-named siblings when nothing else tells them apart.
  const pick = (e: Element) => {
    let s = ''
    for (let i = 0; e && e != d.body && e != d.documentElement && i < 4; i++, e = e.parentElement!) {
      const tag = e.localName
      let p = tag.replace(/[^\w-]/g, '') || 'x' // a custom element's name can be anything
      if (e.id && STABLE.test(e.id)) {
        s = p + '#' + e.id + (s && '>' + s)
        break
      }
      const k = [...e.classList].find((x) => STABLE.test(x))
      if (k) p += '.' + k
      else {
        const same = [...(e.parentElement?.children || [])].filter((x) => x.localName == tag)
        if (same.length > 1) p += ':' + (same.indexOf(e) + 1)
      }
      s = p + (s && '>' + s)
    }
    return s.slice(0, 80) || 'body'
  }

  const where = (kind: string, t: Element, x: number, y: number): any[] => {
    const r = t.getBoundingClientRect()
    const cell = (v: number, size: number) => Math.min(9, Math.max(0, ((v / (size || 1)) * 10) | 0))
    const ww = innerWidth || 1
    // Inside what the server takes: nothing negative, nothing wider than five windows.
    const lim = (v: number, m: number) => Math.min(m, Math.max(0, Math.round(v)))
    return [kind, pick(t), cell(x - r.left, r.width), cell(y - r.top, r.height), lim(((r.left + scrollX) / ww) * 1e3, 5e3), lim(r.top + scrollY, 2e5), lim((r.width / ww) * 1e3, 5e3), lim(r.height, 2e5)]
  }

  d.addEventListener(
    'click',
    (e) => {
      const t = e.target as Element
      if (!t?.closest) return
      const at = where('c', t, e.clientX, e.clientY)
      add(at)
      const now = Date.now()
      hits = hits.filter((h) => now - h[0] < 1e3 && h[1] == at[1])
      hits.push([now, at[1]])
      if (hits.length == 3) add(['r', ...at.slice(1)]) // three on one element within a second
      // Looks like it should do something, and nothing on the page changes.
      // Links and form controls act on their own, so they are never dead.
      if (!t.closest('a[href],label,input,select,textarea,summary,[type=submit]') && (t.closest('button,[role=button]') || getComputedStyle(t).cursor == 'pointer')) {
        let moved = 0
        const o = new MutationObserver(() => (moved = 1))
        o.observe(d, { subtree: true, childList: true, attributes: true, characterData: true })
        const before = loc.href
        setTimeout(() => {
          o.disconnect()
          if (!moved && before == loc.href) add(['d', ...at.slice(1)])
        }, 600)
      }
    },
    true,
  )

  // A form is its id or name when that is a plain word, else just "form"; a field is its
  // name, with the numbers of a list (items[3][name]) taken out, and none with a counter in it.
  const formKey = (f: HTMLFormElement) => [f.id, f.getAttribute('name') || ''].find((x) => STABLE.test(x)) || 'form'
  const fieldName = (f: HTMLInputElement) => {
    const n = (f.name || '').replace(/\[\d+\]/g, '[]')
    return NAME.test(n) ? n : ''
  }

  // Form fields, by name only. A password field is not even named.
  d.addEventListener(
    'focusin',
    (e) => {
      const f = e.target as HTMLInputElement
      const form = f.form
      const name = form && f.type != 'password' && fieldName(f)
      if (!form || !name) return
      const key = formKey(form)
      const id = key + '>' + name
      page()
      if (on && !reached.has(id)) {
        reached.add(id)
        add(['fr', id])
      }
      fields[key] = name
    },
    true,
  )
  d.addEventListener(
    'submit',
    (e) => {
      delete fields[formKey(e.target as HTMLFormElement)]
    },
    true,
  )

  d.addEventListener('visibilitychange', () => d.hidden && flush())
  w.addEventListener('pagehide', leave) // a tab that is only hidden has not left its form
  page() // the first page counts as soon as it is here
}
