<div align="center">

<img src=".github/images/brand/mark.svg" width="72" height="72" alt="">

# trckable

**The only analytics you need. Private, free and open source.**

**Free and open source (AGPL-3.0)**, self-hosted web analytics that also shows you **which traffic pays**.<br>
One container, a 2 KB script, and revenue attribution for Stripe, Lemon Squeezy, Polar, Paddle and Dodo.<br>
Self-host it for free, or let [trckable Cloud](https://cloud.trckable.com) run it for you.

[![Version](https://img.shields.io/badge/version-0.7.0-b8ff3c?style=flat-square)](CHANGELOG.md)
[![License: AGPL-3.0](https://img.shields.io/badge/server-AGPL--3.0-0b0d10?style=flat-square)](LICENSE)
[![Tracker: MIT](https://img.shields.io/badge/tracker-MIT-0b0d10?style=flat-square)](packages/trckable/LICENSE)
[![Go](https://img.shields.io/badge/go-1.27-00ADD8?style=flat-square&logo=go&logoColor=white)](server/go.mod) <!--f:badge_tracker--><a href="https://docs.trckable.com/benchmarks/"><img src="https://img.shields.io/badge/tracker-2045_B_gzip-b8ff3c?style=flat-square" alt="Tracker size: 2045 B gzip"></a><!--/f--> <!--f:badge_memory--><a href="https://docs.trckable.com/benchmarks/"><img src="https://img.shields.io/badge/idle_memory-56_MB-b8ff3c?style=flat-square" alt="Idle memory: 56 MB"></a><!--/f-->

[Quick start](#-quick-start) · [How it compares](#️-how-it-compares) · [Everything it does](#-everything-it-does) · [Gallery](#-gallery) · [Docs](https://docs.trckable.com/) · [Changelog](CHANGELOG.md)

<a href="#-quick-start"><img alt="Self-host it: free, every feature" src="https://img.shields.io/badge/Self--host_it-free,_every_feature-b8ff3c?style=for-the-badge"></a>

<br>

<img src=".github/images/gallery/tour.webp" alt="A tour of the trckable dashboard on the demo site: the last 30 days against the 30 before, a pointer across the chart showing each day's visitors and revenue, the Share dialog with a card for a post, the money trail of visitors from Search, Full mode, then Replay playing the period day by day" width="960">

<sub>The demo site, recorded from the real dashboard: the comparison, the day under the pointer, Share, the money trail from Search, Full (<kbd>F</kbd>) and Replay.</sub>

<br><br>

<img src=".github/images/readme/numbers.svg" width="880" alt="2 KB browser script. 1 container, no external database. 56 MB of memory when idle. 0 IP addresses stored.">

</div>

> **Early preview.** Tracking, the dashboard, revenue for all five providers, Full mode, the MCP server and the self-hosting tools are built and tested. Still to come: live sandbox runs against each payment provider, the in-app assistant, and v1.0.

## 🧭 Two ways to use it

| | Self-host | trckable Cloud |
|---|---|---|
| Who runs it | You, on your own server: one container | We do, at [cloud.trckable.com](https://cloud.trckable.com) |
| Price | Free and open source (AGPL-3.0), every feature | 14-day free trial, then a plan that fits your traffic |
| Updates and backups | Yours | Ours |
| Start | The quick start below | [Sign up](https://cloud.trckable.com) |

Same product either way, and the same 2 KB script.

## ⚡ Quick start

```bash
docker run -d --name trckable -p 8080:8080 -v trckable-data:/data ghcr.io/trckable/trckable
docker logs trckable   # a one-time setup link: open it, create your account, add your site
```

The image is for x86-64 and arm64; pin a [release](https://github.com/trckable/trckable/releases) with its tag, `ghcr.io/trckable/trckable:<version>`. You can also build it yourself: `docker build -t trckable -f deploy/Dockerfile https://github.com/trckable/trckable.git`. The image and the release binaries are the supported way to run it; `go install` builds a server without the dashboard, which answers 503 until the dashboard is built (see [CONTRIBUTING.md](CONTRIBUTING.md)).

The container runs as an unprivileged user (65532), not root. A new Docker volume just works: it takes `/data`'s owner from the image. Two cases need one step. A volume an older image filled as root, or a bind-mounted folder Docker created as root, needs its owner changed once: `docker run --rm -v trckable-data:/data busybox chown -R 65532:65532 /data` (for a bind mount, `chown -R 65532:65532` on that folder). On Railway, which mounts the volume as root, set `RAILWAY_RUN_UID=0` on the service. If the data folder is not writable, trckable says so at start and prints the fix for your case. Behind a reverse proxy (Caddy, nginx, Traefik) also set `TRCKABLE_TRUST_PROXY=xff`, or `header:X-Real-IP`, so the sign-in limits and the country lookup see each visitor and not the proxy; `npx trckable doctor` checks it.

```html
<script
  defer
  data-site="tkb_a1b2c3d4"
  data-domain="example.com"
  src="https://stats.example.com/js/tkb_a1b2c3d4.js">
</script>
```

Your site's own script, from Settings → Install: it carries the modules and the privacy settings you chose. Or `npm i trckable` for React and Next.js, where events go through your own domain. On WordPress, the [plugin](integrations/wordpress) adds the tag for you: settings, a cookieless switch, an optional proxy through your own domain and a dashboard widget (GPLv2 or later; the server stays AGPL). Every route is in the docs: [install](https://docs.trckable.com/install/) · [platforms](https://docs.trckable.com/install/platforms/) · [revenue](https://docs.trckable.com/revenue/) · [MCP](https://docs.trckable.com/api/mcp/).

## 🚀 Deploy

The same image everywhere, with its data volume, health check and a pinned release. How to set each one up: [deploy/README.md](deploy/README.md).

| Where | |
|---|---|
| Any server with Docker | [`deploy/compose.yml`](deploy/compose.yml) |
| Railway | [`deploy/railway`](deploy/railway) |
| Coolify | [`deploy/coolify/trckable.yaml`](deploy/coolify/trckable.yaml) |
| Dokploy | [`deploy/dokploy`](deploy/dokploy) |
| Umbrel | [`deploy/umbrel/trckable`](deploy/umbrel/trckable) |
| Kubernetes | [`charts/trckable`](charts/trckable) (Helm) |

## 🔑 Sign in with Google, Microsoft or OIDC

Free on every install. People sign in with an account they already have. Set `TRCKABLE_BASE_URL` (`https://stats.example.com`) and register `https://stats.example.com/api/v1/oidc/<name>/callback` at the provider, `<name>` being the lower-case name below.

| Provider | Settings |
|---|---|
| Google | `OIDC_GOOGLE_CLIENT_ID`, `OIDC_GOOGLE_CLIENT_SECRET` |
| Microsoft Entra | `OIDC_MICROSOFT_CLIENT_ID`, `OIDC_MICROSOFT_CLIENT_SECRET`, `OIDC_MICROSOFT_TENANT` (your directory id) |
| Any OpenID Connect provider | `OIDC_<NAME>_CLIENT_ID`, `OIDC_<NAME>_CLIENT_SECRET`, `OIDC_<NAME>_ISSUER` (https), optional `OIDC_<NAME>_LABEL` |

A secret can come from a file (`OIDC_GOOGLE_CLIENT_SECRET_FILE`). The buttons appear on the sign-in screen only for providers that are set up, and Account says "Signed in with Google" for a session that came from one.

**Import from Google Analytics.** Set `GA_OAUTH_CLIENT_ID` and `GA_OAUTH_CLIENT_SECRET` (or `GA_OAUTH_CLIENT_SECRET_FILE`) together with `TRCKABLE_BASE_URL`, and an owner can sign in with Google in the import dialog (Settings → Install → Import history) and bring a GA4 property's daily history in; it is read-only and the token is never stored. Create your own OAuth client with the redirect `https://stats.example.com/api/v1/ga/callback`: see `docs/google-analytics-import.md`.

- **Who gets in.** Someone who is already on this instance (Settings → People) with exactly the email the provider verified (`email_verified`), and only once first-run setup has created the owner. An unverified address is never matched. The first finished sign-in (the authenticator code included, where it is asked) records the provider's own id for the person; the same email arriving later with another id is refused. If someone's account at the provider was deleted and made again, an owner resetting their password forgets the id, or the person who runs the server runs `trckabled admin clear-sso <email>`.
- **Google.** Google says an address is verified for any Google account, whatever domain it puts there, so it counts only for `@gmail.com` and `@googlemail.com`, or when the token's `hd` (the Google Workspace the account belongs to) is the address's own domain. Anything else is refused. `hd` names a Workspace's primary domain: an address on one of its alias domains is refused, so use the primary-domain address (or add the person under that address).
- **Microsoft: the trust model.** Entra's email claim is whatever its holder or a directory administrator set; Microsoft does not verify it. So it counts only when all of these hold: the token's directory (`tid`) is one you allow and its issuer names the same one (one directory id in `OIDC_MICROSOFT_TENANT`, or `organizations` / `common` together with `OIDC_MICROSOFT_ALLOWED_TENANTS`, directory ids comma separated); it is not a guest (`acct` is not 1, and `idp` is the directory itself); and the domain is verified, either by the optional claim `xms_edov` being true (add it under Token configuration → Add optional claim → ID → `xms_edov` in the app registration) or, for a single directory only, when that claim is not sent, by the domain being listed in `OIDC_MICROSOFT_ALLOWED_DOMAINS`. With `organizations` or `common` the claim is required: a list of domains cannot say which directory may hold an address on one. A claim that is sent as false refuses. Personal Microsoft accounts are refused.
- **Let a domain join.** `OIDC_<NAME>_ALLOWED_DOMAINS=acme.com` together with `OIDC_ALLOW_SIGNUP=true` creates a viewer for anyone from those domains at their first sign-in. Without both, nobody is created. Domains match exactly what follows the `@`: `acme.com` does not include `mail.acme.com`. List only domains whose addresses are all yours: a domain that unrelated people share (a free mail provider, a shared parent domain) lets all of them in.
- **The authenticator code.** An owner (in any account they belong to) who turned two-step on is always asked for the code after the provider. For everyone else it is asked too, unless you set `OIDC_REQUIRE_TOTP=false` (the default is true). People without two-step are not asked.
Use a provider you trust to hand out your domain's addresses. Every sign-in is logged as "signed in with google".

## ⚖️ How it compares

The free, self-hostable tools, plus DataFast (paid, hosted only) for script size, all measured the same way. The full tables, sources and caveats: [How it compares](https://docs.trckable.com/compare/).

<p align="center">
  <img src=".github/images/readme/script-size.svg" width="880" alt="Browser script, gzipped, with goals and outbound links: trckable 2,045 bytes, Plausible CE 2,141, Umami 2,333, GoatCounter 3,467, DataFast 5,253 (paid, no self-hosting documented), Rybbit 11,172, Matomo 28,172.">
</p>
<p align="center">
  <img src=".github/images/readme/self-host.svg" width="880" alt="To self-host: trckable is one binary using 56 MB idle, with payment sync for five providers. GoatCounter: one binary, about 30 MB, no payment sync. Umami: Node and PostgreSQL, about 300 MB, manual revenue events. Matomo: PHP and MySQL, about 512 MB, no payment sync. Plausible CE: Elixir, PostgreSQL and ClickHouse, about 2 GB, payment sync on its cloud only. Rybbit: ClickHouse, PostgreSQL and Redis, 2 GB or more, no payment sync.">
</p>

**Where it is not the right pick:** with pageviews only, Plausible CE's script is smaller (1,283 B against <!--f:tracker_core_bytes-->1,606<!--/f--> B). Session replay and A/B tests are out of scope on purpose: if you need those, use Matomo. Heatmaps are here, as an opt-in module that never records anyone (below).

## 🧰 Everything it does

Nothing is paid, limited or held back. The complete list, in words: [Everything it does](https://docs.trckable.com/features/).

<p align="center">
  <img src=".github/images/features/which-pays.svg" width="49%" alt="Which traffic pays: every sale credited to the visit that earned it, renewals included">
  <img src=".github/images/features/providers.svg" width="49%" alt="Five payment providers: Stripe, Lemon Squeezy, Polar, Paddle and Dodo, one key each">
</p>
<p align="center">
  <img src=".github/images/features/lightweight.svg" width="49%" alt="A 2 KB script, gzipped and gated in CI; modules that are off cost 0 bytes">
  <img src=".github/images/features/no-ip.svg" width="49%" alt="No IP address is ever stored: it is used in memory for the country, bot checks, rate limits and the cookieless hash, and never written to disk, a log or the WAL">
</p>
<p align="center">
  <img src=".github/images/features/core-full.svg" width="49%" alt="Core is one calm screen; press F for Full, every number on the same page">
  <img src=".github/images/features/scrubber.svg" width="49%" alt="Scrub through time: drag the chart and every card re-animates to that day">
</p>
<p align="center">
  <img src=".github/images/features/ai-channel.svg" width="49%" alt="AI assistants are a channel of their own: visits from ChatGPT, Claude, Perplexity and Gemini">
  <img src=".github/images/features/funnels.svg" width="49%" alt="Funnels, journeys and retention cohorts: where people stop, and whether they come back">
</p>
<p align="center">
  <img src=".github/images/features/consent.svg" width="49%" alt="Cookie consent your way: cookieless, trckable's own bar, or read the banner you already run">
  <img src=".github/images/features/vitals.svg" width="49%" alt="Core Web Vitals at the 75th percentile, measured by the browsers that visited">
</p>
<p align="center">
  <img src=".github/images/features/crawlers.svg" width="49%" alt="Who crawls you: AI answer bots, search indexing and training crawlers, reported apart">
  <img src=".github/images/features/ask.svg" width="49%" alt="Peek, your own AI: an MCP server with read-only tools, your key and your model">
</p>
<p align="center">
  <img src=".github/images/features/exactly-once.svg" width="49%" alt="Exactly once: CI kills the server mid-load on every change, 40,000 events, 0 lost and 0 counted twice">
  <img src=".github/images/features/backups.svg" width="49%" alt="Encrypted daily backups, kept seven deep, with a tested restore">
</p>
<p align="center">
  <img src=".github/images/features/people.svg" width="49%" alt="Two-step sign-in (RFC 6238, the QR drawn in your browser) and a read-only viewer role">
  <img src=".github/images/features/export.svg" width="49%" alt="Export the view you are looking at as CSV, or read the same numbers over the HTTP API">
</p>

### Widgets for your site

Settings → Widgets makes a small card for your own pages: live now, last 7 days, a counter, open revenue, a privacy seal, and **Online**, how many people are on the site now. Each is a page of HTML and CSS under `/w/<id>`: no script, no cookie, nothing sent anywhere. It is off until you make it, only the numbers its design shows are public, and it is never counted as a visit. Every widget has a name, a language (or the visitor's own), wording you can change, and an Edit view that shows the real card on a light or dark page, inline or in a corner; saving keeps the same id, so the code on your pages keeps working.

Online has three modes: a **pill** ("12 online" with a pulsing dot), the pill with a **30-minute sparkline**, and a **card** with the chart and the top pages or countries. It counts the last five minutes, the same as the dashboard's Online. Below three people it says "A few" and draws no chart, and a page or country appears only with three or more on it. Put it where you like, as a frame:

```html
<iframe src="https://stats.example.com/w/w_abc123" width="230" height="44" style="border:0;background:transparent"></iframe>
```

or float it in a corner with one small script (under 1 KB gzipped, separate from the tracker; the visitor can close it, it is hidden in print and fades in only without reduced motion). Paste it once: the corner, size, theme, colour, words and language are kept in Settings → Widgets, and a change there shows on the next page load, with no new code. (A tag with `data-pos="bl"` keeps that corner until Settings chooses one.)

```html
<script async src="https://stats.example.com/js/w_abc123.online.js"></script>
```

### Heatmaps, without recording anyone

Off for a new site; Settings → Modules turns it on, and says its size and what it keeps before it does. It is a script of its own, <!--f:module_heat_bytes-->1,535<!--/f--> B gzip (its budget is <!--f:tracker_heat_budget_bytes-->1,536<!--/f--> B, enforced in CI), sent after the base script to the sites that turned it on: the 2 KB script is the same bytes with it off. It adds a heatmap icon to a row of Pages (on hover), which opens that page in a frame that runs nothing (a page of your server frames your own site with every permission taken away, and says so when your site refuses to be framed), with where people clicked laid over it, how far down they read, the clicks that did nothing and the clicks repeated in anger, for phone, tablet and desktop widths. The Pages list also suggests it, once, when a page has 100 views in a day.

- **Counted:** per page and window width, the element that was clicked (a short selector made of tag, id and class names, never its text) and the tenth of it that was hit; a click on something that looks clickable where the page then changed nothing (a dead click); three clicks on one element within a second (a rage click); the name of the form field a form was left at, and the fields reached; and how far down the page was read, from the scroll depth the base script already sends. All of it is stored as counters per site, page, width, element and day, kept as long as the site's retention.
- **Never collected:** a recording of any kind, a visitor or session id, a cookie or anything in the browser's storage, what was typed or any field's value, a password field (not even its name), the mouse's path, a screenshot, or the order in which anyone did anything. A batch is added to the counters and forgotten; nothing in it says who sent it.
- **Quiet when asked:** it sends nothing for a browser with Do Not Track or Global Privacy Control, nothing for the paths and addresses you excluded, and nothing while the Cookie consent module is on (a visitor who declined is never counted at all). `data-heat-sample="0.2"` on the script tag reports one page view in five. A form is named by its id or name when that is a plain word, and a field by its name with list numbers and anything with a counter in it left out.
- **Limits:** the busiest 60 reports of a page view, 20 000 distinct counters a site a day, and per-address and per-site rate limits on `/api/h`, which answers 202 and does nothing while the module is off. Through your own proxy, forward `/api/h` as well as `/api/e`.
### A privacy report for every site

Settings → Data & privacy → Privacy report states what the site is set to collect and what it is not, in the dashboard's language: cookieless and consent mode, the cookie and its lifetime, retention, exclusions, the modules that are on, where the data is, the privacy-policy paragraph and a short "do I need a banner?". View it, or print it / save it as a PDF from the browser.

### When your server is down

A visitor's browser keeps what it could not send, up to 24 hours and 200 events, and sends it when your server answers again: the visits made meanwhile are counted once, on the day they happened. The server takes events up to 25 hours old; the browser's queue is the only copy until then, so a visitor who clears their site data in that time takes it with them. A visitor counted without a cookie has nothing stored in the browser, so what could not be sent is kept in memory and sent again for as long as the page is open: if they close the page first, those events are lost. A visit that was cut in two by the outage is stored as two visits, with every page view counted.

### Little things you notice

- **Live count in the tab**: "● 8 · trckable" in the browser tab and a dot on its icon while anyone is online. Off with one switch.
- **Cha-ching**: a coin toast when a sale arrives, over any view, with an optional chime. Browser notices for a first sale from a new source, a surge (busier than usual, with who sent them), a spike or tracking stopping are opt-in, and asked for only from a button.
- **Sparklines** on the top Sources and Pages, **vs usual** under Visitors ("+18% vs usual", against the same weekday) and **where the month is heading** ("≈ 41k by 31 Oct").
- **Site icons** beside referrers, fetched by your server once and kept there: your visitors' browsers never ask a third party.
- **Milestones** celebrate with a short ghost hop and a card ready to share. The cards that come up by themselves (a milestone, the one thing today, a nudge) are one design: what it is, when, its figure counting up, where it came from, a small chart of the moment, and a deck you turn with ← → or a swipe.
- **Install on your phone**: the dashboard is an installable app. On Android and desktop Chrome or Edge, open the avatar menu and choose **Install app**. On an iPhone or iPad, tap Share in Safari, then **Add to Home Screen**. It opens in its own window with the ghost icon. Only the page's own files are kept for an offline start; your numbers, the API and shared pages always come from your server, never from a copy in the browser.
- **Your language**: the dashboard speaks English, German, French, Spanish, Italian and Dutch. Open the avatar menu, choose **Language**, and pick one, or leave it on Auto to follow the browser. Numbers, money, dates and months follow it too; the CSV export stays raw. The translations are marked as needing a native speaker's review: fixing or adding a language is one file and a pull request ([CONTRIBUTING.md](CONTRIBUTING.md#translations)).
- **Smooth theme switch**: a short crossfade, nothing redrawn, and the saved theme is on before the first frame.

### Your own look on share links

A site's share links can carry your logo and colour instead of trckable's: in **Share → Link**, upload a logo (PNG, JPEG, GIF or SVG, up to 128 KB; an SVG is checked against a list of what a logo may contain and refused if it holds script or links to anything outside itself), pick a colour, and switch on **Hide trckable branding** to leave the wordmark and the small credit off the page and the password screen. You can also give the links a domain of their own, like `reports.example.com`. A domain is served only after you show it is yours: the dialog gives you a TXT record to add (`_trckable.reports.example.com` with a value it shows), and **Check** looks for it; until then the domain is pending and nothing changes. Then point a `CNAME` record for it at your trckable host (the dialog shows the exact line), and have your proxy serve it over https: links on that domain are always written as `https://`, so the proxy must provide the TLS (the dashboard's own address stays as it is). On a verified domain trckable answers share pages of that site only, and nothing else: no sign-in, no dashboard, no other site's link. A site can change its domain five times a day. Names that can never be a share domain: the dashboard's own address, and any you list in `TRCKABLE_RESERVED_HOSTS` (comma-separated). On an instance with one owner who controls every name, `TRCKABLE_SHARE_DOMAIN_SKIP_VERIFY=1` serves a domain as soon as it is set; it is off by default.

With Caddy, which gets a certificate for a name on the first visit once trckable says the name is one it serves:

```
{
	on_demand_tls {
		ask http://localhost:8080/api/v1/share-domain/ask
	}
}

dash.example.com {
	reverse_proxy localhost:8080
}

https:// {
	tls {
		on_demand
	}
	reverse_proxy localhost:8080
}
```

The `ask` address answers only a caller on the same machine that did not come through a proxy, which is how Caddy calls it; `TRCKABLE_SHARE_DOMAIN_ASK_OPEN=1` opens it to any caller. When Caddy runs in a container (Docker, Compose, Kubernetes) its call reaches trckable from the container network and not from the machine itself, so set `TRCKABLE_SHARE_DOMAIN_ASK_OPEN=1` there; the answer is only yes or no for one name.

Other proxies work the same way: forward the `Host` header unchanged, and get the certificate however you usually do. Shared pages send a Content-Security-Policy that allows nothing from outside the server, and a logo is only ever shown as a picture.

### Client reports

For an agency or a freelancer: **Settings → Alerts → Client reports** sends a site's numbers on a schedule to the people who pay for them. Each report is weekly (the first morning of the site's week, 08:00 in its time zone) or monthly (the first morning of the month, for the month that ended), goes to up to 10 addresses, is written in the language you pick for that schedule (English, German, French, Spanish, Italian or Dutch; the translations are marked "needs review" in `server/internal/reports/lang.go`, and a correction is a pull request to that one file) and wears the site's look from **Share → Link**: its logo, colour and "Hide trckable branding". It is an HTML email with the visitors, pageviews, bounce rate and visit length against the period before, revenue when payments are connected, the top sources, pages and goals, and, if you leave it on, a one-page PDF with the same numbers and a bar a day. Reports need email on the server (`TRCKABLE_SMTP_URL`, or a Resend key) and `TRCKABLE_BASE_URL`; without them the card says so. A site can have five schedules; "Send me a copy" sends the last period to you, three times a day at most.

The PDF is written by trckable itself, in plain Go, with no browser and no library: one page of Helvetica, so Western European letters only (a character outside them is drawn as "?"). A PNG, JPEG or GIF logo is placed in the email and the PDF; an SVG logo is not (mail clients and PDF readers do not draw it), so the name stands in its place.

Every email carries a link that stops it for that one address, and the headers mail clients use for their own Unsubscribe button; it works without signing in and removes only that address. Reports need email on the server (`TRCKABLE_SMTP_URL`, or `TRCKABLE_RESEND_KEY` where SMTP is blocked, with `TRCKABLE_MAIL_FROM`) and `TRCKABLE_BASE_URL`, which the stop links are built from: without both nothing is sent.

### Keyboard shortcuts

Press `?` in the dashboard for the list; every key can be changed there and follows your account.

| Key | What it does |
|---|---|
| `?` | The shortcuts list |
| `⌘K` / `Ctrl K` | Peek, your own AI |
| `E` | Features: every feature in one pop-up |
| `F` | Core ↔ Full |
| `L` | Live ↔ Data |
| `A` | Create a goal, funnel or note |
| `S` | Switch site |
| `U` | Your menu |
| `,` | Settings |
| `/` | Filter |
| `Shift S` | Share |
| `R` | Replay, play or pause |
| `T` `Y` `7` `3` `9` `1` `W` `M` `N` | Today, Yesterday, Last 7 / 30 / 90 days, 12 months, This week, This month, Now |
| `←` `→` | Step the period back or forward |
| `C` | Compare with the period before |
| `Esc` | Close what is open |

## 🖼 Gallery

<table>
<tr>
<td width="50%"><img src=".github/images/gallery/full.png" alt="Full mode: moments marked on the chart, then two tabbed cards under it, who came and what they did, with revenue and conversion on every row"><br><sub><b>Full mode.</b> Two tabbed cards; revenue and conversion on every row, highlights, the AI assistants, the pages that sell and the latest buyers.</sub></td>
<td width="50%"><img src=".github/images/gallery/money-trail.png" alt="Hovering a channel highlights where those visitors went and what they paid"><br><sub><b>Money trail.</b> Hover a source, follow its visitors and their money.</sub></td>
</tr>
<tr>
<td><img src=".github/images/gallery/filter-menu.png" alt="The Filter menu: one search across every dimension, a flat list with an icon and a count for each"><br><sub><b>Filter menu.</b> One search across every dimension; pick several without closing it.</sub></td>
<td><img src=".github/images/gallery/modules.png" alt="Settings, Modules: every module priced in bytes before you turn it on"><br><sub><b>Modules.</b> Each priced in bytes before you turn it on.</sub></td>
</tr>
<tr>
<td><img src=".github/images/gallery/cookie-consent.png" alt="Cookie consent settings with a live preview of trckable's own bar"><br><sub><b>Cookie consent.</b> Read your banner, or brand trckable's own bar.</sub></td>
<td><img src=".github/images/gallery/core-light.png" alt="Core mode in the light theme"><br><sub><b>Light theme.</b> Both themes are built to WCAG 2.1 AA and checked with axe-core.</sub></td>
</tr>
<tr>
<td><img src=".github/images/gallery/share-card.png" alt="The Share dialog: the last 30 days as a picture, with visitors, revenue and the change against a year before"><br><sub><b>Share card.</b> Your numbers as a picture or a GIF, made in the browser. Nothing is uploaded.</sub></td>
<td><img src=".github/images/gallery/widgets.png" alt="Settings, Sharing: the Open revenue widget previewed with this month's revenue by channel"><br><sub><b>Widgets.</b> Live numbers for your own pages, with no script and no cookie.</sub></td>
</tr>
</table>

## 🏗 How it's built

<p align="center">
  <img src=".github/images/readme/architecture.svg" width="880" alt="One binary, two embedded databases: browser events go through a write-ahead log and one writer into DuckDB; signed payment webhooks go through an inbox into an idempotent SQLite ledger; the dashboard, API and MCP server read both.">
</p>

Go, embedded DuckDB and SQLite, React with an in-house SVG chart kit. Every event is fsynced before it's acknowledged, every webhook is stored raw before it's processed, and both replay exactly once. How each number was measured: [By the numbers](https://docs.trckable.com/benchmarks/).

## 🗺 Roadmap

- [x] Tracking, dashboard (Live, Core and Full), revenue for five providers, MCP server
- [x] Self-hosting tools: alerts (a new site starts with the weekly report, with the week's findings, and "tracking stopped" on, by email to the owner or to the webhook already in use; every email has a link that stops it), encrypted backups (copied to your own bucket, restored straight from it), imports, 2FA, read-only share links (public or password, revenue and notes on or off, an end date, embeddable, your own logo, colour and domain, copyable again, revocable), WCAG 2.1 AA (axe-core on the dashboard's main screens, both themes, three browsers, in CI)
- [x] npm package [`trckable`](https://www.npmjs.com/package/trckable) with `init` / `doctor` / `mcp`, published from CI with provenance
- [ ] Live sandbox runs against each payment provider
- [ ] Peek: an optional in-app assistant on the same read-only tools, with your own AI key
- [ ] A mobile app (iOS and Android): connect it to your own server and see your visitors, sources and sales on your phone
- [x] Releases: one tag publishes the image (x86-64, arm64), the npm package and the GitHub release
- [ ] Public v1.0: a one-click deploy template, a public demo

## 🤝 Contributing

Contributions are welcome: how to build, test and send a change is in [CONTRIBUTING.md](CONTRIBUTING.md). Found a security problem? Please report it privately, as [SECURITY.md](SECURITY.md) explains.

## License

Server and dashboard [AGPL-3.0](LICENSE) · tracker and the `trckable` npm package [MIT](packages/trckable/LICENSE) · WordPress plugin [GPL-2.0-or-later](integrations/wordpress/trckable/license.txt) · geolocation by [DB-IP](https://db-ip.com) (CC BY 4.0)

The name trckable and the logo are not part of those licenses: a fork is welcome, under its own name. See [TRADEMARKS.md](TRADEMARKS.md).
