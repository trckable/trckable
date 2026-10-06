---
title: "AI & Search"
description: "How Google and AI assistants find your site: one tab, three columns, and robot data from Cloudflare, Vercel, Nginx or Caddy without a server proxy."
---

One tab in **Who came**, called **AI & Search**, answers one question: how do
Google and the AI assistants find me? It replaces the separate AI and Search
tabs that Sources used to have. It is in Full, and in Compact once Search
Console is on. A share link never shows it.

## The three columns

- **Google.** The searches that showed your site and how many were clicked, from
  your own Search Console ([connect it in Settings → Search Console](/reports/search-console)).
  Without it the column is one Connect button.
- **AI assistants.** Visitors who came from ChatGPT, Claude, Perplexity, Gemini,
  Copilot and the others, with their counts. This needs nothing extra: it is the
  AI channel your reports already have.
- **AI crawlers.** Which robots read your pages (the ones that answer for someone
  right now, and the ones that collect training data), with their hit counts, and
  under them the pages they read most.

On a narrow card the three are stacked, one above the other. A click on a row
filters the whole dashboard, like any other list: an assistant filters by its
referrer, a page by that page. Pick a page and the crawler hits shrink to that page
too; the other filters have no meaning for a robot, so they leave its counts alone.

## Read, and sent

Each page in the crawler column shows two numbers: how often AI crawlers read it,
and how many visitors AI assistants sent to it as their first page. "AI read this
400 times, sent 12 visitors."

Two small badges point at what is worth a look:

- **No credit.** AI crawlers read the page at least 10 times and sent nobody. It
  may be used in answers without a link back.
- **Not read.** Google sent the page at least 5 clicks and no AI crawler read it in
  this period. This one needs Search Console, and it is only said once robots are
  being reported at all: a site with no crawler data would otherwise look ignored
  everywhere.

## Crawler data without a server proxy

Robots do not run JavaScript, so the browser script never sees them. Your server or
CDN reports them instead: one POST to `/api/crawl` for each robot request, with
four fields.

```json
{"s":"<site id>","u":"https://example.com/page","ua":"<the robot's user agent>","st":200}
```

Only the robot's name, the page and the day are kept. No address, no cookie, no
visitor, and a user agent trckable does not recognise as a robot is thrown away.
The request carries your site's key in the `X-Trckable-Proxy-Key` header, the same
key a proxy uses (Settings → Install). Keep it out of the page's code.

In the dashboard, the empty crawler column has **Connect crawler data**: three
steps (where your site runs, copy this, turn it on), with your site's id, key and
address already in the code, and a line that says when the first robot arrives. The
same setups, for copying here:

### Cloudflare

A Worker on your domain's route. It passes every request on first and tells
trckable afterwards with `waitUntil`, so a visitor or a robot never waits for it.
Add the key as the secret `TRCKABLE_PROXY_KEY`.

```js
// Cloudflare Worker, on the route example.com/*
// Settings → Variables and secrets: add the secret TRCKABLE_PROXY_KEY.
const BOTS = /chatgpt-user|oai-searchbot|claude-user|claude-searchbot|perplexity-user|perplexitybot|google-cloudvertexbot|bingbot-chat|duckassistbot|mistralai-user|gptbot|claudebot|anthropic-ai|google-extended|meta-externalagent|facebookbot|bytespider|ccbot|diffbot|omgili|timpibot|cohere-ai|cohere-training-data-crawler|mistralai-crawler|applebot-extended/i

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request)
    const ua = request.headers.get('user-agent') || ''
    if (BOTS.test(ua)) {
      // After the page has gone: waitUntil never slows a visitor or a robot.
      ctx.waitUntil(
        fetch('https://stats.example.com/api/crawl', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-trckable-proxy-key': env.TRCKABLE_PROXY_KEY },
          body: JSON.stringify({ s: 'tkb_yoursiteid', u: request.url, ua, st: response.status }),
        }).catch(() => {}),
      )
    }
    return response
  },
}
```

Logpush is not needed. It writes log files in Cloudflare's own shape to a
destination, and `/api/crawl` reads only the four fields above, so the Worker is the
way: it reports the same requests as they happen, with their status.

### Vercel

Middleware, which reports through `waitUntil` after the response has gone. It runs
before the answer, so it cannot send the status. Add `TRCKABLE_PROXY_KEY` under
Environment Variables.

```ts
// middleware.ts, next to package.json (Next.js)
// Project → Settings → Environment Variables: add TRCKABLE_PROXY_KEY.
// Other frameworks: the same body inside Vercel's middleware, with waitUntil from '@vercel/functions'.
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'

const BOTS = /chatgpt-user|oai-searchbot|claude-user|claude-searchbot|perplexity-user|perplexitybot|google-cloudvertexbot|bingbot-chat|duckassistbot|mistralai-user|gptbot|claudebot|anthropic-ai|google-extended|meta-externalagent|facebookbot|bytespider|ccbot|diffbot|omgili|timpibot|cohere-ai|cohere-training-data-crawler|mistralai-crawler|applebot-extended/i

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const ua = request.headers.get('user-agent') || ''
  if (BOTS.test(ua)) {
    event.waitUntil(
      fetch('https://stats.example.com/api/crawl', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-trckable-proxy-key': process.env.TRCKABLE_PROXY_KEY! },
        body: JSON.stringify({ s: 'tkb_yoursiteid', u: request.url, ua }),
      }).catch(() => {}),
    )
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
```

