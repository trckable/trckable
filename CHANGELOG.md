# Changelog

All notable changes to trckable are written down here. Versions follow
[Semantic Versioning](https://semver.org): the `VERSION` file is the one
source, and the server, the tracker and the npm package always carry it.
Every release is tagged `vX.Y.Z` and gets a section here before it ships.
Changes not released yet go under Unreleased; `pnpm release X.Y.Z` turns that
section into the release.

## Unreleased

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
