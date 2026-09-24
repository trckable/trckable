// `npx trckable doctor` — check an install from the outside, the way a
// visitor's browser sees it, and say plainly what is wrong.
//
// It never writes anything and never sends a fake visit: everything here is a
// read, so running it against production is safe.

export interface DoctorOptions {
  host: string
  site?: string
  /** The page to check, when you want the script verified on a real URL. */
  url?: string
}

export interface Check {
  ok: boolean
  name: string
  detail: string
  fix?: string
}

const timeout = (ms: number) => {
  const c = new AbortController()
  setTimeout(() => c.abort(), ms)
  return c.signal
}

/** Run every check and return them in the order they were made. */
export async function doctor(o: DoctorOptions): Promise<Check[]> {
  const out: Check[] = []
  const host = o.host.replace(/\/$/, '')

  // 1. Is the server there at all?
  try {
    const res = await fetch(host + '/healthz', { signal: timeout(5000) })
    const version = res.headers.get('x-trckable-version')
    out.push({
      ok: res.ok,
      name: 'Server',
      detail: res.ok ? `${host} answers${version ? ` (${version})` : ''}` : `${host} answered ${res.status}`,
      fix: res.ok ? undefined : 'Check TRCKABLE_HOST and that the container is running.',
    })
    if (!res.ok) return out
  } catch (e) {
    out.push({ ok: false, name: 'Server', detail: `${host} is not reachable`, fix: 'Check the URL, DNS and that the service is up.' })
    return out
  }

  // 2. Is it served over https? A cookie without Secure is dropped by Safari.
  out.push({
    ok: host.startsWith('https://'),
    name: 'HTTPS',
    detail: host.startsWith('https://') ? 'events travel over https' : 'this host is plain http',
    fix: host.startsWith('https://') ? undefined : 'Serve trckable over https, or visitor cookies will be dropped.',
  })

  // 3. Does the site's own script exist, and how big is it?
  if (o.site) {
    try {
      const res = await fetch(`${host}/js/${o.site}.js`, { signal: timeout(5000) })
      const body = await res.text()
      const cookieless = body.includes('dataset.cookieless')
      out.push({
        ok: res.ok && body.length > 0,
        name: 'Script',
        detail: res.ok ? `${(body.length / 1024).toFixed(1)} KB${cookieless ? ' · consent-free (stores nothing)' : ''}` : `/js/${o.site}.js answered ${res.status}`,
        fix: res.ok ? undefined : 'Check the site id in your snippet (Settings → Install).',
      })
    } catch {
      out.push({ ok: false, name: 'Script', detail: 'the script could not be fetched', fix: 'Check the site id and that the host is public.' })
    }
  }

  // 4. Will a browser be allowed to post events?
  try {
    const res = await fetch(host + '/api/e', { method: 'OPTIONS', signal: timeout(5000) })
    const allow = res.headers.get('access-control-allow-origin')
    out.push({
      ok: allow === '*',
      name: 'Ingest',
      detail: allow === '*' ? 'browsers may post events' : `preflight answered ${res.status}`,
      fix: allow === '*' ? undefined : 'Something between the browser and trckable is stripping CORS headers.',
    })
  } catch {
    out.push({ ok: false, name: 'Ingest', detail: '/api/e did not answer a preflight', fix: 'Check the proxy in front of trckable.' })
  }

  // 5. Does trckable see a real client address? Without it, no geography.
  try {
    const res = await fetch(host + '/_trckable/whoami', { signal: timeout(5000) })
    const who = (await res.json()) as { ip?: string; forwarded?: boolean; trust?: string }
    const ok = !!who.ip && who.ip !== '0.0.0.0'
    out.push({
      ok,
      name: 'Visitor address',
      detail: ok ? `trckable sees ${who.ip}${who.forwarded ? ' (forwarded)' : ''} — it is used for country, then dropped` : 'trckable cannot tell where requests come from',
      fix: ok ? undefined : 'Set TRCKABLE_TRUST_PROXY to your platform, so the client address header is honoured.',
    })
  } catch {
    /* an older server may not have the endpoint; not worth failing over */
  }

  // 6. If a page was given, is the snippet actually on it?
  if (o.url) {
    try {
      const res = await fetch(o.url, { signal: timeout(8000) })
      const html = await res.text()
      // The snippet can be the site's own script, this host's /js/ path, or
      // the bundled package — any of the three means it is installed.
      const exact = !!o.site && html.includes(`/js/${o.site}.js`)
      const onHost = html.includes(host + '/js/')
      const bundled = /trckable/i.test(html)
      const onPage = exact || onHost || bundled
      out.push({
        ok: onPage,
        name: 'Snippet',
        detail: onPage ? `found on ${o.url}${o.site && !exact ? ' (a different site id)' : ''}` : `no trckable script on ${o.url}`,
        fix: onPage ? undefined : 'Paste the snippet from Settings → Install into the <head> of every page.',
      })
    } catch {
      out.push({ ok: false, name: 'Snippet', detail: `${o.url} could not be fetched` })
    }
  }
  return out
}

/** Render the checks the way the CLI prints them. */
export function format(checks: Check[]): string {
  const lines = checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.name.padEnd(17)} ${c.detail}${c.fix ? `\n    → ${c.fix}` : ''}`)
  const bad = checks.filter((c) => !c.ok).length
  lines.push('', bad === 0 ? 'Everything looks right.' : `${bad} thing${bad > 1 ? 's' : ''} to fix.`)
  return lines.join('\n')
}
