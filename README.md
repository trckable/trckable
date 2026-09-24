<div align="center">

<img src=".github/images/brand/mark.svg" width="72" height="72" alt="">

# trckable

**Peekaboo. Every visit counted.**

Tiny, open-source, self-hosted web analytics that also shows you **which traffic pays**.<br>
One container, a 2 KB script, and revenue attribution for Stripe, Lemon Squeezy, Polar, Paddle and Dodo.

[![Version](https://img.shields.io/badge/version-0.1.0-b8ff3c?style=flat-square)](CHANGELOG.md)
[![License: AGPL-3.0](https://img.shields.io/badge/server-AGPL--3.0-0b0d10?style=flat-square)](LICENSE)
[![Tracker: MIT](https://img.shields.io/badge/tracker-MIT-0b0d10?style=flat-square)](packages/trckable/LICENSE)
[![Go](https://img.shields.io/badge/go-1.27-00ADD8?style=flat-square&logo=go&logoColor=white)](server/go.mod)
[![Tracker size](https://img.shields.io/badge/tracker-2.0_KB_gzip-b8ff3c?style=flat-square)](https://trckable.com/docs/benchmarks/)
[![Idle RAM](https://img.shields.io/badge/idle_RAM-28_MB-b8ff3c?style=flat-square)](https://trckable.com/docs/benchmarks/)

[Quick start](#-quick-start) · [How it compares](#️-how-it-compares) · [Everything it does](#-everything-it-does) · [Gallery](#-gallery) · [Docs](https://trckable.com/docs/)

<br>

<img src=".github/images/gallery/core.png" alt="The trckable dashboard in Core mode: visitors, revenue, conversion and revenue per visitor, a visitors chart with a revenue strip and notes, and the top sources, pages, locations and devices" width="960">

<sub>Core mode on the demo site. Press <kbd>F</kbd> for Full: revenue and conversion on every row, goals, top earners and a live feed.</sub>

<br><br>

<img src=".github/images/readme/numbers.svg" width="880" alt="2 KB browser script. 1 container, no external database. 28 MB of memory when idle. 0 IP addresses stored.">

</div>

> **Early preview.** Tracking, the dashboard, revenue for all five providers, Full mode, the MCP server and the self-hosting tools are built and tested. Still to come: live sandbox runs against each payment provider, the in-app assistant, and v1.0.

## ⚡ Quick start

```bash
docker run -d --name trckable -p 8080:8080 -v trckable-data:/data ghcr.io/trckable/trckable
docker logs trckable   # a one-time setup link: open it, create your account, add your site
```

```html
<script defer src="https://stats.yoursite.com/js/t.js" data-site="tkb_…"></script>
```

Or `npm i trckable` for React and Next.js, where events go through your own domain. Every route is in the docs: [install](https://trckable.com/docs/install/) · [platforms](https://trckable.com/docs/install/platforms/) · [revenue](https://trckable.com/docs/revenue/) · [MCP](https://trckable.com/docs/api/mcp/).

## ⚖️ How it compares

The free, self-hostable tools, plus DataFast (paid, hosted only) for script size, all measured the same way. The full tables, sources and caveats: [How it compares](https://trckable.com/docs/compare/).

<p align="center">
  <img src=".github/images/readme/script-size.svg" width="880" alt="Browser script, gzipped, with goals and outbound links: trckable 2,047 bytes, Plausible CE 2,141, Umami 2,333, GoatCounter 3,467, DataFast 5,253 (paid, hosted only), Rybbit 11,172, Matomo 28,172.">
</p>
<p align="center">
  <img src=".github/images/readme/self-host.svg" width="880" alt="To self-host: trckable is one binary using 28 to 35 MB idle, with payment sync for five providers. GoatCounter: one binary, about 30 MB, no payment sync. Umami: Node and PostgreSQL, about 300 MB, manual revenue events. Matomo: PHP and MySQL, about 512 MB, no payment sync. Plausible CE: Elixir, PostgreSQL and ClickHouse, about 2 GB, payment sync on its cloud only. Rybbit: ClickHouse, PostgreSQL and Redis, 2 GB or more, no payment sync.">
</p>

**Where it is not the right pick:** with pageviews only, Plausible CE's script is smaller (1,283 B against 1,580 B). And session replay, heatmaps and A/B tests are out of scope on purpose. If you need those, use Matomo.

## 🧰 Everything it does

Nothing is paid, limited or kept for a hosted edition. The complete list, in words: [Everything it does](https://trckable.com/docs/features/).

<p align="center">
  <img src=".github/images/features/which-pays.svg" width="49%" alt="Which traffic pays: every sale credited to the visit that earned it, renewals included">
  <img src=".github/images/features/providers.svg" width="49%" alt="Five payment providers: Stripe, Lemon Squeezy, Polar, Paddle and Dodo, one key each">
</p>
<p align="center">
  <img src=".github/images/features/lightweight.svg" width="49%" alt="A 2 KB script, measured on the wire and gated in CI; modules that are off cost 0 bytes">
  <img src=".github/images/features/no-ip.svg" width="49%" alt="No IP address is ever stored: used once in memory for the country, then discarded">
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
  <img src=".github/images/features/consent.svg" width="49%" alt="Cookie consent your way: consent-free, trckable's own bar, or read the banner you already run">
  <img src=".github/images/features/vitals.svg" width="49%" alt="Core Web Vitals at the 75th percentile, measured by the browsers that visited">
</p>
<p align="center">
  <img src=".github/images/features/crawlers.svg" width="49%" alt="Who crawls you: AI answer bots, search indexing and training crawlers, reported apart">
  <img src=".github/images/features/ask.svg" width="49%" alt="Ask your own AI: an MCP server with read-only tools, your key and your model">
</p>
<p align="center">
  <img src=".github/images/features/exactly-once.svg" width="49%" alt="Exactly once: 200,000 events through 10 crash runs, 0 lost and 0 counted twice">
  <img src=".github/images/features/backups.svg" width="49%" alt="Encrypted nightly backups, kept seven deep, with a tested restore">
</p>
<p align="center">
  <img src=".github/images/features/people.svg" width="49%" alt="Two-step sign-in (RFC 6238, QR drawn on your own server) and a read-only viewer role">
  <img src=".github/images/features/export.svg" width="49%" alt="Export the view you are looking at as CSV, or read the same numbers over the HTTP API">
</p>

## 🖼 Gallery

<table>
<tr>
<td width="50%"><img src=".github/images/gallery/full.png" alt="Full mode: every card opened into tables with revenue and conversion on each row"><br><sub><b>Full mode.</b> Revenue and conversion on every row.</sub></td>
<td width="50%"><img src=".github/images/gallery/money-trail.png" alt="Hovering a channel highlights where those visitors went and what they paid"><br><sub><b>Money trail.</b> Hover a source, follow its visitors and their money.</sub></td>
</tr>
<tr>
<td><img src=".github/images/gallery/filter-menu.png" alt="The Filter menu with dimensions grouped and a search inside each"><br><sub><b>Filter menu.</b> Every dimension, grouped and searchable; saved views.</sub></td>
<td><img src=".github/images/gallery/modules.png" alt="Settings, Modules: every module priced in bytes before you turn it on"><br><sub><b>Modules.</b> Each priced in bytes before you turn it on.</sub></td>
</tr>
<tr>
<td><img src=".github/images/gallery/cookie-consent.png" alt="Cookie consent settings with a live preview of trckable's own bar"><br><sub><b>Cookie consent.</b> Read your banner, or brand trckable's own bar.</sub></td>
<td><img src=".github/images/gallery/core-light.png" alt="Core mode in the light theme"><br><sub><b>Light theme.</b> Both themes pass WCAG 2.1 AA.</sub></td>
</tr>
</table>

## 🏗 How it's built

<p align="center">
  <img src=".github/images/readme/architecture.svg" width="880" alt="One binary, two embedded databases: browser events go through a write-ahead log and one writer into DuckDB; signed payment webhooks go through an inbox into an idempotent SQLite ledger; the dashboard, API and MCP server read both.">
</p>

Go, embedded DuckDB and SQLite, React with an in-house SVG chart kit. Every event is fsynced before it's acknowledged, every webhook is stored raw before it's processed, and both replay exactly once. How each number was measured: [By the numbers](https://trckable.com/docs/benchmarks/).

## 🗺 Roadmap

- [x] Tracking, dashboard (Core and Full), revenue for five providers, MCP server
- [x] Self-hosting tools: `init` / `doctor`, alerts, encrypted backups, imports, 2FA, share links, WCAG 2.1 AA
- [ ] Live sandbox runs against each payment provider
- [ ] Ask trckable: an optional in-app assistant on the same read-only tools, with your own AI key
- [ ] Public v1.0: Railway template, releases, public demo

## 🤝 Contributing

Contributions are welcome: how to build, test and send a change is in [CONTRIBUTING.md](CONTRIBUTING.md). Found a security problem? Please report it privately, as [SECURITY.md](SECURITY.md) explains.

## License

Server and dashboard [AGPL-3.0](LICENSE) · tracker and the `trckable` npm package [MIT](packages/trckable/LICENSE) · geolocation by [DB-IP](https://db-ip.com) (CC BY 4.0)
