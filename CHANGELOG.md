# Changelog

All notable changes to trckable are written down here. Versions follow
[Semantic Versioning](https://semver.org): the `VERSION` file is the one
source, and the server, the tracker and the npm package always carry it.
Every release is tagged `vX.Y.Z` and gets a section here before it ships.
Changes not released yet go under Unreleased; `pnpm release X.Y.Z` turns that
section into the release.

## Unreleased

### New
- Share what the dashboard shows as a card for a post: pick the big number and
  up to three more (pageviews, revenue, bounce rate, visit time, top source,
  top country), a look, and a size (post, square, story); download, copy or
  share it, or make it a looping GIF. It is drawn in your browser and follows
  the dashboard's period and comparison. Revenue is only in it if you add it
- Milestones worth a post (visitor counts, best day, first sale, first visit
  from an AI assistant), found in your own data and shared the same way
- Public widgets: a live visitor badge, counter, revenue card or privacy seal
  for your site, designed in Settings → Sharing and embedded with one line.
  The page runs no script and always says "Counted by trckable"
- Verify: the install check fetches your homepage and up to 20 of its scripts
  and says what it found. It runs daily too, and the dashboard says when a site
  that was working stops sending visits. Nothing recorded is deleted
- Health explains itself: disk, memory, backups, the instance key and refused
  visits, with a forecast from the last 7 days. `GET /_trckable/health` gives
  the same with the operator token
- Branding per site: an icon and a colour, used across the dashboard
- A Refresh button next to Ask fetches every number again, in place
- The CSV export carries the compared period's totals when a comparison is on

### Better
- Redesigned: Account, People, API keys, Sites, General, Payments, Data &
  privacy, Search Console (as steps), Alerts (each as a sentence, with a test
  you can watch), the date picker and its calendar
- One inline editor for every name; wizards and dialogs keep their size;
  dropdowns stay open while their list scrolls; branded scrollbars
- Deleting a site is a serious dialog in two steps, with what will be removed
- Every comparison uses the date picker's words ("vs last year") on the tiles,
  the chart and shared cards. Calendar periods compare with the same stretch
  before, and the period button says what it is compared with
- Week starts on Sunday or Monday, and reports, weekly buckets and the weekly
  report follow it
- On phones: KPI numbers fit their tiles and the chart stays on screen
- An update notice in the dashboard when a new version is out
- The dashboard's first load stays under 130 KB gzip

### Fixed
- Backups work on a busy site, and say so when they do not; a failed off-site
  copy keeps local copies
- A full disk no longer turns visits away until a restart
- Importing the same file twice stores it once
- Erasing a person also removes their provider notices and customer links
- A lost instance key has a way out (reconnect payments), and Health says where
  the key lives; a new key is never made silently over existing data
- Upgrade steps that upgrade: `docker compose pull && docker compose up -d`
- Security, from a full audit: a one-time password can only choose a new
  password; owners cannot reset other owners; sign-in and setup accept JSON
  only; rate limits on password, two-step and favicon changes; more private
  address ranges blocked for outgoing webhooks; widget colours are checked;
  API keys and viewers no longer read alert destinations or the key list
- One writer per write-ahead log: an import no longer runs beside the server
- Proxy recipes forward the visitor's IP the way the server reads it

## 0.1.2 (24 Sep 2026)

- A visitor who declines is not counted at all, with or without a cookie:
  from the moment they say no (trckable's bar, the site's consent manager,
  `trckable('consent', false)`, Do Not Track or Global Privacy Control),
  nothing more is sent. A banner's default is not an answer
- With a banner, the first page waits for the visitor's answer: sent with the
  cookie after an accept, dropped after a decline, sent without a cookie if
  they leave without answering
- `trckable('consent', false)` now deletes the cookie, as a withdrawal should
- Consent-free mode is now called cookieless mode, and says what it does
  rather than what the law allows; the privacy-policy text the dashboard
  writes for you says the same, and names where a banner is still needed
- The script's budget is 2,060 bytes (was 2,048); the default script is
  2,051 bytes

## 0.1.1 (24 Sep 2026)

- The server's own error log no longer contains visitors' addresses: its
  lines pass through a filter first, so no IP address is stored anywhere
- The dashboard's logo is the one trckable uses everywhere, with its own
  small font (2.5 KB), and a hover animation; the name is set the same way
  in headings
- The dashboard is built with Vite 8: first load 125.8 KB instead of 127.0
- npm package: the README says what works with self-hosting and Cloud and
  what needs a key; the `trckable` command is declared the way npm expects
- Contributing: pull requests, a contributor licence agreement (CLA.md),
  and `pnpm release` for maintainers

## 0.1.0 (24 Sep 2026)

The first public version. It includes:

- Cookie-free or cookie-based tracking with a 2 KB script, or the `trckable`
  npm package for React and Next.js through your own domain
- The dashboard in Core and Full views, filters, funnels, people and journeys
- Revenue attribution for Stripe, Lemon Squeezy, Polar, Paddle and Dodo
- An MCP server with read-only tools for AI assistants
- Encrypted backups, alerts, imports, 2FA, share links and WCAG 2.1 AA