### Nginx

Two ways, and either needs only a few lines of nginx.

**The mirror** has no extra process. nginx copies each robot request to an internal
location that posts it to trckable. It cannot see the status, because the copy is
made before the answer is.

```nginx
# http { }: the robot's token, or nothing. An address with a quote or a backslash in it is skipped.
map $http_user_agent $trk_bot { default ""; ~*(?<t>chatgpt-user|oai-searchbot|claude-user|claude-searchbot|perplexity-user|perplexitybot|google-cloudvertexbot|bingbot-chat|duckassistbot|mistralai-user|gptbot|claudebot|anthropic-ai|google-extended|meta-externalagent|facebookbot|bytespider|ccbot|diffbot|omgili|timpibot|cohere-ai|cohere-training-data-crawler|mistralai-crawler|applebot-extended) $t; }
map "$host$request_uri" $trk_url { default "$host$request_uri"; ~[\x22\x5c] ""; }

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
    proxy_pass https://stats.example.com/api/crawl;
    proxy_ssl_server_name on;
    proxy_method POST;
    proxy_set_header Content-Type application/json;
    proxy_set_header X-Trckable-Proxy-Key tkb_px_yourkey;
    proxy_set_body '{"s":"tkb_yoursiteid","u":"https://$trk_url","ua":"$trk_bot"}';
}
```

**The log** reports the status too. nginx writes one JSON line per robot, and a
small script (jq and curl) reads the log as it grows and posts each line.

```nginx
# http { }: the robot's token, or nothing. An address with a quote or a backslash in it is skipped.
map $http_user_agent $trk_bot { default ""; ~*(?<t>chatgpt-user|oai-searchbot|claude-user|claude-searchbot|perplexity-user|perplexitybot|google-cloudvertexbot|bingbot-chat|duckassistbot|mistralai-user|gptbot|claudebot|anthropic-ai|google-extended|meta-externalagent|facebookbot|bytespider|ccbot|diffbot|omgili|timpibot|cohere-ai|cohere-training-data-crawler|mistralai-crawler|applebot-extended) $t; }
map "$host$request_uri" $trk_url { default "$host$request_uri"; ~[\x22\x5c] ""; }

# http { }: one line per robot, and nothing for anyone else.
log_format trckable escape=json '{"host":"$host","uri":"$request_uri","ua":"$http_user_agent","status":$status}';
access_log /var/log/nginx/trckable.log trckable if=$trk_bot;

# trckable-forward.sh /var/log/nginx/trckable.log
#!/bin/sh
# Reads the log as it grows and reports each robot. Needs jq and curl; run it as a service.
tail -Fn0 "$1" | jq -c --unbuffered '{s:"tkb_yoursiteid",u:("https://"+.host+.uri),ua:.ua,st:.status}' | while read -r body; do
  curl -s -o /dev/null -X POST https://stats.example.com/api/crawl \
    -H 'content-type: application/json' -H 'X-Trckable-Proxy-Key: tkb_px_yourkey' -d "$body"
done
```

### Caddy

Caddy writes JSON logs already. The same small script reads the log, keeps the AI
robots and posts them.

```shell
# Caddyfile, inside your site block
log {
    output file /var/log/caddy/access.log
    format json
}

# trckable-forward.sh /var/log/caddy/access.log
#!/bin/sh
# Reads the log as it grows and reports each robot. Needs jq and curl; run it as a service.
tail -Fn0 "$1" | jq -c --unbuffered 'select((.request.headers["User-Agent"][0] // "") | test("chatgpt-user|oai-searchbot|claude-user|claude-searchbot|perplexity-user|perplexitybot|google-cloudvertexbot|bingbot-chat|duckassistbot|mistralai-user|gptbot|claudebot|anthropic-ai|google-extended|meta-externalagent|facebookbot|bytespider|ccbot|diffbot|omgili|timpibot|cohere-ai|cohere-training-data-crawler|mistralai-crawler|applebot-extended"; "i")) | {s:"tkb_yoursiteid",u:("https://"+.request.host+.request.uri),ua:.request.headers["User-Agent"][0],st:.status}' | while read -r body; do
  curl -s -o /dev/null -X POST https://stats.example.com/api/crawl \
    -H 'content-type: application/json' -H 'X-Trckable-Proxy-Key: tkb_px_yourkey' -d "$body"
done
```

### Anything else

```shell
# any language: one POST per robot request, after the page has gone
curl -X POST https://stats.example.com/api/crawl \
  -H 'content-type: application/json' \
  -H 'X-Trckable-Proxy-Key: tkb_px_yourkey' \
  -d '{"s":"tkb_yoursiteid","u":"https://example.com/page","ua":"<user agent>","st":200}'
```

## Where else it shows up

- **In the weekly report.** One line: "AI assistants sent 128 visitors; crawlers read
  2,340 pages." It leaves out the half that is zero, and the whole line in a quiet week.
- **In the API.** `GET /api/v1/sites/{site}/report/ai-search`, with the report's own
  `from`, `to` and `f` parameters, answers with the visitors and referrers, the robots,
  and the pages with their `read`, `sent` and `flag`.
