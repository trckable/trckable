// trckable tracker core (MIT). Compiled two ways:
//   - /js/t.js       the ~2 KB script tag (src/script.ts)
//   - trckable (npm) bundled into apps, so no script file can be blocked
//
// It sends raw signals only; the server derives everything else. Wire format
// (short keys): s site · k kind (pv|g|e) · u url · r referrer · w screen width
// l language · id event id · a age ms · pv pageview id · v visitor id
// n goal · p props · en engaged ms · sc scroll % · dev localhost allowed · c cookieless
// lcp ms · cls thousandths · inp ms (Core Web Vitals, with that module on)

// Build-time feature flags. esbuild replaces each with true/false per
// variant, so a feature a site turned off is not in its script at all.
declare const __GOALS__: boolean
declare const __OUTBOUND__: boolean
declare const __CHECKOUT__: boolean
declare const __VITALS__: boolean
declare const __CONSENT__: boolean
declare const __BANNER__: boolean
declare const __FORMS__: boolean

import { watchForms } from './forms'

export interface Config {
  site: string
  api: string // events endpoint, e.g. https://stats.example.com/api/e or /api/e
  cookieless?: boolean // no cookie, no storage (daily anonymous hash on the server)
  hash?: boolean // count #/routes as pages (hash-routed SPAs)
  dev?: boolean // allow localhost / iframes for development
  domain?: string // cookie domain, e.g. "example.com" to share across subdomains
  banner?: BannerText // wording for trckable's own cookie bar (banner module)
}

/** The four strings trckable's cookie bar shows. Every one has a default, so
 *  a site that is happy in English sets none of them. */
export interface BannerText {
  text?: string
  accept?: string
  decline?: string
  policy?: string // link to the site's privacy policy, shown beside the text
  /**
   * CSS added inside the bar's shadow root, so it can be branded without the
   * page's stylesheet reaching in. Set the custom properties (--tkb-bg,
   * --tkb-fg, --tkb-button, --tkb-button-fg, --tkb-round, --tkb-at,
   * --tkb-width, --tkb-font, --tkb-shadow) on :host, or write plain rules
   * for div, p, a, button and button.no.
   */
  css?: string
}

export type Props = Record<string, string | number | boolean>

export interface Tracker {
  (cmd: 'goal' | 'track', name: string, props?: Props): void
  (cmd: 'pageview'): void
  (cmd: 'consent', granted: boolean): void
}

type Payload = Record<string, unknown>

import { BAR_HTML, BAR_STYLE } from './bar'

const VID = 'trckable_vid'
const QUEUE = 'trckable_q'
const MAX_AGE = 18e5 // 30 min: queued events older than this are dropped
const DOWNLOAD = /\.(pdf|zip|dmg|exe|csv|xlsx?|docx?|mp[34])$/i

