# Changelog

All notable changes to trckable are written down here. Versions follow
[Semantic Versioning](https://semver.org): the `VERSION` file is the one
source, and the server, the tracker and the npm package always carry it.
Every release is tagged `vX.Y.Z` and gets a section here before it ships.
Changes not released yet go under Unreleased; `pnpm release X.Y.Z` turns that
section into the release.

## Unreleased

### Added

- Client reports: Settings → Alerts → Client reports sends a site's numbers, weekly or monthly, by email and optionally with a PDF, to up to ten addresses, in the language chosen for that schedule (English, German, French, Spanish, Italian or Dutch; the five translations are marked "needs review" in `server/internal/reports/lang.go`). The email wears the site's share look (logo, colour, "Hide trckable branding") and has the four key numbers against the period before, revenue, and the top sources, pages and goals. Weekly goes on the first morning of the site's week at 08:00 in its zone, monthly on the 1st for the month that ended, and a period is sent once; a server that was down sends it when it is back. The PDF is made by the server itself with no browser and no library: one A4 page in Helvetica (Western European letters; others print as "?"), with the numbers and a bar for each day. A PNG, JPEG or GIF logo goes into both; an SVG logo does not. Each person gets their own message with a link that removes just their address (a page that asks first, then one click, and the one-click headers mail clients read), working without signing in. Reports need a mail server and `TRCKABLE_BASE_URL`; without both nothing is sent. A site can have five schedules; "Send me a test" is limited to three a day. New: `GET`/`POST /api/v1/sites/{site}/report-schedules`, `PUT`/`DELETE …/{id}`, `POST …/{id}/test`, `GET`/`POST /r/{token}`; a table `report_schedules` is added on upgrade. Owners only. The check runs with the alert check every ten minutes.
- Share links can carry your look: in Share → Link, a site gets its own logo (PNG, JPEG, GIF or SVG, up to 128 KB, at most 2000 by 2000 pixels), a colour for the page, a "Hide trckable branding" switch and a domain of its own for its links. The logo replaces the wordmark in the header and the page's accent follows the colour; unless the switch is on, a small "trckable" credit stays beside the logo (the embed bar's "analytics by" and the password page's wordmark follow the switch too). An SVG is read against a list of allowed elements and attributes and written out again from what was read; a file with script, an event handler, a style import, a `data:` or other address that leaves the file, a DOCTYPE or any element not on the list is refused, not edited. A logo is served as a picture with a policy that allows no script or loading, and a sandbox, and the shared page keeps its Content-Security-Policy. A domain is a plain host name: it is pending until its owner adds the TXT record `_trckable.<domain>` the dialog shows and presses Check, then it is served; point a CNAME at the server (https is the proxy's). On a verified domain only the share pages of that site answer, and every other path is 404 (paths with dot segments, double slashes or escaped dots and slashes too), so no sign-in, dashboard, tracker or other site's link opens there. A site can change its domain five times a day; `TRCKABLE_RESERVED_HOSTS` lists names that can never be one; `TRCKABLE_SHARE_DOMAIN_SKIP_VERIFY=1` skips the check on an instance with one owner. `GET /api/v1/share-domain/ask?domain=` answers 200 for a verified domain and 404 for any other, for a proxy's on-demand certificate check (Caddy's `ask`), and only to a caller on this machine that came through no proxy, unless `TRCKABLE_SHARE_DOMAIN_ASK_OPEN=1`. An editor's own bookkeeping in an SVG (Inkscape, Illustrator, metadata, `data-` attributes) is dropped, not a reason to refuse it. New: `GET`/`PUT /api/v1/sites/{site}/share-look`, `POST /api/v1/sites/{site}/share-look/verify`, `GET`/`PUT`/`DELETE /api/v1/sites/{site}/share-logo`, `GET /api/v1/share/logo`; a table `site_share_look` is added on upgrade. Owners only.
- A WordPress plugin, in `integrations/wordpress/` (the zip is built by `integrations/wordpress/build.sh`, for the wordpress.org directory and "Upload Plugin"). The trckable menu opens a first-run card (where trckable runs: Cloud or your own server; the site ID with a connection check; the first visit) and then the settings as cards beside a live preview with the exact tag. It takes the site ID and the server, a cookieless switch, and leaves out logged-in admins and editors (and any role you pick). It adds the same tag as the documented one (defer, `data-site`, `data-cookieless`) and bundles no tracker code: the script loads from your server. Optionally the script and the events go through your own domain (a WordPress REST route that forwards exactly the site's script and `POST /api/e`, with the proxy key and the visitor's address, and refuses everything else), and a dashboard widget shows visitors today and who is on the site now from a read-only API key, cached for a minute. `uninstall.php` removes what it stored. PHP 7.4 or later, WordPress 6.0 or later, GPLv2 or later (the server stays AGPLv3: the plugin only talks to it over HTTP). A separate workflow checks syntax, the WordPress coding standards and the zip, and runs a browser smoke test against a real WordPress.
- Deploy templates for Railway, Coolify, Dokploy, Umbrel and Kubernetes, next to the Docker Compose file: each runs the pinned release image with its data volume, the `/healthz` check and a longer grace period for draining, and generates the secret and the setup token where the platform can. `charts/trckable` is a Helm chart (one replica, a volume claim kept on uninstall, optional ingress, probes, your own Secret or a generated one). The release script moves the tag in each file with the version, and CI checks them (`scripts/deploy-check.sh`) when they change. How to set each up is in `deploy/README.md`.
- One AI & Search tab in Who came, where Sources' AI and Search tabs were, in three columns (stacked on a narrow card): Google (Search Console's searches and clicks as before; without Search Console, one Connect button), AI assistants (ChatGPT, Claude, Perplexity, Gemini, Copilot and the rest, with their visitors) and AI crawlers (the robots that answer for someone or collect training data, with their hits, and under them the pages they read most). A click filters like any other list: an assistant by its referrer, a page by that page, and a page filter narrows the robots' hits to it. In Full, and in Compact once Search Console is on; never on a share link. A page shows how often AI read it against how many visitors AI sent to it ("AI read this 400 times, sent 12 visitors"), worked out in one query for all the pages, and carries a small badge in two cases: No credit (read at least 10 times, sent nobody) and Not read (Google sent it at least 5 clicks and no AI crawler read it; needs Search Console, and only said once robots are being reported). The visitors' share of all visitors, the change against the period before and the daily line that the old AI tab had are gone. `GET /api/v1/sites/{site}/report/ai-search`.
- Crawler data without a server proxy: "Connect crawler data", from the empty crawler column (and from the Crawlers tab), is a sheet of three steps with this site's id, key and address in the code, for a Cloudflare Worker (reports after the page has gone, with `waitUntil`), Vercel middleware, nginx (its `mirror`, or a JSON log and a small jq and curl forwarder that also sends the status), Caddy (its JSON log, the same forwarder) and plain curl, all posting the four fields `/api/crawl` already reads. It turns the crawlers module on, and says when the first robot arrives. Nothing about a visitor is sent. The same setups are in the docs (AI & Search), and the code in the sheet is checked against the docs and against the server's own list of AI robots.
- A guide card on the first AI visitor or the first AI crawler, for a site of any age: one side card, at most one guide card a day, and never again once put away. Its action opens the AI & Search tab. `GET /api/v1/sites/{site}/report/ai-seen`.
- The weekly report has one line about AI when there was something: "AI assistants sent 128 visitors; crawlers read 2,340 pages." (or only the half that is not zero).
- Sign in with Google, Microsoft Entra or any OpenID Connect provider, free on every install. Set `OIDC_GOOGLE_CLIENT_ID` and `OIDC_GOOGLE_CLIENT_SECRET`, or the same for `OIDC_MICROSOFT_*` with `OIDC_MICROSOFT_TENANT`, or `OIDC_<NAME>_*` with `OIDC_<NAME>_ISSUER` for another provider (needs `TRCKABLE_BASE_URL`; a secret can come from a `_FILE`), and the sign-in screen gets a button for each. It is the authorization-code flow with PKCE (S256), `state` and `nonce` in a sealed 10-minute cookie, and the ID token is verified for issuer, audience, expiry and nonce. Someone signs in only when the provider verified exactly the email of a person already on the instance, and only after first-run setup made the owner; an unverified address is never matched, and the provider's own id for the person is kept at their first finished sign-in (the same email with another id is refused; an owner resetting their password, or `trckabled admin clear-sso <email>`, forgets it). Google's address counts for gmail.com and googlemail.com, or when `hd` names the address's domain. Microsoft's counts only for the directories you list (`OIDC_MICROSOFT_ALLOWED_TENANTS` for `organizations` or `common`; personal accounts and guests are refused) and only for a verified domain (the optional claim `xms_edov`, or for one directory `OIDC_MICROSOFT_ALLOWED_DOMAINS`). `OIDC_<NAME>_ALLOWED_DOMAINS` with `OIDC_ALLOW_SIGNUP=true` lets people from those domains create a viewer account at their first sign-in; otherwise nobody is created. An owner with two-step on is always asked the authenticator code after the provider, and so is everyone else who has it on, unless `OIDC_REQUIRE_TOTP=false`. After a sign-in only a path on this site is opened. Each sign-in is logged ("signed in with google"), the session remembers its provider, and Account says "Signed in with Google". If an owner added the person with a one-time password that is not yet replaced, their first sign-in with a provider ends that password and every session opened with it. A browser that signs in this way is remembered like one that signs in with a password. Sessions gain a column and a table (`sso_links`) on upgrade; nothing is rewritten.
- An "Online" widget for your own pages, in three modes: a pill ("12 online" with a pulsing dot), the pill with a 30-minute sparkline, and a card with the chart and the top pages or countries. It counts the last five minutes like the dashboard's Online, reads itself again every 30 seconds, and keeps people unidentifiable: under three it says "A few" and draws no chart, and a page or country shows only with three or more on it. Paste it as a frame, or float it in a bottom corner with one separate script, `/js/<widget id>.online.js` (under 1 KB gzipped, checked in CI; the tracker did not change): the visitor can close it, it is hidden in print and fades in only without reduced motion. Widgets also gain a name, a language (English, German, French, Spanish, Italian, Dutch, Portuguese, Albanian, or the visitor's browser), wording you can change per label (40 characters, shown as text only), and an Edit view with the real numbers, a light or dark page, and a mock page with the widget inline or in a corner; saving keeps the same id and code. Settings → Widgets lists each widget with a live thumbnail and a ⋯ menu (Edit, Rename, Copy embed code, Delete). The store gains a name, a language and the wording on upgrade; nothing is rewritten. Lazy: the first load did not grow.
- The Visitors tile says how many bots were filtered. Its tooltip gains one line, "1,204 bots and AI crawlers filtered", for the period you are looking at, so a number you doubt can be trusted: robots and scripts, AI companies' crawlers, headless browsers and (with stricter filtering on) data-centre visits that the ingest endpoint turned away. They were always left out of Visitors; now they are counted, by site, UTC day and kind, and nothing else: no user agent and no address is kept. The counts are written to the store once a minute and at shutdown (a crash can lose the last minute of them, never of visits), and a new table `bot_daily` is added on upgrade. Visits you chose to leave out (an excluded path, Do Not Track) are not counted as bots. The report answers with `bots` (`total` and per `kinds`: `bot`, `ai-crawler`, `headless`, `hosting`) for the period, except under a filter, where the line is not shown. Days are UTC, so a site far from UTC sees its first and last day shifted by the hours between.
- Filters can say "is not" and "any of". The Filter menu adds a second value of one dimension to the first ("Country is DE or AT"), and the "is" on a chip turns it into "is not" ("Device is not Mobile"); a chip is one dimension and one of those, with its own ×. From two filters on, the chips offer "Save as segment?", which is the saved views' dialog. In the address and the API a filter is `f=country:DE`, `f=country!:US` for is not, and the same dimension twice is any of: `f=country:DE&f=country:AT`. Different dimensions all have to hold, and "is not" keeps visits that have no value for it. A dimension takes at most 20 values. Addresses and saved views from before work as they did. The report, the CSV export, the other reads and shared links take the same words, and `segment=<id>` in a request adds a saved segment's filters (a segment belongs to its site; another site's id is refused). Saving a segment checks its filters. Lazy: the first load did not grow.
- Full view: three more small tabs inside the cards you already have, never a new card. Devices gets Browser version ("Chrome 130": the browser and its major version, read from the user agent) and Screen (the width of the window a visit began in: ≤640, 641–1024, 1025–1440, 1441–1920, >1920 px), and Locations gets Languages (named, "German", and filtering by its code). A click on a row filters like any other tab, they are in the Filter menu, and the CSV export carries them (`browser version`, `screen width`, `language`). The tracker did not change. Visits recorded before this release have no version and no width: the version reads Unknown and they are left out of Screen. The store gains two columns on upgrade; nothing is rewritten.
- The dashboard installs as an app. It has a web app manifest (name, the ghost icon, standalone window, dark and light theme colours) and a small service worker that keeps only the page and its hashed files, so an installed app starts without a network (the numbers need the server, so it then says it cannot reach it, with Try again). The API, the tracking script, shared pages and anything signed in are never touched by the worker: they go straight to the server, and nothing of them is kept. The worker carries the page's hash as its version, so every deploy replaces it and drops the old copy. "Install app" is in the avatar menu, only where the browser offers it (Chrome, Edge, Android) or on iOS, where it says how: Share, then Add to Home Screen; nothing is shown in the installed app itself. No banners, no push. The first load grew by under 0.5 KB.
- A new site starts with the weekly report and "tracking stopped" on, so the numbers and the one alert that matters reach the owner without opening the dashboard. They go to where the account's other alerts already go (a Slack or Discord webhook someone set up), else to the account's first owner by email when the server can send email (`TRCKABLE_SMTP_URL`, or `TRCKABLE_RESEND_KEY` where the host blocks SMTP, as Railway does, with `TRCKABLE_MAIL_FROM`). With nowhere to send them nothing is turned on and the dashboard offers the weekly email as a switch that opens Alerts. Sites that already exist keep exactly the settings they have: nothing is changed on upgrade. A site that has never had a visit is not sent a weekly report.
- The weekly report ends with up to three findings from the week, the same ones Highlights show and under the same floors on volume (a source that moved, the source that pays best per visitor, a page that lost buyers, a new referrer), and one link to the dashboard on that week against the week before. When nothing clears a floor there are no lines, and money lines come only when payments are connected.
- Every alert email carries a link that stops that one alert, in its last line and in the `List-Unsubscribe` headers mail clients use for their own Unsubscribe button (one click, RFC 8058). It works without signing in, is signed with a key only the server has, names one alert on one site, and opening it changes nothing: the page asks for one click, and the same page turns the alert back on. Needs `TRCKABLE_BASE_URL`.
- The first screen nudges an owner with two small cards that slide in from the bottom-right corner (a sheet at the bottom on a phone), one at a time, over the page and never moving it: Import your history (what the importer reads today, GA4's BigQuery export and CSV, and the command that runs it, with the docs) and Turn on the weekly email. They show when the first visit arrives and on a new site's install card; the close button or Escape puts one away, and one that was acted on or put away does not come back for that site (remembered in the browser). Reduced motion: they just appear. Lazy: the first load did not grow.
- `TRCKABLE_RESEND_KEY` sends alert emails through Resend's HTTPS API, for hosts that block outgoing SMTP.
- `TRCKABLE_PAYMENT_NOTICE_DAYS` (default 30; 0 keeps them): a payment provider's raw notice carries the payer's email, name and address, and trckable keeps it so the ledger can be rebuilt. Once a notice has been read into the ledger and is that old, its body is emptied each day (the row and its key stay, so a retry or a reconciliation still finds it, and a site with a shorter retention is held to that). The ledger keeps what it always kept: amounts, dates, ids and a keyed hash of the email. A notice that could not be read is not emptied: it may be the only copy of a payment. Because a rebuild can no longer see emptied notices, `payments reprocess` on a site that has some applies the notices that are left on top of the ledger instead of resetting it first, and says so. Off-site backups still hold what they held when they were taken, until they age out.
- The Data view shows the value that was already there, as moments on the chart (never on Live). Small markers sit on the main chart for what the server already finds: a spike of visitors (with the site that sent most of it), the days with the most sales (only where revenue is shown), a new referrer (on the day it first sent anyone), a page whose buyers fell away (on the day its buying rate fell), a milestone, and an AI assistant's first visit in the period. At most six to a chart, the most important first, and markers that land close together are one that says how many. Each is a button in the page's tab order with a shape of its own (never colour alone), says what it is in one line when pointed at or focused, and a click applies its filter (the source, the page, the day) through the address, so the tiles, the lists and the chart all say the same thing, and opens a side card with the numbers and one action (Share). On a phone the card is a sheet. They are lazy: the first load did not grow.
- One thing today: opening the Data view, one side card names the most important thing since your last visit (a page that lost its buyers, a spike, a source that moved, the source that pays best, a sale, a new referrer), with Next for the second and third, and See it, which applies its filter the same way a marker does. It is put away for the day with its close button, and a finding it has said is not said again for a week. It stays quiet on a site without enough data: a spike needs 100 visitors that day, and the other findings keep the floors they already have. The last visit is kept per person and site in this browser. Never on Live or on a shared link.
- Without payments, an owner sees a dimmed Revenue tile in the key numbers, where the money numbers will stand and as wide as the other tiles; it opens a card listing the five providers (Stripe, Lemon Squeezy, Polar, Paddle, Dodo Payments), each leading to Settings → Payments with its connect step open. Viewers and shared links see nothing there.
- In a site's first seven days, an owner gets at most one side card a day for something not yet used: Replay, Full, the weekly email, Search Console. Never for what is already used or set up, never again once put away or acted on, and not on a day the card above has something to say.
- `GET /api/v1/sites/{site}/insights`: a `new_referrer` carries `since`, the day it first sent anyone, and a `conversion_drop` the day its page's buying rate fell most. Spike moments from `/moments` carry `visitors`, and the site list carries `created_at`.
- The browser tab says who is on the site: while anyone is online the title starts with "● 8 · " and the icon carries a small green dot; at 0 both are as they were, and leaving the dashboard puts them back. A still dot and a plain title, so there is nothing for reduced motion to stop. It is on until Account → Appearance turns it off (kept in this browser).
- A sale arriving while you watch is a coin toast over any view, Live included (the Live layout is not touched): "Cha-ching! +$49.00". An optional chime (two short notes made in the browser, nothing to download) is off until Account → Preferences turns it on; turning it on plays it once, which is also what lets the browser play it later. A burst of sales is at most three toasts and one chime.
- Browser notices, opt-in, for the three things worth one while a trckable tab is open: the first sale from a source that had none in the period on screen, a spike in who is online (three times what that tab has seen, and at least five people), and tracking going quiet for six hours. After the first sale a tab sees, a side card asks "Get notified?" once; the browser's own question is asked only from its button, never on load, and the same switch is in Account → Preferences. With the tab in sight the notice is a toast instead. No push: a closed tab gets none.
- A milestone is reached with a short celebration: the ghost hops in the corner for about a second and a half (nothing at all with reduced motion) and a side card says what was reached, shows the card the server draws for sharing, and offers Share. It replaces the one-line banner at the top of the dashboard; the timeline still replays a milestone as that line.
- Sources and Pages (Core) show a 30-day sparkline for each of the top rows. They are asked for after the list has drawn, in one request for all the rows (`GET /api/v1/sites/{site}/sparks`, one grouped scan), so the report is no slower, and the room for them is kept so nothing moves when they arrive. Full has other columns and a shared link has none.
- The Visitors tile says how today (or yesterday) compares with that weekday's usual: "+18% vs usual", against the average of the same hours of the last four same weekdays (only the weeks the site existed for, and nothing below an average of five visitors). Its tooltip names the weeks. For This month, the same place says where it is heading, "≈ 41k by 31 Oct": a straight line from the days gone, once three have run. `GET /api/v1/sites/{site}/usual`.
- Referring sites in Sources carry their own icon, or their first letter in a tile. The browser never asks the site, or anyone else: this server fetches the icon once, through the same guard alerts use (public hosts only, every connection checked, size and time limited, SVG left out), keeps up to 300 in memory, and serves it from here (`GET /api/v1/referrer-icons`). A site with no usable icon is remembered for a day. Not on a shared link.
- Settings → Alerts: "Send me this week's email now" sends the last week's report to the address of the person who pressed it, three times a day at most, only where the server can send email, and without changing when the scheduled one goes (`POST /api/v1/sites/{site}/alerts/weekly/send`).
- Shortcuts: S switches site, U opens your menu, "," opens Settings, / opens Filter, Shift S shares and R plays or pauses Replay. Each presses the control that does it, so a key does nothing where that control is not on the page, nor while a field has the keys or a dialog is open. They are in the list (?) under "On a dashboard" and "Getting around", can be changed there with the same conflict check, and Shift S is now told from S (and Shift C from C) everywhere.
- Goals, funnels, Sources that pay, notes and alerts, when they have nothing yet, show the ghost, one short line and one action (Track a goal, Create a funnel, Payments settings, Add a note, Add where to send them) instead of a bare line.
- Changing the theme is a short crossfade of the whole page (about 200 ms) where the browser has View Transitions, and elsewhere the colours ease for the length of the switch only; with reduced motion it is instant. Nothing re-renders, so the charts do not redraw or re-animate. The saved theme is applied by a tiny script before the first frame (`/theme.js`), so a person who chose Light does not see a dark frame first.
- Side cards are one design now, and a card that holds several things is a deck. A card says what it is (an icon with its own colour from the dashboard's tokens, and its name), when it happened ("yesterday", the date on hover), its figure counting up, where it came from (a referring site's own icon from the server's cache, or its first letter; a channel's colour; a page's path), and a small chart of the moment that draws itself (a spike against its dashed usual, the days' money as bars, the rate before and after a drop, a source's own days, a milestone's climb). Several things in one card show where you are as dots with the next card peeking out behind, and turn with the ← → buttons, the arrow keys (with focus in the card: they are the page's own for the period otherwise) and a swipe. The actions are two or three words ("Show Sep 28", "Filter source", "Filter page", "Play week", "Turn on"). Cards spring in and out, and with reduced motion just appear; on a phone a card is a bottom sheet with a grab handle. A milestone, the one kind with a ghost in its corner, replaces the old banner. `SideCard` takes the kind, when, chart, deck and ghost as optional props, so a card without them looks as it did, calmer.
- "See it" on the one thing today always shows something. It used to do nothing when the address was already what it asked for, or when the day it names is outside the period on screen. Now it opens the month around a day the period does not reach, the card leaves, a toast says what is on screen ("Showing google.com · Sep 27") with Clear, the chart comes into view and the moment's marker lights up for a moment.
- Leave out your own visits: open your site with `?trckable=ignore` and that browser is not counted from then on; `?trckable=track` undoes it. The tracker keeps the flag in the browser, so it works behind the npm proxy and any other proxy. It stores something, so it does nothing in cookieless mode. Settings → Data & privacy has both links.
- Leave out your own visits, from where you are. The avatar menu has "Exclude this browser" for the site on screen: it opens the site with `?trckable=ignore` in a new tab (the dashboard is on another address and cannot set anything on your site itself), and then offers "Count this browser again", which opens `?trckable=track`. It cannot see your site's browser, so it only says what was last chosen from this dashboard, and the real state where the dashboard is served from the site itself. Not offered in cookieless mode. On the first day this browser sees traffic for a new site, one side card asks "Exclude your own visits?", under the same one-card-a-day rule as the others.
- Settings → Data & privacy → Exclude IP ranges: up to 50 addresses or ranges (`203.0.113.7`, `198.51.100.0/24`, `2001:db8::/32`), for a home or office. A visit from one is dropped before the address is looked up or hashed: it is not counted, not billed, not in any report, and nothing about it is kept. Only your own list is stored, in the site's settings (the store gains one column on upgrade). Behind the npm proxy or another trusted proxy the address is the one it forwards with the site's key. `exclude_ips` is on `GET` and `PUT /api/v1/sites/{site}/config`; a bad entry or a fifty-first is refused with a 400.

### Changed

- The dashboard's first load is 3.9 KB lighter (129.1 KB gzip, was 133.1), with nothing different on screen. The logo's font, which sat inside the first stylesheet, is a file of its own, asked for in the page's head beside the script so it is there before the logo is drawn; and Replay's clock and the arithmetic of its race (the tiles counting up, the lists overtaking) load when Replay starts, fetched as soon as its button is pointed at or focused.
- A server that is down for hours no longer loses the visits made meanwhile. A browser that counts with the cookie keeps what it could not send for 24 hours and up to 200 events (it was 30 minutes and 50), the oldest dropped first, and sends it when the server answers: on the next page or visit, when the browser comes back online, when the tab is shown, and on a pause that doubles from 2 seconds to about 4 minutes. After a failure it works through the queue oldest first and one request at a time, ahead of the page that found it, so a visit arrives in the order it happened. While the server answers, events go out as they happen, as before.
- The server dates a late event by the age the browser gives and counts it once. It takes an age of up to 25 hours (it was 30 minutes), so a visit made during an outage is stored on the day it happened, and refuses an older one with a 400 instead of putting it on a day it was never on. It remembers event ids for 30 to 36 hours (it was 30 to 60 minutes), also across a restart, so a resend is still recognised. That costs about 25 bytes an id in memory: under 4 MB for a site with 100,000 events a day. The total is capped at 8 million ids, about 200 MB, which is the most the old window could hold too; past it the window shortens and memory does not grow.
- The sessions of a visit that arrives late stay open for an hour after its last event arrives, so a visit that comes a request at a time is one visit. A visit the outage cut in two (its first page counted before, the rest after) is stored as two visits, every page view counted.
- Visitors counted without a cookie, or who have not answered the cookie bar, still have nothing stored in their browser. An event not delivered is sent again from memory, with longer and longer pauses, for as long as the page is open, and is lost if the page is closed first. A queue left by the earlier version of the script is not sent.
- The script stays under its 2 KB budget. To make room, its ids come from `Math.random` (about 52 bits, as many as before: an id has to be unique, not secret) instead of `crypto.getRandomValues`, which saved 42 bytes, and two small trims (an unused variable, a shorter pause formula).
- The side card floats clearly above the page in both themes: a raised surface a step lighter than the cards behind it, a crisp line, a layered shadow, and a darker, smaller deck peeking out behind it.
- A spike on a site whose usual is under ten visitors a day (or an hour, under two), or with less than a week behind it, no longer says "230.0× the usual": it is New traffic, told as the visitor count and the main source, in the chart's moments, One thing today, Replay and the busy-day alert (`GET /api/v1/sites/{site}/moments` and `/markers` leave `factor` out for it). Above that, a multiplier is rounded the same way in the dashboard, the weekly email and alerts: one decimal under ten (2.4×), whole numbers from ten (3×, 12×).
- Stricter bot filtering is on for a new site (and for a site that never saved the setting): visits from data centres such as AWS, Hetzner and Alibaba, and clients that name no browser, are dropped. Sites that already saved the setting keep what they chose, and Settings → Data & privacy still turns it off.
- "No comparison" now hides every change figure, not only the chart's dashed line: the arrows under the key numbers, the arrows beside the lists' rows, the "vs usual" chip, and the comparison row of the CSV export. Pick a comparison and they all come back, in the same words.

- The rings on the chart (a spike, a burst of sales) are now the markers above (a spike, and the biggest days of sales), and the quiet payments icon at the key numbers' end is the Revenue tile. `GET /api/v1/sites/{site}/markers` is still there for anyone who reads it.
- The cookieless salts keep two days on disk instead of three: today's and yesterday's, and making a new day's salt, or the daily pass, deletes the rest.
- In a site that routes by the part after `#`, that part is stored only if it looks like a route. A `key=value` pair, a query inside it, a second `#`, an address with `@` and a long opaque token (a JWT, a reset key) are dropped, so `#access_token=...` and `#/user/ann@example.com` no longer reach the stored path. A readable page name (`how-to-use-trckable-2026`) and a short numeric id are kept; the `#!/route` form keeps its `!`.
- The rate limiter keys every address with a hash seeded by a random value that exists only in the running process, and, with the next request that comes after a minute, forgets every address idle for ten minutes, whatever the size of its table. An instance that gets no requests at all keeps its table in memory until one does.
- The words about privacy say exactly what happens. The cookie bar reads "We count visits with one cookie and a short queue on this device. Nothing is shared." The paragraph for a site's privacy policy says the cookie holds a random id that counts as personal data, no longer says no data goes to any other company, says what the IP address is used for in memory (country, robots and floods, the daily number) and that it is never written down, and, with payments connected, names the payment notice (email, possibly name and address, 30 days) and no longer says nothing identifies the visitor. The README says the same, and the npm package's README gives the cookie's lifetime.
- Replay's playhead is a thin lime line that fades out towards the top, with a soft glow, in place of the white one. A small chip at its top names the moment ("Sep 14, 15:00" by the hour), the dot rides the line's own value with a ring around it, and what has not been played yet is drawn dim (30%) instead of left out, so progress reads at a glance. It moves smoothly, and steps from moment to moment with reduced motion. The playhead is a lazy chunk, so the first load did not grow. Until Replay reaches a first visit, the key numbers show a dash instead of 0, 0% and 0s.
- The comparison menu lists No comparison first, then Period before, Last year and Custom, with a check on the one in force (the small dashes before each choice are gone).
- Every control in the dashboard's header row is one height (38 px), with the same corners and the same gap: the site card, Live/Data, Ask and the avatar, and the capsules of a shared link. On All sites the picker is the same card as on a site's page. The Live card's title leads with the same pulsing dot as the switch (still for a person who asked for less motion). CSS only; the first load did not grow.

### Fixed

- The weekly email now goes out on its own. The check that a site has sent something read a site's last event and creation time as zero, so the scheduled report was skipped for every site and only "Send me this week's email now" worked. A site with no events at all is still not sent one.
- The Create menu opens inside the window when the page is scrolled down and its key is pressed: it sat above the top, out of reach.
- The moments on the chart are calmer. The markers sit on a thin lane above the plot instead of on the line, one a day at most, with the count of a day's other moments inside the marker (never a badge over the curve or a neighbour), and the chart tints the day the open card is about. With a card open, pointing at another marker only lights it: no line floats over the chart. The numbers agree: a moment's marker, its line and its card say one figure, which is the site's own for that day or hour and no longer changes when a marker's click filters the page (the moments used to be asked again narrowed by the filter, so the card, which kept the numbers it opened with, and the chart told different ones). The card has a quieter header (when it happened in plain type with the date in a tooltip, a header that cannot be selected), a short cluster list, and "See it" beside Share.
- The count on a chart marker where several moments landed together is 12 px, like the rest of the text on a phone (it was 10 px).
- Opening a marker that holds several moments no longer lists the same lines again and again. Milestones reached on one day (100 visitors, 10 countries, the first pageview) shared one id, and the list keyed by it was drawn over and over; each is now its own, and a milestone or moment told twice, by the server or by two requests, shows once, on the day it was first reached. The card lists at most three others, the milestones together in one row ("4 milestones", the list on tap) and "+N more" opens the rest in place, and it is never taller than 60% of the screen: the list scrolls inside it, and the figure and Share stay.
- A browser that blocks cookies is counted without one, not as a new visitor on every event. The script used to make a new id each time it found no cookie, so pageviews, a click and a goal were three visitors.
- Behind the npm package's same-origin proxy, the visitor id is made in the browser and set by the script at once, so a click that leaves before the first answer (a checkout link) is the same visitor as the page, not a second one. The server sets the same id again as its own cookie, so Safari keeps it 400 days.
- A script loaded twice on one page (the tag and the npm package, or two bundles) counts once. Each copy used to send its own page view and patch the history again, so a page was two or three.
- A query that changes on the same path (a search box synced to `?q=`, a filter, `router.replace('?page=2')`) is not a new page. A page is a new path, or in hash mode a new `#/route`; the rule is the one Plausible uses. Back and forward, the bfcache and `trckable('pageview')` still count.
- A page read for longer than 30 minutes (a long document, a video) keeps its time. Its engaged time arrives when the tab is hidden, long after the visit's last event, and used to open a session with no page view, which was dropped with the time in it; the original session stayed at 0 engaged ms. It now joins the open session its page view belongs to, also after a restart. A page read past the hour the server keeps sessions open is still not credited.
- Events sent without a cookie (cookieless mode, or a visitor counted before they answered the banner) are tried again from memory, twice, with the same id, so a deploy or a dropped connection no longer loses them. Nothing is written to the browser.
- The npm proxy passes the browser's Do Not Track and Global Privacy Control headers on, so a site that honours them no longer counts those visitors behind the proxy.

### Security

- `proxy()` in the npm package refuses to forward without a proxy key and answers `500` with what to set (`TRCKABLE_PROXY_KEY`, or `{ proxyKey }`). Forwarding without it made every visitor arrive from the proxy's own address: one visitor, one country, one rate limit for everyone. `npx trckable doctor --proxy` (also run when `TRCKABLE_PROXY_KEY` is set) checks that the key is there.

## 0.5.8 (1 Oct 2026)

### Added

- The Data view says more about what happened, all from numbers trckable already has, and the extras are lazy (the first load did not grow). On the chart, rings mark a spike of visitors (with the site that sent most of it) and a burst of sales, at most three, each saying why in one line when pointed at or focused; the rules are tested (a spike is a bucket with at least 10 visitors and at least 3× the mean of the same bucket over the seven days before; a burst is at least 3 sales and twice the median of the buckets that had any, from three such buckets). The chart's head carries one quiet line, "On pace for ~9,400 this month", for visitors or revenue: this month's whole days so far spread over the days of the month, nothing before three whole days. Compact has both.
- In Full, Who came opens with a Highlights tab: up to four lines about the period against the one before it, each a button that applies its filter: the channel that moved most, the channel that earns most per visitor, an entry page whose buyers fell away, a new referrer. Each rule has a floor on volume, and the tab is not there at all when nothing clears it. Sources has an AI tab: visitors from AI assistants, their share of all visitors, the change, a line for the days, and ChatGPT, Claude, Perplexity and the rest one by one.
- What they did, with revenue on: Top earners is now Sources that pay, with revenue per visitor and the change in revenue on each row, and the Closed it | Found them switch (last touch or first touch) as before; Pages that sell shows the revenue credited to visits that read each page (a sale counts under every page of its visit); Latest buyers lists the last sales with the path to each (where from, the first pages, how many visits in the 90 days the report looks back, how long since they were first seen, how long ago), read the way the report credits a sale (its filters, first or last touch, test payments), never a name, an email or an id. Highlights compare a period still running with the same elapsed time of the one before, so today so far is set against yesterday so far.
- `trckabled restore s3:` restores straight from the off-site bucket in `TRCKABLE_BACKUP_S3`: `s3:` alone takes the newest backup, `s3:<name>` a given one. The file is downloaded to a temporary folder and removed after the restore.
- A share link can be copied again: each row in Settings → Sharing has Copy and Open. The link is kept sealed with the instance key (the one that protects payment provider keys), so a copy of the database alone cannot read it; a password link still needs its password, which is never kept in the clear. A link made before this has no address to copy: its row offers New address, which asks first, because the old address and the sessions opened through it stop working at once. If the instance key is missing or changed, a row falls back to New address and nothing fails. A row can also make a new address for a link that has one (a quiet icon after Open, asking first, at most ten times in ten minutes per site), so a link that got out can be replaced; its name, settings, password and history stay. A link opened at the moment its address was replaced no longer gets a session with the old one. The sealed address is bound to its link. Without `TRCKABLE_SECRET`, the key is the `secret.key` file in the data directory, so a copy of the whole data directory (database and `secret.key`) yields working share URLs: keep backups as private as the instance.

### Changed

- Every key number has a small mark before its name (Visitors, Pageviews, Revenue, Conversion, Per visitor, Bounce rate, Session time; Online now keeps its live dot), and a site with no payment provider connected shows a quiet dollar icon at the strip's bottom right, for an owner (not on a shared link), that opens Settings → Payments. It sits in the free room only: where the tiles wrap, it is hidden. The marks load after the first paint, so the first load does not grow.
- The key numbers keep one tile width: without payments, the five tiles are as wide as they are with Revenue, Conversion and Per visitor, and the free room sits on the right instead of stretching them across the row. Tablet and phone layouts are as before.
- Yesterday is in the date picker's quick list, right after Today (Now, Today, Yesterday, Last 7, 30 and 90 days, then More), no longer under More. `?period=yesterday` and the Y key are as before; it compares with the day before, and ← → step a day at a time.
- What goes wrong is said in a toast, not in red text under a form. A toast has a mark for each kind (success, info, warning, error), at most three show at once, it can be closed, it clears itself (an error stays longest, and stays while it is pointed at or focused), and it may carry one button such as Retry. Errors and warnings are announced at once to a screen reader, the rest politely. A failed request says a few friendly words ("Something went wrong", "Can't reach the server", "Not allowed", "Too many tries"), never the server's own text; what is wrong with a field (a domain, a wrong password, an empty name) stays under the field, short.
- Over time and New vs returning are one tab with two small ones, and Search (Google's queries) stays a small tab of Sources once Search Console is connected. Left out on purpose: a strip of "what changed" chips under the key numbers (Highlights, a tab, replaces it), a monthly goal with a meter (the pace line is the only month figure), and a first-touch against last-touch table (that is the Closed it | Found them switch on Sources that pay).
- Every dialog follows one pattern. The head is the title and at most one short line, with a small ? tooltip for anything longer; choices (the four ways to track a goal) are a grid of equal cards with an icon, a label and a hint, one radio group you move through with the arrow keys; fields have their label above, one height, and their error right under them; each step has exactly one primary button, bottom right, beside a quiet one. The padding, radius and gaps are the same everywhere and the empty band under the buttons is gone. Dialogs fade and scale in and out in 160 ms (not at all with reduced motion), focus moves in and returns, and on a phone every dialog is a bottom sheet. Track a goal lists the goals already set up as small rows with a check above the form, and its words are shorter throughout.
- The card at the bottom of Compact ("That's the whole story on one screen") is gone. A small Full button with its key sits at the end of the first card's tabs instead, with a tooltip saying what Full adds; ⋯ still has Full view.
- On a desktop, the filters in force (as chips), Save view and Views sit on the left of the date row, packed at its start, and the two capsules keep the right. Tablets, phones and a shared link's header keep the row under the date row.
- A dialog with tabs or steps (Track a goal) ends at its own content: switching tabs eases to the new height instead of keeping the tallest tab's height, which left an empty block under the buttons on the shorter ones.
- On All sites, every site has a colour of its own that follows the site, never its rank: the n-th site of the account always has the n-th colour of the chart palette, in the chart, its key, the hover card and the rows. Past the palette's seven colours, the rest are one grey "Other sites" band, so no two sites share a colour.
- A person's account and role now live in a membership (two new migrations; the database keeps a copy of each upgrade first), the first step toward one person belonging to more than one account. Nothing changes on an instance with one account: every person keeps their account, role and site limits. One rule is new: the first owner of an account cannot be removed or made a viewer by another owner (`trckabled set-role` and `remove-user` on the server still can), and an owner cannot reset the password or turn off two-step for someone who is in other accounts too.
- A site that has had visits opens in Live when the address names no view: the dashboard of a site that is getting traffic now starts with who is on it. A site with no visit yet still shows its install card, and an address with a period, filters, Full or `?view=data` stays Data, so links made before keep working. Choosing Data is kept in the address, so a reload stays in Data.
- Fewer redundant backups. A start writes its backup ten minutes after boot only if the newest backup is more than twelve hours old, none exists, or the last backup or the last off-site copy failed; after a skip the next one is due 24 hours after the newest, so a redeploy every few hours still gets one backup a day. Off-site, every copy is kept for 7 days, then the newest of each UTC day, up to `TRCKABLE_BACKUP_KEEP_DAYS` (default 30), and the rest is deleted. The newest copy is never deleted, and nothing is when the bucket's listing fails or looks partial.
- Phones are bigger and easier to use, on screens up to 640 px wide only (a tablet and a desktop look exactly as before). Text is 16 px (15 px for the smaller lines) and nothing is under 12 px; icons are 20 px; every button, tab, chip, toggle and list row is at least 44 px (list rows 52 px), and a small icon keeps its look inside a finger-sized box. The header is two clean rows (the site with room for its name, then Live | Data, the period as "30 days" and ⋯); on a narrow phone the site's settings are the first row of the site list. The key numbers are two columns, the milestone line is one line, and the site list, the ⋯ and avatar menus, the filter, saved-views, comparison, timezone and currency lists and the calendar rise from the bottom edge with a grab handle and rows 48 px tall. A tap on the chart pins its card where the finger was, and a tap outside lets it go. One set of sizes (`--ph-*`) in one place (`dashboard/src/phone.css`), the rules of screens that load later in their own files.
- The charts inside the two tabbed cards are tidier, in the same look as the main chart. The funnel and visit to sale are a vertical funnel: a row a step (number, name cut to one line with the full path as its tooltip, count, and the share of the step before), a bar whose width is its share of the first step, and "−93% · 1,452 left" between steps; the steps are one line of quiet chips, and two steps get taller bars instead of empty space. Page flow has thin accent nodes, ribbons coloured by the page they leave (the channel palette in a fixed order, a page keeping its colour in every column), "Other pages" as a hatched node no taller than the busiest page and "Left the site" as a small red one, each with its count in a name chip, and the columns are Entry, 2nd page and 3rd page; pointing at a node or ribbon lights its path and quiets the rest, and on a phone the chart scrolls sideways inside its box. Every chart has one head: its key on the left, a Chart | Table switch on the right; hover cards share the main chart's look, axis labels are at least 11 px, and time to convert writes its counts over the columns. Numbers are unchanged.
- On a phone every list row in the two cards uses the card's full width: the name on the left, the numbers right-aligned at the inner edge, the thin bar under the whole row, and the column heads on the numbers. An empty Goals tab is one short line and the "+ Track a goal" button.
- Under the chart there are two tabbed cards, in Compact and in Full, instead of a row of four cards and then a grid of more. Who came: Sources (channels, referrers, UTM), Pages (entry, top, exit), Locations (countries, cities, and the map) and Devices (devices, browsers, systems). What they did: Goals and, with revenue on, Top earners. Full adds tabs to both, each one of the cards it had before: over time, new vs returning, hours, the revenue map and crawlers beside who came; funnel, visit to sale, time to convert, page flow, retention, people and web vitals beside what they did. The tab you picked is remembered for each site and card, the arrow keys, Home and End move between tabs, a row of tabs wider than its card scrolls sideways, and on a phone the two cards stack.
- Every list is lighter: a thin line under each name that grows with its share, the numbers in mono, a small ▲ or ▼ for how the row moved against the period before, and its share of the whole when you point at it.
- Retention is a cohort table: the week people first came in the rows, the weeks after across, the first column their number (not 100%), one ramp of the accent for the cells, a dot for a week not over yet, and a small curve of the average above. With under two whole weeks of history it says how many came back the next week in one line. The funnel leads with its result ("6.3% made it"), one thin bar a step, and what was lost between steps. People shows a face in the colour of the source, the page they came in on, where from, pages and minutes, and how long ago, with how many are online in the head.
- The main chart is one clean line: two pixels, a soft fill, no glow; the period before a faint dashed line; today dotted, with a ring at its end, and "so far" in its hover card, which also says how it stands against the period before (▲ or ▼ and what it was). Notes are small flags on the time axis, not dots that look like data.
- The main chart shows the whole period you picked, even for a site younger than it: the days before its first visit are a faint dotted baseline instead of the chart being cut off, and the "since" label and its "Show since" link are gone. The numbers are the same.
- The "More numbers" row under the key numbers is gone.
- Faster to open and to switch: the dashboard's script, styles and every JSON answer over 1 KB are compressed on the wire (gzip; the dashboard's files are stored compressed once at build time, the image keeps one copy of each, and a client that does not take gzip is sent them unpacked; live streams are never buffered). A shared link asks for its session and its first report the moment the script runs, and so does a signed-in dashboard for the site the address names, instead of waiting for the page to render first.
- Picking a period shows what was read for it before at once, however old, and refreshes it in the background; a period that is over is kept for two minutes instead of ten seconds. Opening the period list starts fetching Today, 7, 30 and 90 days, so the pick is already there. Any change to a site's settings, payments or data drops what was kept for it.
- The server keeps a report for a period that has ended for hours instead of ten minutes, and drops only what a change can reach: a late or repeated visit, a refund, a new exchange rate, a zone, currency or setting change, or a retention delete. Its numbers are checked to be the same as a fresh read.
- A shared link keeps its address (`/s/<token>`) after it opens, so it can be copied, bookmarked and reloaded; a reload, including of a password link, goes straight back in while the session lasts, and a shared page sends no Referer.
- A shared link's header starts with the site's own mark (its icon, or its initial), served by the instance itself through the link's session, before the site's name.
- A shared link's header is one row on a desktop: the site's name on the left, the period, comparison and ⋯ on the right.
- On a desktop the Live | Data switch is in the header's right group, before the account; a phone or tablet keeps it in the row under the header.
- The site switcher's rows have a little more air on a desktop (4 px taller, the mark a bit further from the name). Dragging a site is now live: a grip shows at the row's edge, the row you hold lifts and follows the pointer, the others slide aside into the new order, dropping saves it, and Esc puts it back.

### Security

- The Docker image runs as an unprivileged user (65532) instead of root. A new Docker volume needs nothing. A volume an older image filled as root, or a bind-mounted folder Docker made as root, needs `chown -R 65532:65532` on it once; on Railway, which mounts its volume as root, set `RAILWAY_RUN_UID=0` on the service. When trckable cannot write to its data folder (or to the `wal`, `backups` or `geo` folders in it) it now stops at start and prints the fix for your case, instead of failing on the first database error.
- Behind a reverse proxy with `TRCKABLE_TRUST_PROXY` left on its default, the log now says once what to set; setting it remains the real fix. Sign-in limits changed so that nobody can lock the owner out. A wrong password (or a wrong two-step code) counts against three limits: the address (10 in ten minutes, 100 when every visitor looks like one private proxy address), the account on that address (10), and the account from every address together (100). A right password never counts, and slots are taken before the password is checked, so a burst of guesses cannot slip past. When a limit is used up, that sign-in is refused (429, even with the right password) until ten minutes after the oldest wrong password. Someone guessing from one address blocks that address from the account, not the owner anywhere else. If guesses from many addresses use up the account-wide 100, a browser that signed in to the account before (it holds a cookie with a random id, kept hashed, forgotten when the password changes or is reset) still gets in with the right password; any other waits out the ten minutes, or the owner runs `trckabled admin reset-password <email>`, which now also clears the sign-in counters of the running server within seconds. A share link's password takes 20 wrong tries in ten minutes from all addresses together, counted the same way.
- `/metrics` is off (404) unless `TRCKABLE_METRICS_TOKEN` is set, and then needs that token as a bearer token. It used to be open to anyone who could reach the server; a scraper needs `Authorization: Bearer <token>` (Prometheus: `authorization: { credentials: <token> }`). `TRCKABLE_API_TOKEN` does not open it.
- `/readyz` and error answers (HTTP 500) no longer carry the database's or the system's own words, only which part is failing; the detail goes to the log. `/_trckable/whoami` no longer has its debug mode.
- The sites a share link may be embedded on accept only a plain host (https, or http for localhost), and the cookie bar's privacy link only an https address (http for localhost) or a path on the site, such as `/privacy`. Alert webhooks are https only. Values saved before are checked again when used.

### Fixed

- Track a goal → In HTML shows goal properties as `data-trckable-goal-plan="pro"`, the attribute the tracker reads (it showed `data-trckable-plan`, which counted the goal without its property). `npx trckable` points to your account → API keys, where keys are made, not Settings.
- The chart's hover card no longer comes up without its lines (pageviews, new vs returning, bounce) when it opens in the moment the code that writes them arrives: it draws once more as it starts listening for it.
- The chart's line runs across the whole period, along zero on the days before the first visit, instead of starting where the data does.
- While the dashboard starts, the page shows its own background and a thin loading line, instead of a blank page (which Safari on iOS fills with a large copy of the site icon).
- The sites popover in People stays inside the window when sites are added while it is open, and a long domain is cut short instead of scrolling the list sideways; the chart's hover card fills in if the pointer was already on it when its numbers arrived.
- The page no longer shifts while the first numbers load: the chart, its revenue plot and the key numbers keep the room they will take. Bars and their figures settle in about a tenth of a second, and rows no longer slide to new places.
- The pulsing dot beside Online now is no longer cut off at its edge.
- A dashboard tab left open across an update no longer goes black. A file of the old build that is no longer there (a script the date picker asks for, say) used to be answered with the page itself, which a browser refuses as a script; the server now answers 404, plain text, never kept, and the dashboard reloads itself once, on the same address (period, filters and the number on the chart stay), and never twice in a minute. Changing the period with the pointer resting on the chart no longer throws either: the picked day is let go of when the new period has fewer days. A chart or the two cards under it that cannot be drawn now say so in their own place ("Couldn't draw this.", with a Reload), and anything else that breaks shows the same line instead of a black page.

## 0.5.7 (30 Sep 2026)

### Changed

- Widgets have their own section in a site's settings, next to Sharing: they go on your own pages, so they no longer sit under share links.
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
