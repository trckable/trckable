// The copy-paste setups that report robots to /api/crawl without a server
// proxy: a Cloudflare Worker, Vercel middleware, nginx (its mirror, or its
// log), Caddy (its log). Each sends the same four fields: the site, the
// address, the robot's user agent and, where it is known, the status. Never a
// visitor's address, cookie or id. Pure, and the words in them are not
// translated: snippets.test.ts checks them against the server's list.

/** The user-agent tokens of the robots that answer for someone or collect training data: the server's list (ingest/crawlers.go), in the server's order. */
export const AI_BOTS = [
  'chatgpt-user', 'oai-searchbot', 'claude-user', 'claude-searchbot', 'perplexity-user', 'perplexitybot',
  'google-cloudvertexbot', 'bingbot-chat', 'duckassistbot', 'mistralai-user',
  'gptbot', 'claudebot', 'anthropic-ai', 'google-extended', 'meta-externalagent', 'facebookbot', 'bytespider',
  'ccbot', 'diffbot', 'omgili', 'timpibot', 'cohere-ai', 'cohere-training-data-crawler', 'mistralai-crawler', 'applebot-extended',
] as const

export type Setup = 'cloudflare' | 'vercel' | 'nginx' | 'caddy' | 'other'

export interface Snippet {
  /** Which of the setup's snippets: the sheet words each one. */
  id: 'worker' | 'middleware' | 'mirror' | 'log' | 'caddy' | 'curl'
  lang: string
  code: string
}

export interface Plan {
  /** The address of this server and the site's id and key. */
  host: string
  site: string
  key: string
  domain: string
}

const pipe = (sep = '|') => AI_BOTS.join(sep)

const worker = ({ host, site, domain }: Plan) => `// Cloudflare Worker, on the route ${domain}/*
// Settings → Variables and secrets: add the secret TRCKABLE_PROXY_KEY.
const BOTS = /${pipe()}/i

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request)
    const ua = request.headers.get('user-agent') || ''
    if (BOTS.test(ua)) {
      // After the page has gone: waitUntil never slows a visitor or a robot.
      ctx.waitUntil(
        fetch('${host}/api/crawl', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-trckable-proxy-key': env.TRCKABLE_PROXY_KEY },
          body: JSON.stringify({ s: '${site}', u: request.url, ua, st: response.status }),
        }).catch(() => {}),
      )
    }
    return response
  },
}`

const vercel = ({ host, site }: Plan) => `// middleware.ts, next to package.json (Next.js)
// Project → Settings → Environment Variables: add TRCKABLE_PROXY_KEY.
// Other frameworks: the same body inside Vercel's middleware, with waitUntil from '@vercel/functions'.
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'

const BOTS = /${pipe()}/i

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const ua = request.headers.get('user-agent') || ''
  if (BOTS.test(ua)) {
    event.waitUntil(
      fetch('${host}/api/crawl', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-trckable-proxy-key': process.env.TRCKABLE_PROXY_KEY! },
        body: JSON.stringify({ s: '${site}', u: request.url, ua }),
      }).catch(() => {}),
    )
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }`

/** The map hands the matched token over, never the whole user agent: a quote in it cannot break the body. */
const nginxMap = () => String.raw`# http { }: the robot's token, or nothing. An address with a quote or a backslash in it is skipped.
map $http_user_agent $trk_bot { default ""; ~*(?<t>${pipe()}) $t; }
map "$host$request_uri" $trk_url { default "$host$request_uri"; ~[\x22\x5c] ""; }`

const nginxMirror = ({ host, site, key }: Plan) => `${nginxMap()}

# server { }
location / {
    mirror /_trckable;
    mirror_request_body off;
    # ... your usual proxy_pass, root or try_files
}
location = /_trckable {
    internal;
    if ($trk_bot = "") { return 204; }
    if ($trk_url = "") { return 204; }
    proxy_pass ${host}/api/crawl;
    proxy_ssl_server_name on;
    proxy_method POST;
    proxy_set_header Content-Type application/json;
    proxy_set_header X-Trckable-Proxy-Key ${key};
    proxy_set_body '{"s":"${site}","u":"https://$trk_url","ua":"$trk_bot"}';
}`

const forward = (host: string, key: string, filter: string) => `#!/bin/sh
# Reads the log as it grows and reports each robot. Needs jq and curl; run it as a service.
tail -Fn0 "$1" | jq -c --unbuffered '${filter}' | while read -r body; do
  curl -s -o /dev/null -X POST ${host}/api/crawl \\
    -H 'content-type: application/json' -H 'X-Trckable-Proxy-Key: ${key}' -d "$body"
done`

const nginxLog = ({ host, site, key }: Plan) => `${nginxMap()}

# http { }: one line per robot, and nothing for anyone else.
log_format trckable escape=json '{"host":"$host","uri":"$request_uri","ua":"$http_user_agent","status":$status}';
access_log /var/log/nginx/trckable.log trckable if=$trk_bot;

# trckable-forward.sh /var/log/nginx/trckable.log
${forward(host, key, `{s:"${site}",u:("https://"+.host+.uri),ua:.ua,st:.status}`)}`

const caddy = ({ host, site, key }: Plan) => `# Caddyfile, inside your site block
log {
    output file /var/log/caddy/access.log
    format json
}

# trckable-forward.sh /var/log/caddy/access.log
${forward(host, key, `select((.request.headers["User-Agent"][0] // "") | test("${pipe()}"; "i")) | {s:"${site}",u:("https://"+.request.host+.request.uri),ua:.request.headers["User-Agent"][0],st:.status}`)}`

const other = ({ host, site, key, domain }: Plan) => `# any language: one POST per robot request, after the page has gone
curl -X POST ${host}/api/crawl \\
  -H 'content-type: application/json' \\
  -H 'X-Trckable-Proxy-Key: ${key}' \\
  -d '{"s":"${site}","u":"https://${domain}/page","ua":"<user agent>","st":200}'`

/** What to paste for a setup, with this site's id, key and server address in it. */
export function snippetsFor(setup: Setup, plan: Plan): Snippet[] {
  switch (setup) {
    case 'cloudflare':
      return [{ id: 'worker', lang: 'js', code: worker(plan) }]
    case 'vercel':
      return [{ id: 'middleware', lang: 'ts', code: vercel(plan) }]
    case 'nginx':
      return [
        { id: 'mirror', lang: 'nginx', code: nginxMirror(plan) },
        { id: 'log', lang: 'nginx', code: nginxLog(plan) },
      ]
    case 'caddy':
      return [{ id: 'caddy', lang: 'shell', code: caddy(plan) }]
    case 'other':
      return [{ id: 'curl', lang: 'shell', code: other(plan) }]
  }
}