export function start(c: Config): Tracker {
  const w = window
  const d = document
  const loc = location
  const nav = navigator
  const now = Date.now

  // Consent-free mode touches no browser storage at all, not even to read.
  let ls: Storage | null = null
  if (!c.cookieless)
    try {
      ls = localStorage
    } catch {}
  if (
    !c.site ||
    ls?.getItem('trckable_ignore') ||
    // Automation is ignored, except in dev mode so you can test your own site
    // (Playwright, Cypress); the server only honours that on localhost. Local
    // hosts: localhost, 127.x, any IPv6 literal ([…]) and 0.x.
    (!c.dev && (nav.webdriver || /^(localhost|127\.|\[|0\.)/.test(loc.hostname) || loc.protocol == 'file:' || w != w.parent))
  )
    return (() => {}) as Tracker

  const proxied = new URL(c.api, loc as any).origin == loc.origin // server manages the cookie (a Location reads as its href)
  // 0: a cookie · 1: no cookie · 2: the visitor declined, and nothing is sent.
  let cookieless = c.cookieless ? 1 : 0
  let last = ''
  let pv = ''
  let visible = 0 // when the page last became visible (0 = hidden)
  let engaged = 0
  let scroll = 0
  let ref = d.referrer

  const rid = () => {
    const a = crypto.getRandomValues(new Uint32Array(2))
    return (a[0] * 2097152 + (a[1] >>> 11)).toString(36) // 53 random bits
  }

  const cookie = () => d.cookie.match(/(^|; )trckable_vid=([^;]+)/)?.[2]
  // Writes the visitor cookie; an empty value with no age deletes it.
  const put = (v: string, age: number) => {
    d.cookie =
      VID + '=' + v + '; Max-Age=' + age + '; Path=/; SameSite=Lax' + (c.domain ? '; Domain=' + c.domain : '') + (loc.protocol[4] == 's' ? '; Secure' : '') // https:
  }
  const shown = () => (d.hidden ? 0 : now())

  // Consent, read from the banner the site already runs. Until the visitor
  // answers, what the page sends is held in memory, not sent. Accept, and it
  // goes with the cookie; decline, and it is dropped: a visitor who declines
  // is not counted at all, with or without a cookie, from then on. Someone
  // who leaves the page without answering is counted without a cookie. A
  // banner's default ("denied" before anyone has clicked) is not an answer;
  // Do Not Track and Global Privacy Control are, and they mean no.
  //
  // Two standards are understood, because they are what banners actually
  // speak: Google Consent Mode v2 (the `dataLayer` a CMP or gtag writes to)
  // and IAB TCF v2.2 (`__tcfapi`). Anything else calls trckable('consent', …),
  // which costs no bytes at all.
  //
  // The dataLayer is read, never wrapped: Google Tag Manager replaces
  // dataLayer.push with its own when it loads, so a wrapper installed before
  // it would quietly disappear. Reading the array from where we left off
  // survives that, and survives loading in either order.
  // Declared without a body so that nothing at all is left in a script built
  // without this module.
  let consent!: () => void
  let grant!: (ok: any, final?: any) => void
  let held!: Payload[] | 0
  if (__CONSENT__ || __BANNER__) {
    cookieless = 1
    held = []
    // Sends what was held: with the cookie after an accept, without one when
    // the visitor leaves unanswered, and not at all after a decline.
    const release = () => {
      const h = held
      held = 0
      h && h.forEach((p) => send(p)) // not h.forEach(send): send is defined further down
    }
    grant = (ok, final) => {
      if (!ok && cookieless > 1) return // a refusal stands until an accept
      const was = cookieless
      cookieless = ok ? 0 : final ? 2 : 1
      // Withdrawn: the cookie has to go, not just stop being read, and so do
      // the queued page views. A cookie the server set (same-origin proxy) is
      // expired by the server with the next event, which now says cookieless.
      if (!was && cookieless) {
        put('', 0)
        ls?.removeItem(QUEUE)
      }
      if (ok || final) release()
    }
    if (nav.doNotTrack == '1' || (nav as any).globalPrivacyControl) grant(0, 1)
    // Leaving without an answer: count the page, without a cookie.
    w.addEventListener('pagehide', release)
    d.addEventListener('visibilitychange', () => d.hidden && release())

    if (__CONSENT__) {
      const dl: any[] = ((w as any).dataLayer ||= [])
      let at = 0
      let tcf = 0
      consent = () => {
        // Move past an entry before acting on it: an answer can release held
        // pages, whose sending reads the dataLayer again.
        while (at < dl.length) {
          const e = dl[at++]
          // 'default' is the banner before any click; only 'update' is an answer.
          if (e?.[0] == 'consent' && e[2]) grant(e[2].analytics_storage == 'granted', e[1] == 'update')
        }
        // The CMP's stub can appear after us; register as soon as it does.
        if (!tcf && (w as any).__tcfapi) {
          tcf = 1
          ;(w as any).__tcfapi('addEventListener', 2, (t: any, ok: boolean) => {
            // Purpose 1 is storing on the device, purpose 8 is measuring how
            // content is used. Outside the EU the framework says so itself.
            // 'cmpuishown' is the banner on screen, not yet answered.
            if (ok) grant(!t.gdprApplies || (t.purpose?.consents[1] && t.purpose.consents[8]), t.eventStatus != 'cmpuishown')
          })
        }
      }
      consent()
    }

    // trckable's own cookie bar, for sites with no banner of their own. It
    // asks about one cookie, because that is all trckable has — there is no
    // category list, no vendor list and nothing to configure. A site that
    // embeds video, ads or chat needs a real consent manager for those; this
    // bar never claims to cover them.
    //
    // It lives in a shadow root so the site's stylesheet cannot reshape it,
    // and the answer — yes or no — is the one thing kept in the browser
    // before consent, because a refusal that is forgotten on the next page is
    // not a refusal.
    if (__BANNER__) {
      const KEY = 'trckable_c'
      let said = null
      try {
        said = ls!.getItem(KEY)
      } catch {}
      // Someone whose browser already says "do not track" has answered.
      if (nav.doNotTrack == '1' || (nav as any).globalPrivacyControl) said = '0'
      if (said == '1') grant(1)
      else if (said == '0') grant(0, 1)
      else {
        const b = c.banner || {}
        const host = d.createElement('div')
        const root = host.attachShadow({ mode: 'open' })
        // The site's own CSS is appended last, as a text node rather than
        // markup, so it cannot end the <style> it lives in.
        root.innerHTML = '<style>' + BAR_STYLE + '</style>' + BAR_HTML
        if (b.css) root.firstChild!.appendChild(d.createTextNode(b.css))
        const say = root.querySelector('p')!
        const btn = root.querySelectorAll('button')
        say.textContent = b.text || 'We count visits with one cookie. Nothing else, and nothing shared.'
        // Refusing has to be as easy as agreeing, so both are one click and
        // the same size.
        btn[0].textContent = b.decline || 'Decline'
        btn[1].textContent = b.accept || 'Accept'
        if (b.policy) {
          const a = d.createElement('a')
          a.href = b.policy
          a.textContent = 'Privacy'
          say.append(' ', a)
        }
        const answer = (ok: number) => () => {
          try {
            ls!.setItem(KEY, '' + ok)
          } catch {}
          grant(ok, 1)
          host.remove()
        }
        btn[0].onclick = answer(0)
        btn[1].onclick = answer(1)
        const show = () => d.body.append(host)
        if (d.body) show()
        else d.addEventListener('DOMContentLoaded', show)
      }
    }
  }

  // Visitor id "<id>.<first-seen seconds>", both base36. When events go through
  // a same-origin proxy the server sets it (Safari keeps it 400 days); otherwise
  // the tracker does (Safari caps script-set cookies at 7 days).
  const vid = () => {
    let v = cookie()
    if (!v && !proxied) {
      v = rid() + '.' + (now() / 1e3 >>> 0).toString(36) // whole seconds; >>> keeps it right until 2106
      put(v, 34560000)
    }
    return v
  }

  const queue = (): [Payload, number][] => {
    try {
      return JSON.parse(ls!.getItem(QUEUE)!) || []
    } catch {
      return []
    }
  }
  const save = (q: [Payload, number][]) => {
    try {
      ls!.setItem(QUEUE, JSON.stringify(q.slice(-50)))
    } catch {}
  }

  const post = (p: Payload, age?: number) => {
    if (age) p.a = age
    fetch(c.api, { method: 'POST', body: JSON.stringify(p), keepalive: true })
      .then((r) => {
        // 5xx / 429: keep it queued for a retry; anything else is final.
        // Cookieless mode never touches storage, not even to clean up.
        if (!cookieless && r.status < 500 && r.status != 429) save(queue().filter((x) => x[0].id != p.id))
      })
      .catch(() => {})
  }

  // A payload is filled in once; one held back comes here again when it is
  // released, already filled in.
  const send = (p: Payload) => {
    if (__CONSENT__) consent()
    if (!p.id) {
      p.s = c.site
      p.u = loc.href
      p.w = screen.width
      p.l = nav.language
      p.id = rid()
      if (c.dev) p.dev = 1
      if ((__CONSENT__ || __BANNER__) && held) return held.push(p)
    }
    if (cookieless > 1) return // declined: nothing is sent
    if (cookieless) p.c = 1 // the server must not set a cookie either
    else {
      const v = vid()
      if (v) p.v = v
      // Write-ahead: queued before sending, removed once acknowledged. Anything
      // left (page closed mid-flight, offline, server restarting) is retried on
      // the next page; the server drops duplicates by event id.
      const q = queue()
      q.push([p, now()])
      save(q)
    }
    post(p)
  }

  // Core Web Vitals, measured by the browser itself. They ride along with the
  // engagement report, which is already sent when the page is hidden — the
  // moment the numbers are final — so this costs no extra request.
  // Everything lives in one object written by the observers and read by the
  // flush, so with the module off nothing here is referenced and the whole
  // block leaves the script (an unused 0 is dropped; an unused {} is not).
  const cwv: Payload = __VITALS__ ? {} : (0 as any)
  if (__VITALS__) {
    const watch = (type: string, cb: (e: any) => void) => {
      try {
        new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true })
      } catch {}
    }
    watch('largest-contentful-paint', (e) => (cwv.lcp = Math.round(e.startTime)))
    // Layout shift is scored in session windows, not as a running total: at
    // most 5 s long, ended by a 1 s gap. A plain sum would over-report a page
    // that shifts a little, often.
    let win = 0
    let first = 0
    let prev = 0
    watch('layout-shift', (e) => {
      if (e.hadRecentInput) return
      if (win && (e.startTime - first > 5e3 || e.startTime - prev > 1e3)) win = 0
      if (!win) first = e.startTime
      prev = e.startTime
      win += e.value
      // Thousandths, because CLS is a small decimal and the wire carries ints.
      if (win * 1e3 > (cwv.cls as number || 0)) cwv.cls = Math.round(win * 1e3)
    })
    // The slowest interaction. Real INP is a high percentile once there are
    // enough of them; on one page view the worst one is the honest answer.
    watch('event', (e) => {
      if (e.duration > (cwv.inp as number || 0)) cwv.inp = Math.round(e.duration)
    })
  }

  const flushEngagement = () => {
    if (visible) {
      engaged += now() - visible
      visible = shown()
    }
    if (pv && engaged > 0) send(__VITALS__ ? { k: 'e', pv, en: engaged, sc: scroll, ...cwv } : { k: 'e', pv, en: engaged, sc: scroll })
  }

  const page = () => {
    const url = c.hash ? loc.href : loc.href.split('#')[0]
    if (url == last) return // SPA frameworks often push/replace the same URL
    if (last) flushEngagement()
    last = url
    pv = rid()
    engaged = scroll = 0
    visible = shown()
    send({ k: 'pv', r: ref, pv })
    ref = '' // later SPA navigations are internal
    if (__GOALS__) observeScrollGoals()
  }

  const goal = (n: string, p?: Props) => send({ k: 'g', n, p })

  // Form submissions, as a goal (the forms module, src/forms.ts).
  if (__FORMS__) watchForms(goal)

  // Scroll goals: <section data-trckable-scroll="saw_pricing" data-trckable-threshold="0.5">
  const seen = new WeakSet<Element>()
  const observeScrollGoals = () => {
    if (!w.IntersectionObserver) return
    d.querySelectorAll<HTMLElement>('[data-trckable-scroll]').forEach((el) => {
      if (seen.has(el)) return
      seen.add(el)
      const io = new IntersectionObserver(
        (es) => {
          if (es[0].isIntersecting) {
            io.disconnect()
            goal(el.dataset.trckableScroll!)
          }
        },
        { threshold: +(el.dataset.trckableThreshold || 0.5) },
      )
      io.observe(el)
    })
  }

  // Clicks: goals, checkout links, outbound links and downloads. Each part
  // is compiled out when its module is off.
  if (__GOALS__ || __OUTBOUND__ || __CHECKOUT__)
    d.addEventListener(
      'click',
      (e) => {
        const t = e.target as Element
        if (__GOALS__) {
          const g = t.closest?.<HTMLElement>('[data-trckable-goal]')
          if (g) {
            const props: Props = {}
            const ds = g.dataset
            for (const k in ds)
              if (/^trckableGoal./.test(k))
                props[k.slice(12).replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()).slice(1)] = ds[k]!
            goal(ds.trckableGoal!, props)
          }
        }
        const a = t.closest?.<HTMLAnchorElement>('a[href]')
        if (a && /^https?:/.test(a.protocol)) {
          const h = a.host
          if (__CHECKOUT__) {
            // Hosted checkout links carry the visitor id, so sales are
            // attributed with no code (Stripe Payment Links, Lemon Squeezy,
            // Polar, Dodo).
            const v = !cookieless && cookie() // consent-free mode reads nothing
            const m = /(buy\.stripe|lemonsqueezy|polar|dodopayments)\.(com|sh)$/.exec(h)
            if (v && m) {
              const u = new URL(a as any) // an <a> reads as its href
              const k = { b: 'client_reference_id', p: 'reference_id', l: 'checkout[custom][trckable_vid]', d: 'metadata_trckable_vid' }[m[1][0]]!
              // One value for all: these fields allow only [A-Za-z0-9_-]
              if (!u.searchParams.has(k)) u.searchParams.set(k, 'trckable_' + v.replace('.', '_'))
              a.href = u.href
            }
          }
          if (__OUTBOUND__) {
            if (h != loc.host) goal('outbound_click', { url: h + a.pathname })
            else if (DOWNLOAD.test(a.pathname)) goal('file_download', { url: a.pathname })
          }
        }
      },
      true,
    )

  // Engagement: only visible time counts.
  d.addEventListener('visibilitychange', () => {
    if (shown()) visible = now()
    else flushEngagement()
  })
  w.addEventListener('pagehide', flushEngagement)
  w.addEventListener(
    'scroll',
    () => {
      const h = d.documentElement.scrollHeight - innerHeight
      const pct = h > 0 ? Math.min(100, Math.round((scrollY / h) * 100)) : 100
      if (pct > scroll) scroll = pct
    },
    { passive: true },
  )

  // SPA navigation.
  const h = history
  for (const m of ['pushState', 'replaceState'] as const) {
    const orig = h[m]
    h[m] = function (this: History, ...args: Parameters<History['pushState']>) {
      orig.apply(this, args)
      page()
    }
  }
  w.addEventListener('popstate', page)
  if (c.hash) w.addEventListener('hashchange', page)
  // Back/forward cache restores are real page views.
  w.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      last = ''
      page()
    }
  })

  // Retry what an earlier page could not deliver.
  if (!cookieless) {
    const q = queue().filter((x) => now() - x[1] < MAX_AGE)
    save(q)
    q.forEach((x) => post(x[0], now() - x[1]))
  }

  // Count the first view once the page is actually shown (not while prerendering).
  if ((d as any).prerendering) d.addEventListener('prerenderingchange', page, { once: true })
  else page()

  return ((cmd: string, a?: any, b?: Props) => {
    if (__GOALS__ && (cmd == 'goal' || cmd == 'track')) goal(a, b)
    else if (cmd == 'pageview') {
      last = ''
      page()
    } else if (cmd == 'consent') {
      // The site's own answer from its own banner: yes, or a final no.
      if (__CONSENT__ || __BANNER__) grant(a, 1)
      else {
        cookieless = a ? 0 : (put('', 0), 2) // no: the cookie goes, and so does counting
      }
    }
  }) as Tracker
}
