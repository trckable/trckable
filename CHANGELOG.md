# Changelog

All notable changes to trckable are written down here. Versions follow
[Semantic Versioning](https://semver.org): the `VERSION` file is the one
source, and the server, the tracker and the npm package always carry it.
Every release is tagged `vX.Y.Z` and gets a section here before it ships.
Changes not released yet go under Unreleased; `pnpm release X.Y.Z` turns that
section into the release.

## Unreleased

## 0.5.7 (30 Sep 2026)

- Widgets have their own section in a site's settings, next to Sharing: they go on your own pages, so they no longer sit under share links.
### Changed

- The key numbers are one light strip instead of two rows of boxed cards: a small dim name, the number in mono, and its change under it as a small "54% ↑" (the arrow and figure green or red, nothing else coloured), with no icon tiles, sparklines or badges. The charted number has a thin underline, and every number is a button that puts it on the main chart: Visitors, Revenue, Conversion, Per visitor, Bounce rate and Session time (Pageviews where there is no revenue), each in its own units and on its own axis; Online now is last, with its dot. The choice is in the address (`metric=`), and a number the chart cannot draw at that grain (the days-only ones, when the chart is by the hour, week or month) is not a button. On a phone the strip wraps to three columns.
- A change is shown only when there is something to compare with: a period with no visits before it says nothing (no more "new" badges), and neither does one only part of which existed (a month against the three days a young site had of the month before it, which read as +2585%); the comparison is always the period of equal length just before.
- The chart settles in about a tenth of a second when the period or the number changes, and the tiles' numbers change in a blink instead of counting up. A line at zero rests on its axis instead of dipping under it, and a rate or a duration gets round axis labels.
- Revenue is on the main chart as a plot of its own under the visitors: about 96 px tall, its own labelled axis ($0, half, top) in the left margin, rounded money columns, the same dates, and one crosshair and one card over both plots, by pointer or keyboard. A day with no sales draws nothing, the day still counting is striped, the biggest sale is labelled, and a period with no sales says "No sales in this period". The Revenue tile can be pressed like Visitors: the main plot then shows revenue on a money axis, as columns (a glowing line once at least 80% of the days have sales) with last period dashed on the same axis, and the choice is in the address (`metric=revenue`). The hover card gives the day's revenue with its sales and their new and renewal amounts (the parts that are nothing are left out), revenue per visitor and conversion, or "No sales"; its figures are in the text colour beside a gold swatch. A site with no revenue, and a share link without it, shows none of this.
- The main chart is tidier and keeps its character: the line keeps a lighter glow, and today's point is drawn whole at the edge of the plot. Hovering no longer turns the rest of the line dark (only Replay, a drag or a picked day grey the far side, as a plain grey line), and the crosshair is lighter. Revenue under the chart is rounded columns, the hovered day in full and the others a little softer, with nothing drawn for a day without revenue. The hover card is tighter, and it leaves out a revenue block or a split of zero. On a phone it is a slim card (the day and figure on one line, revenue, a thin new/returning bar, four small figures in one row, a note as one line) that covers little of the plot. The scrubber lines up with the plot, its knob under the same day's point, and the x labels give way to the date under the cursor.
- Share these numbers is rebuilt: a new link is made in the card itself, with a name, Public or Password, revenue, notes, an end date (never, 7 or 30 days, or a picked day) and the sites it may be embedded on, next to a small live preview of what the reader will see (the lock shows the password screen). Right after creating, the link is shown once with Copy, Open, a QR code and the embed code. The list is one compact row per link: public or lock, what it shows, views (last opened on hover), end date, notes on or off in the row, and Revoke, which asks in the row.
- The header and the control row are lighter. The site and its settings cog are one card with a thin divider (on a phone too, where the cog used to sit in ⋯). The comparison is an icon until you set one, then it says "vs the day before"; its small menu offers the period before, last year, custom dates or none, and C still toggles it. The row folds by running its width to zero and » turns into «. The period opens as five choices (Now, Today, 7, 30 and 90 days) with keys shown only when you point at a row; More opens the other periods, Compare, Detail and Custom dates in place, and Compare and Detail apply at once. The Filter list is a flat list with a slim search, the filters with nothing to pick in one row, Clear in the search line and no Done button: click outside or press Esc. All popovers have a hairline border and a softer shadow, and on a phone they open as sheets from the bottom.
- The site switcher's density follows the count: one to three sites get roomier rows (40 px, a larger mark and name) and no All sites strip for a single site, four to six get 34 px rows, and longer lists keep the compact rows with search. The key hints at the foot of a short list are plain dim glyphs, on a desktop only.
- The site switcher is more compact: 30 px rows (40 px on a phone) with a small mark and a small state dot, today's visitors as a number on the right ("setup" or "stopped" where it applies), a check and a thin bar on the site you are on, All sites as a small chip with online now and today's total, and Add a site as a quiet row with the keys beside it (↑ ↓ enter esc, and 1–9 to open a site). The numbers load after the list opens.
- A text field in focus gets a thin accent border and a faint glow instead of the thick ring buttons get.

### Fixed

- Small money amounts keep their cents whichever currency format was written first: revenue per visitor could show as "$1" instead of "$1.27" after a page had formatted the same currency with no decimals.

## 0.5.6 (30 Sep 2026)

### Added

- The MCP revenue tool gives every row of its ranking the revenue of the comparison period and the change as text like +20% (`revenue_previous`, `revenue_change`), so an assistant can say which traffic earns most and whether it is up or down.

### Fixed

- The chart rests when nothing is happening: after Replay ends it no longer keeps a white line, a dot and a greyed half. They show in full only while you hover, drag or Replay plays and fade out when it stops; a day you picked or paused on stays as a thin dashed line with a small dot. Replay's slider spans the same days as the chart, so its thumb sits at the picked day even when the chart starts at the site's first visit.
- Live no longer shows the loading bar along the top the whole time: Live loads no report, and shows its own connection state.
- A person's picture shows wherever their avatar does: their row in People (yours too) uses it instead of the initial, and a new or removed picture changes the header, Profile and People together, without a reload. Pictures stay on this server, and only people of the same account can load one.

## 0.5.5 (30 Sep 2026)

### Fixed

- Connecting Paddle with one key finds the right Paddle by itself: live and sandbox keys are told apart by the key, an older key without a prefix is tried against live and then the sandbox, and a sandbox connection is tagged Sandbox and kept out of the real numbers. A key pasted with spaces or quotes is cleaned. A failed connect says what is wrong: the key wasn't accepted, which permission is missing, or that Paddle couldn't be reached.
- Closing a dialog gives focus back to the button that opened it, also when a field in the dialog took focus as it opened.

### Changed

- People is one compact row per person: a stack of site icons with "N of M sites" that opens a searchable list (each tick is saved at once), and a role pill that opens the two roles; every role change asks first, and making someone an owner takes one tick ("I trust them with all of this"). On a phone the row is two lines and the popovers are sheets from the bottom.
- Live mode drops its two green dots (before the title and before "Online now"): the dot in the Live | Data switch is the one, and it dims while Live's connection is down.
- The dashboard's first load is one script and one stylesheet, with React beside them: 1.9 KB lighter.
- The control row's fold toggle moved to the capsule's right end, after Filter, with a fold icon (unfold in the folded pill) instead of a chevron, so ‹ › only mean previous and next period.
- On a phone, the Live | Data switch sits in the control row, not only in the sheet.

## 0.5.4 (29 Sep 2026)

### Changed

- The Data view's control row is two capsules on the right (period with its dates and ‹ ›, comparison and Filter, which folds to a small pill; Share and ⋯ as icons, no filled button); on a phone it is one line, a pill that opens a sheet with Live/Data, the periods, comparison and filters.

### Fixed

- The account window keeps one size on every tab: a fixed sheet on a phone with the tabs in one row of icons that no longer scrolls sideways or cuts off People, and a fixed height on a desktop, with only the content scrolling.

## 0.5.3 (29 Sep 2026)

### Changed

- The chart's cursor is a quiet dashed line in the series colour from the top to the axis, with a date pill under it and a haloed point that eases from bucket to bucket; Live's line chart matches.
- Selects (the site picker in Share) share one style, with a chevron and a focus ring for the keyboard only, never on a click.
- The cookieless confirm is a With cookies against Cookieless comparison in four rows, and turning it off asks the same way with Use cookies.
- The dashboard's first load is 2.4 KB lighter: the milestones moment and the site layout code load when needed.

## 0.5.2 (29 Sep 2026)

### Changed

- Profile and a site's settings are now one window: same size, head and menu for every section, and a full-screen sheet on a phone.
- People is one row per person: a role switch (Owner | Viewer), a viewer's sites as chips, a status icon and the ⋯ menu; Add someone opens an inline row instead of a dialog, and the explainer cards are gone.
- API keys are one row per key with its start, when it was last used and Revoke; Create key is an inline row, the new key shows once with Copy, and three small tiles say what keys are for.
- Opening the Profile window no longer draws a focus ring on its close button.
- Share moved from the top header into the site's row, right before ⋯ (icon only on a phone).
- The site switcher opens without a jump: its list and layout load ahead, and site icons keep their box while loading.
- The footer text is one step smaller and fainter.
- The Milestones window is a hero for the newest milestone (big badge, the number, one sentence, Share the card and Replay the way there), a progress ring for each next step with what is left, and every milestone reached as a badge tile under its year; the badge pops in, the rings fill and the tiles rise in, all still with reduced motion, and a phone gets a full-screen sheet.

## 0.5.1 (29 Sep 2026)

### Changed

- The account window is now called Profile (it was Hideout).
- Ask trckable is now called Peek (⌘K). It is the owner's: viewers get no Peek button, key or panel.
- Filter moved from the top header into the period row, right before the period: same button, count badge and popup.
- The Profile header is cleaner: picture, name, email and a small Owner or Viewer pill.
- A viewer's Profile is the same window with the Account section alone: no sites, API keys or People.
- Viewers see no settings buttons: the site's cog, Site settings in ⋯ and every create, edit and delete control are gone, not just disabled.
- Limiting a viewer's sites is ⋯ → Allowed sites on their People row: a popup with All sites and a checkbox per site, saved with Save. The row keeps a small summary ("All sites", "4 of 8"). Dialogs now keep Tab inside them and return focus when they close.
- The avatar's menu holds only what is yours: Profile, theme, shortcuts and sign out. Refresh, Create, Core/Full, Milestones and Export as CSV moved to a ⋯ beside the period (Data only: Live has none), with their keys; both menus take the arrow keys, Home, End and Escape.
- Replay flows instead of stepping: one clock moves the playhead every frame, so the line, its marker and the tiles' numbers glide between points (even at the slowest speed) while the lists and cards move on a calmer beat and moments pop exactly where they happened. Reduced motion still steps from moment to moment.
- Replay speeds are durations, scaled to the period so a week and most of a year both feel right: Slow (~40 s), Normal (~20 s), Fast (~10 s), Faster (~5 s) and Rapid (~2 s), each shown with the time it takes for the period on screen. The speed is remembered in the browser, and `[` and `]` change it while Replay plays.
- The Replay speed menu is a compact list: a small speed glyph, the name and its duration, a check on the current one, arrow keys to move; the button shows the speed's name.
- First run: an owner cannot reach anything until one site has had its first visit. Every address shows the setup (add the site, install it, wait for its first visit) with no Skip, Esc does nothing, and Docs, Profile and Sign out stay reachable. An account with a working site is never held, and neither is one that also has a site still waiting for its first visit; there Add a site closes with Cancel, Esc or a click outside as any dialog does. A viewer with nothing shared sees "No sites shared with you yet."
- The setup is one centred column: progress dots, step, heading, then the card beneath.
- The site-less Settings page is gone; Sites live in Profile. `/settings` no longer shows a page: an old `/settings?site=…&tab=…` link opens that site's settings, any other address goes to the main dashboard.
- Add a site is a compact dialog that is as tall as its step, a bottom sheet on a phone. The domain field cleans a pasted address (`https://www.example.com/path` becomes `example.com`), says what will be counted, flags a domain that is not valid or already added, and Enter continues. The steps are a compact row where finished ones are ticked and can be clicked to go back, and the height follows the step smoothly.

### Fixed

- A site that has not had its first visit shows the install screen in Live as well as in Data, on first load, when switched to from another site and on a direct address; the Live | Data switch is hidden there, and the first visit opens the dashboard in the mode you had chosen.
- While Replay is playing the chart ignores the pointer, touch and keys: no crosshair, tooltip or dot pulls at the line. Pausing or ending Replay brings hover back; Live is unchanged.
- Live: "On the site right now" lists everyone Online now counts. Someone who opened a page long ago and is still active keeps their latest page (up to a day back), someone with no page at all shows as "Still on the site", and a list longer than 50 says "and N more". The header number is the tile's number. `GET /api/v1/sites/{site}/now` gains `more` (people left out of `recent`, absent when 0), and a `recent` row can have `kind: "active"`.

## 0.5.0 (28 Sep 2026)

### New

- AI assistants & crawlers: robot hits are kept as per-day counters (site, day, robot, page), never as events; the card splits AI assistants, training crawlers and search bots and shows which robot read which page. `reportCrawler` now passes every robot the server recognises.
- Live: click a minute on the line (or Enter on it; on a phone, tap it twice) to open that minute's day in Data, by the hour. The Online now and visitors numbers are a little larger.
- Replay tells the period as a story: only the part already played is drawn, with a faint unknown ahead; the tiles count up to the playhead (by the hour too), the lists race and the map lights countries as they arrive. Moments pop as the playhead passes them and sit as dots under the chart: sales (summed per bucket, with the channel that earned most; only where revenue is shown), spikes against the same bucket in the week before ("Traffic ×3, from news.example"), a country's first visit ever, the first AI assistant visit (crawlers module on), milestones reached and notes. ← and → jump between moments, Esc stops; with reduced motion it steps moment to moment. It ends on a one-line summary with Share. Speeds are 1×, 2× and 4×. API: `GET /api/v1/sites/{site}/moments` (aggregates only, day or hour buckets).
- Milestones: the site notices round numbers (lifetime visitors, pageviews, countries and revenue in the site's currency, a record day, the first goal and the first sale), checked once each finished day. One quiet line shows the biggest new one; ⋯ → Milestones keeps the timeline with Replay, Share and the next step of each. Share draws a 1200 × 630 card (dark or light, PNG drawn on the server) and makes a revocable link, `/m/{token}`, whose page carries the card as its preview; money shows its amount only with Show amount on. Closing a moment is per person. Settings → Notes turns them off; the optional Milestone reached alert is off by default. API: `GET/PUT /api/v1/sites/{site}/milestones`, `POST …/milestones/seen`, `GET …/milestones/{kind}/{step}/card`, `POST`/`DELETE …/milestones/{kind}/{step}/share`; MCP: `trckable_milestones`.
- People shows which sites each viewer may see, on their row: All sites, or a count; click it to choose. Owners set it for their own account through `GET /api/v1/site-access` and `PUT /api/v1/site-access/{id}`.

### Changed

- `/metrics` stays open as before; set `TRCKABLE_METRICS_TOKEN` to require that bearer token.
- The key-number tiles show no change chip when the period before has no data at all, instead of "new" on every tile.
- Share is one compact dialog: pick a card (Spotlight, Leaderboard, Dashboard or a Social post text), a period (24 hours, 7 days, 30 days), the site, light or dark and an accent, and download a PNG drawn by the server (`GET /api/v1/sites/{site}/card`); revenue only where the report shows it, visitors by default. On a phone it is a bottom sheet with the preview first. The read-only link moved to a small Link corner of the dialog; the browser-drawn picture and GIF card are gone. A site icon that fails to load shows its letter.
- The milestone notice above the numbers is now the Milestones moment (see New): its milestones are stored by the server instead of computed on each load, the first visit from an AI assistant is no longer one, and closing it is remembered per person instead of in the browser.
- Live's line chart reads one minute at a time: hover, touch or focus it and use the arrow keys for a crosshair and that minute's pageviews.
- The dashboard's footer is smaller: a smaller logo and text, less padding.
- The site's settings cog in the header is a plain icon button like the other header tools: the same size and radius, centred, a fill only on hover.
- The account window is called Hideout: its title and the menu entry that opens it ("Hideout, your account" for screen readers).

### Fixed

- Tapping a button or a chart on a phone no longer flashes a highlight or a focus outline. Focus rings show for the keyboard only.

## 0.4.3 (28 Sep 2026)

### New

- The Ask panel shows how to connect your own assistant over MCP: the config to paste, a link to the setup docs and a button that creates a read-only key.
- Modules drive the whole dashboard from one registry: a module that is off takes every way in with it (its cards, Create entries, filters, tabs and settings section), and the server refuses its writes with 404.
- Notes is a module of its own, on by default: off, the chart's markers, the notes list and adding notes go, and existing notes are kept.

### Changed

- The Create menu offers a goal, a funnel or a note, each only while its module is on; sites are added from the site switcher and All sites. A funnel with Funnels off is no longer shown greyed out.
- The header waits for the first visit: no Live/Data, period, Ask, Filter, Share or Create before it.

### Fixed

- Replay plays the chart on screen: a short span drawn by the hour plays hour by hour, and a new site's period starts at its first visit, instead of switching to the whole period by day.
- A viewer is read-only, and now provably so: a test calls every state-changing route as a viewer and with an API key, expects 403 and checks the database is untouched, and scans every answer a viewer may read for secrets. Funnels are a GET report, so viewers and read-only keys can open them. Settings switches and fields (General look, report rows, widgets, modules, privacy, alerts) are disabled for viewers instead of failing on save, and an unknown role reads rather than showing owner controls.

### Faster

- The account window, site settings and the site switcher open at once the first time: their code is fetched while the page is idle and renders without React's ~300 ms hold on a freshly loaded chunk (account window 385 → 114 ms, switcher 381 → 219 ms on the demo data).
- Opening the site switcher starts the first few sites' reports, and pointing at a site starts its own, so a switch shows numbers straight away (207 → 139 ms locally, 483 → 199 ms at 50 ms round trip).
- The first screen asks /setup, /me and /sites together instead of one after another: two round trips fewer before the numbers (1.7 → 1.1 s at 50 ms round trip).
- The report reads the period, the period it is compared with and who is online side by side.
- Every API answer carries a Server-Timing header, and CI checks a speed budget on the demo data: at most 8 requests on first load and an uncached report under 250 ms at p95.

## 0.4.2 (28 Sep 2026)

### New

- The dashboard header is two quiet rows. The first: the site, then borderless Ask (⌘K) and Filter, Share as the only filled button, and ⋯; Refresh, Create and Core/Full moved into ⋯ with their keys (A and F still work), and on a phone the site's settings too. The second says what the numbers are: Live/Data on the left, where it stays put in Live, then filters in force and saved views, and the period as plain words with ‹ › on the right (the comparison is its tooltip).
- Each key number shows its change against the period before (arrow, sign and colour, with the words for screen readers; "new" when there was nothing before). The charted one is lit by a slim accent bar instead of a heavy border.
- The main chart looks like Live's: one glowing line over a soft fill, three y labels and one label on the peak. When a site's first visit falls inside the period, the chart and the small lines start there, with a "since" chip and a one-tap "Show since …" period. Three days or fewer are drawn by the hour, up to the hour it is now.
- Replay is a small ▶ in the chart's corner; its speed and the scrubber show on hover or focus. Online now pulses while anyone is on the site and its count rolls to each new number.
- Settings → General → Reports has "Pages after the #" for hash-routed apps (/#/pricing): on, the part after # counts as its own page (with `data-hash` on the snippet); off, as before, it is dropped.
- TRADEMARKS.md: the code is open source (AGPL-3.0 and MIT), the name trckable and the logo are not; a fork is welcome under its own name and logo.

### Changed

- The dashboard's first load is 122.4 KB gzip, down from 129.2 KB, with nothing taken away: the menus behind a button (Create, ⋯, replay speed), the confirm dialog, the chart's hover card and note flags, the filter chips, Search Console's terms, the stopped-site notice, the sample dashboard and the update check are their own chunks, fetched while the browser is idle or as the pointer reaches their button, and the styles of screens that were already lazy now load with them.
- The site switcher is lighter: no second line under live sites, no duplicate
  settings button next to Add a site, and the reorder keys as a tooltip
- The dashboard footer is quieter: its logo is grey and faint until pointed at

### Fixed

- Retention's cohort numbers are readable on every cell: a cell's colour skips
  the band where neither light nor dark text meets WCAG AA
- A filter chip stays on one line: its name no longer wraps, and a long value
  is cut in the middle (the full value on hover)
- A stopped site in the site switcher shows its mark again, with the small red dot on its corner, instead of an empty red ring.
- Settings → Install on a site that is not verified: the "Not verified" card keeps its full height above the code, instead of being squeezed under it.
- The account window's New key and Add someone buttons keep their colour on
  hover, with the icon in line with the text

## 0.4.1 (27 Sep 2026)

- The loading ghost is in motion: on a page it traces itself in, fills and floats while its chart line draws and turns into rising bars, data drifts up into it and the name fades in; cards get a compact line-to-bars loop and inline spots a small hop and blink. Reduced motion shows one still, composed frame.
### Fixed

- Importing an Umami export that keeps its `event_type` column no longer turns pageviews into goals named "1": 1 imports as a pageview, 2 as a goal named by `event_name`, and a number is never taken for a goal name.
### Fixed
- The demo data seeder turns the Revenue module on when it seeds payments, so the demo shows revenue, Top earners and the money in Full mode instead of hiding them.
- The visitor journey tells one visitor's story: an identity card (generated avatar, country, device, browser and OS, new or returning, first and last seen, visits, time on site, and what they paid with the visit it is credited to), then a timeline per visit with the entry source, time on each page, repeated views folded (×3), goals and payments marked, and the exit. A visitor still on the site shows it with the page they are on. The source and pages filter the dashboard; copy id, Data request and Erase visitor sit in a small menu. A bottom sheet on a phone. A visit with no pages no longer breaks the dialog.
- Live's "On the site right now" matches it: each person's avatar with their source pinned to it, a device icon, the path cut in the middle, a ticking "5s" chip that glows for anyone active in the last 30 seconds, new rows glowing in and a round arrow on hover or focus that opens the journey.
## 0.4.0 (27 Sep 2026)

### New
- The main chart plays back under the cursor: everything right of it greys out (line, area, revenue bars, comparison) while the left stays lit, the crosshair riding the cut at 60 fps. Arrow keys, touch and Replay move the same cut, leaving the chart restores it, notes stay readable, and reduced motion drops the glide. A note in the hover card is now a labelled row like the figures.
- Live ↔ Data is one movement: the pill slides under your choice, the view below fades out as the other rises in, the visitor count and the chart travel between their places, Live's code loads when you point at the switch so nothing blank shows, Data comes back scrolled where you left it, and reduced motion switches at once.
- One loading indicator everywhere: the logo's ghost, bobbing and blinking
  over a soft accent glow, in place of the grey placeholders. The first paint
  is the ghost too, before any JavaScript. Still under reduced motion.
- Full mode, rethought: a grid of chart cards that each answer one question.
  Sources over time (visits stacked by channel), Visit to sale (visitors,
  your most-reached goal, then first sales, each step counted among the
  people who did the one before), Time to convert (first sales by the time
  since the buyer's first visit), New vs returning, Weekday × hour, Revenue
  by country (the dashboard's map, shaded by attributed revenue) and Page
  flow (the first three pages of every visit, and where visits ended). Every
  chart has one axis, a key, a tooltip on every mark (and the arrow keys on
  the time charts) and a Table switch with the same numbers. Four columns,
  two on a tablet, one on a phone; both themes; no motion when you ask for
  none. It is a lazy chunk (7.3 KB gzip), and the numbers come from one new
  read-only `GET /api/v1/sites/{site}/report/charts` that follows the period,
  filters and modules on screen. Full also drops the cards that no longer
  earn their place: the Live feed (Live mode shows it), the Campaign sources
  card (the Sources card's Campaigns tab has the same rows) and the Weekly
  rhythm card (now the Weekday × hour card)
- Full mode is one grid now: the chart cards, then Goals, Top earners, the
  funnel and the module cards, in rows that always fill. Cards in a row share
  its height, with the key and the note at the foot of each; a card with
  nothing to say (no sales yet, no revenue by country) drops out and the rest
  close up, with no holes. Four columns, two on a tablet, one on a phone. The
  Sources, Pages, Locations and Devices cards stay in Core (and on shared
  links, which have no charts); the jump links over Full follow the new
  sections
- A Create button in the dashboard toolbar, in Core and Full, for owners:
  a goal, a funnel, a note or a site, each in a short dialog on the spot. A
  opens it (C stays Compare); the Shortcuts list has it and lets you change it
- Full's funnel keeps its steps in the address (`fs=page:/pricing`), so a
  reload, a saved link or Create → Funnel land on the same funnel, with the
  period and filters around it
- A first run for a person with no site yet, on every server: three steps
  and three dots. "Which site first?" (the domain appears in a small
  dashboard preview as you type, Enter adds it), the one-line install (the
  install flow's own card, with its tabs, Check my site and the AI prompt),
  and "Someone's here" the moment the first real visit arrives on the live
  stream, then "You're live", which opens Live mode. "Skip for now" (or Esc)
  leaves at any step. Keyboard first, no motion when you ask for none, and
  its own lazy chunk (2.6 KB gzip). Adding more sites keeps the wizard
- A cookieless site says "Off: cookieless mode" where the dashboard showed
  new vs returning (More numbers, the chart's day) and journeys (the People
  card, Live's list of who is on the site): a daily hash recognises nobody the next day, so those
  numbers were every visitor new and every journey one day long. The sites
  list and share links now say whether a site is cookieless (`cookieless`)
- The chart's day tooltip shows that day's own numbers on a period with
  empty days (they are skipped in the report, and the tooltip counted by
  position, so it could show the wrong day's breakdown)
- A new install flow. A new site's dashboard is one calm card and nothing
  behind it: four tabs (script tag, Next.js, WordPress, npm/React, More… for
  every other way), the code with Copy, "Check my site" and "Copy a prompt for
  your AI editor". The add-site wizard (Your site → Install → Revenue,
  optional) adds numbered steps, a "Use cookieless tracking" switch that says
  what it costs before it saves the site's setting (the script tag stays the
  same: the server applies it) and "I've installed it". The check reads your
  homepage and says exactly what it found (this site's script, none, one
  without a site id, another site's, or a homepage that could not be read),
  looks again every 30 seconds, and turns live the moment the first visit
  lands. It loads only when needed, never with the first load
- Live mode: a Live | Data switch in the dashboard header (or L, or a click
  on Online now) shows the site right now on one screen: who is online,
  visitors in the last 30 minutes against the 30 before, pageviews minute by
  minute, the top sources and, with the revenue module on, today's revenue;
  beside it everyone on the site, new visits sliding in and anyone idle for
  five minutes leaving. The numbers come from a new read-only
  `GET /api/v1/sites/{site}/now` and the live stream; share links have no
  Live. Its code loads only when opened.
- Notes on the chart, redone: each day with notes gets a small flag on the
  x-axis (one flag with a count for several), never a label cut off at the
  edge. Pointing at it, focusing it from the keyboard or tapping it on a
  phone shows the words, the day and who wrote it. A Notes list, under the
  chart and in Settings → Notes, searches every note by words, author or
  day, edits and deletes them, and shows a note's day on the chart with one
  click. New: `PATCH /api/v1/sites/{site}/annotations/{id}`, and notes carry
  their author
- Share links show the chart's notes only when the owner turns on "Notes on
  the chart" (off by default, and off for every existing link), and never
  who wrote them. It can be flipped on an existing link from its ⋯ menu
  (`PATCH /api/v1/sites/{site}/shares/{id}`)
- Notes look like notes: the flags on the chart are round marks on the axis (a count when a day has several) that draw their day up the chart when pointed at; their tooltip names the day once above the notes; Add note and Notes are small chips under the chart with the count as a badge; the Notes list groups notes under a heading per day, with quiet edit and delete buttons until you point at a row
- The site switcher can be arranged: drag a site, or Alt + ↑/↓, or its ⋯
  menu, to reorder it, pin it to the top or move it into a named group
  ("Clients", "Shops") with a heading that folds. The layout is saved for the
  whole account (`GET`/`PUT /api/v1/site-layout`; viewers read it) and All
  sites lists the sites in the same order. Search appears past six sites,
  and the dot beside each site pulses when a visit came in the last five
  minutes. The list loads only when opened

### Fixed

- The date range picker is calm and even: every period in one two-column grid of equal rows, keys and the tick in one right-aligned column, Now's live dot beside its name, and the comparison, detail and footer on the same edges.
- At tablet width (about 768 px) the header no longer runs past the right edge: Ask shows its icon alone and the ghost drops its name until there is room.
- The header's menus (⋯ and the avatar) open above the date row and the
  cards, never under them
- Deleting a site, pruning or erasing a visitor on a quiet server could wait
  up to a minute instead of running at once, when the request arrived just
  as the writer went idle.
- Embedded widgets no longer show a scrollbar beside the card
- The note dialog shrinks back after the calendar closes, instead of keeping
  an empty space under its buttons
- The note dialog's calendar stays open after you pick a day, and the dialog
  shrinks back when you close it instead of keeping an empty space
- The site switcher opens scrolled to the site you are on
- The picture cropper for a site's icon and your own picture: the picture can be dragged with a mouse or a finger, moved with the arrow keys and zoomed out until all of it fits, so a wide logo shows whole; double-click or Center puts it back in the middle, and what is saved is exactly what the frame shows.
- Replay sits under the chart as its own footer, with room above the dates
- Every install snippet now works as given, and a browser test proves it:
  each method in Settings → Install runs in Chromium, Firefox and WebKit and
  its pageview has to arrive. Fixed on the way: the landing-page tag had no
  site id; Nuxt, Docusaurus and Gatsby had no data-domain; the Hono/Express
  route passed the proxy key under a name the package ignores (now proxyKey,
  as a Request handler, with the tag sending to it); the Nginx recipe did not
  say which tag to put on the page; the server-side curl was dropped as a bot
  and had the wrong fields; the AI crawlers and Electron/Tauri notes promised
  what the server does not do. `npx trckable init` and the READMEs write the
  same tag as the dashboard (`--domain` adds data-domain)
- Full mode's weekly rhythm put every weekday one row off (the row named
  Monday showed Tuesday's visits). The Weekday × hour card reads the days as
  the server sends them, Monday first
- Full mode no longer goes blank on a period with no visits while the
  retention module is on: the retention report answers an empty grid instead
  of null
- A ⋯ menu opened just as its list scrolled no longer closes at once
- The chart's last date on the axis no longer runs off its right edge

## 0.3.0 (27 Sep 2026)

### New
- Install → "Landing page and app": the script tag for a landing page on
  example.com and trckable/next for an app on a subdomain, prefilled, counted
  as one visitor with one journey; a browser test proves it, sale included
- Problems Health shows are now also sent: a failed backup, a failed
  off-site copy, the write-ahead log refusing events, and an instance key that
  does not match. Each goes to the alert destinations set up on the
  instance's sites once when it starts and once when it clears, never on every check,
  and nothing is sent when no alert is set up
- Upgrades keep a way back: before a new version changes the database, it
  writes an encrypted backup of everything, named for the version it upgrades
  from, into `backups/before-upgrade` (kept until the next upgrade replaces
  it). If that copy cannot be made (no disk space, the backups folder cannot
  be written), nothing is changed and trckable does not start until it can.
  Starts with nothing to upgrade are as fast as before

### Better
- The date picker's periods are tighter: Now, Today and Yesterday share one
  row, every group lines up on the same columns, and Now's live dot no
  longer pushes its label out of line.
- The default script is under 2 KB gzipped again, and the size check now holds it there.

### Fixed
- An address that names none of your sites (a typo, a removed site) opens your
  main dashboard with the address corrected, never the full-page Settings;
  site addresses match whatever the case or IDN spelling
- A site's own script (`/js/<site id>.js`, the snippet the dashboard gives) counts
  visits without `data-site` on the tag: before, it quietly sent nothing
- A site that never had a visit shows its install card from the first frame: a
  refresh no longer flashes an empty dashboard first
- The dashboard keeps today up to date on its own: a visit shows in Online
  now, the numbers and the chart within about two seconds, with no refresh.
  A report for today is no longer served from its 10 s cache once a newer
  visit or sale is in, and Online now is counted again right after a visit.
  When the live stream is blocked or held back by a proxy, the dashboard
  notices within 25 s and reads the numbers every 15 s until it is back
- Every install snippet names its site: the script tag is one attribute a line
  with `data-site` and `data-domain`, and so are the WordPress, framework and
  `npx trckable init` snippets
- Wizard steps (add a site, two-step, share links, keys, webhooks) run to the
  dialog's edge instead of stopping short after the last step
- The "Someone paid" alert counted every payment ever made, not only the new
  ones, and payment dates in a person's data export were far in the future
- A database read that fails part-way now says so, instead of showing fewer
  events, zero counts before deleting a site or account, or lower usage
- Payments in Icelandic króna or Ugandan shilling through Stripe counted a
  hundred times their value (Stripe writes both with two extra zero digits);
  they now count what was paid, in reports, live sales and data exports
- A partial refund of a payment with tax takes back its share of tax rounded
  to the nearest cent, where before the share was cut down. Refunds and
  revenue in reports from before may move by one cent: a $29.15 refund of
  $58.31 with $9.31 tax now counts $24.50, not $24.49
- A Stripe refund that failed after it was counted no longer stays subtracted
  from revenue, and Stripe refunds and disputes that name only the charge now
  reach their payment
- Erasing a payer by visitor now also removes the raw Lemon Squeezy notices
  about them and their renewals, erasing by email matches the whole address
  (never another payer's that contains it), and a payer's data export shows
  the real payment date
- A webhook that arrives before its connection has a signing secret (a manual
  setup half done, or after Start over) is now answered so the provider tries
  again later, instead of being refused for good
- Connecting a provider again no longer leaves old webhooks behind at the
  provider, a setup that failed halfway is undone, and the API key decides
  whether a connection is live or test
- Reconciliation now rides out rate limits and provider outages, fills gaps
  longer than a week after the server or provider was down, finds missed Polar
  refunds of older orders, and keeps what it fetched when it runs out of time
- A revoked or under-permissioned API key now says so in Settings → Payments,
  in words that say what to do
- Paddle can now be connected by hand in sandbox mode, so sandbox payments
  stay out of real revenue
- Payments in a currency the European Central Bank publishes no rate for are
  named on the dashboard, instead of "waiting for today's rate" forever
- Refunds take back their exact share of tax: no rounding error on large
  amounts
- The "you got paid" alert only reports payments since it last fired, with the
  amount in the site's currency, and the 30-day sales count in usage counts
  the last 30 days (both compared payment times in the wrong unit)
- Deleting a site now removes all of its analytics for good. Events still
  waiting in the write-ahead log when the site was deleted (or sent a moment
  before) used to be written back after the delete, and after a restart; now
  they are dropped, the site's open visits are forgotten, and other sites keep
  every event
- Settings → Health remembers the last off-site copy across a restart, instead
  of saying there was none since the server started
- Security: starting a new two-step setup no longer turns two-step off. The
  new phone's secret waits until a code from it is proven, so a setup given
  up half-way leaves the old phone working. While two-step is on, turning it
  off or setting up a new phone asks for a current code (or a recovery code)
  as well as the password. Turning it on asks for the password too, a new
  phone's setup expires after 10 minutes, codes are limited per person as
  well as per address, a recovery code is spent once even when sent twice at
  once, and an owner with two-step on needs their own code to reset someone
  else's password or two-step
- Security: a two-step code signs in once. The same code, or an older one
  still inside its 90-second window, is refused, so a code seen over a
  shoulder or replayed cannot be used again. The code that turns two-step on
  does not sign in either
- Security: resetting a person's password goes by their id within the
  account, never by their email address
- Security: the daily install check reads at most
  50 of one account's sites a day (the ones waiting longest first, so they
  take turns) and at most 4 at once, so one account cannot make the server
  fetch thousands of pages or hold up everyone else's checks
- Security: the widget numbers cache no longer empties itself when it holds
  10,000 entries, which made every widget read its numbers again at once. It
  drops the expired ones instead and, if all are still fresh, the oldest
- Security: viewers and API keys can no longer make the server ask Google
  for a site's Search Console properties with the stored key (owners only),
  and reading a payment connection's signing secret says "owners only"
  before it says whether the connection exists
- Viewers can keep their own keyboard shortcuts again (the server refused
  the change as if it were a setting of the instance)
- Security: a CSV export no longer carries a formula a visitor typed. A
  campaign, referrer or goal name that starts with =, +, -, @ (the way a
  spreadsheet starts a formula) is written with a leading apostrophe, so
  Excel, Numbers and Sheets show it as text instead of running it
- Security: the databases in the data directory (password hashes, sessions,
  two-step secrets, sealed provider keys) are readable by trckable's own
  user only. They used to be created readable by every user on the machine
  when the data directory was made by hand or by a volume mount; existing
  ones are made private at the next start, and everything trckable writes
  from now on is private from the start. A backup agent on the host that runs as
  another user can no longer read them: run it as trckable's user, or use
  trckable's own backups
- Security: two-step secrets are stored encrypted with the instance key
  (TRCKABLE_SECRET, or secret.key), and new recovery codes as keyed hashes,
  so a copy of the database alone cannot make codes or test guesses. Two-step
  set up before this keeps working and is encrypted at its next sign-in. If
  the instance key is ever changed or lost, authenticator codes stop working
  (the server says so at start): people sign in with a recovery code made
  before this release, or `trckabled admin disable-2fa <email>` lets them in
  to set two-step up again
- Security: sign-ins arriving together can no longer run the server out of
  memory. Each password check takes 19 MB while it runs, and ten at once (all
  within one address's limit) took a server from 23 MB to 229 MB; now two run
  at a time and the rest wait their turn, at most five seconds: after that a sign-in
  hears "busy, try again" (503) instead of hanging. Limits per address count
  an IPv6 /64 as one address
- Security: a share link's password can no longer be guessed from many
  addresses at once: after 20 wrong passwords in ten minutes, from wherever,
  the link waits before it takes another (other links, and people already
  reading this one, are not affected)
- Security: a webhook alert that could not be delivered no longer writes its
  whole URL (for Slack and Discord, the part that works as a password) into
  the server log; the log names the host it tried
- Security: webhooks, the install check and favicon fetches also refuse
  internal addresses written the IPv6 way (::10.0.0.1, the local NAT64
  prefix, the old site-local block, Teredo and IPv4-translated tunnels, and
  the discard, documentation and ORCHIDv2 blocks)
- Security: a password `trckabled admin add-user` or `admin reset-password`
  makes up now has to be replaced at the next sign-in, as the command already
  said and as one made in the dashboard does (a password piped in is the
  person's own and stays)

## 0.2.0 (25 Sep 2026)

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
  visits, with a forecast from the last 7 days
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
- Reports no longer stop loading after the first large backup: in 0.1.x
  every database connection opened after it failed until a restart
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
- npm package: the README says what works without a key and what
  needs one; the `trckable` command is declared the way npm expects
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
