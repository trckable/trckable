# Changelog

All notable changes to trckable are written down here. Versions follow
[Semantic Versioning](https://semver.org): the `VERSION` file is the one
source, and the server, the tracker and the npm package always carry it.
Every release is tagged `vX.Y.Z` and gets a section here before it ships.
Changes not released yet go under Unreleased; `pnpm release X.Y.Z` turns that
section into the release.

## Unreleased

- Hosting trckable for others: operator endpoints for accounts on one server
  (create with an owner, list, limit owners, read-only, suspend, delete with
  everything in it), and `TRCKABLE_MANAGED` for a provider that signs people
  in itself: no setup, passwords or two-step there, so nobody gets in around it

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
