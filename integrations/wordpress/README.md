# trckable for WordPress

The plugin adds the trckable script to a WordPress site. It lives here until it
has a home of its own; `trckable/` is exactly what goes in the zip.

```
trckable/            the plugin (trckable.php, includes/, uninstall.php, readme.txt, license.txt)
assets/              wordpress.org directory assets: banners, icons, screenshots
build.sh             builds trckable.zip
phpcs.xml.dist       the WordPress coding standards, with PHP 7.4 and WordPress 6.0 as the floor
tests/setup.sh       a throwaway WordPress for the tests (PHP's server, SQLite)
SUBMIT.md            how the plugin gets into the wordpress.org directory
```

## What it does

Settings → trckable takes the site ID and the server (a self-hoster puts their
own address there), a cookieless switch, and leaves logged-in admins and editors
(and any role you pick) out of the numbers. The tag is the documented one,
enqueued in the head with `wp_enqueue_script` and deferred (the `strategy` of
WordPress 6.3 and later, an attribute before that): `data-site`, and
`data-cookieless` when the switch is on. No tracker code is bundled; it loads
from the server.

Optionally the script and the events go through the site itself, so that a list
that blocks analytics hosts never sees them and every visitor keeps their own
address. Two REST routes exist, and nothing else is ever forwarded:

```
GET  /wp-json/trckable/v1/js/<site id>.js    the site's script, kept for an hour
POST /wp-json/trckable/v1/e                  one event, at most 16 KB, a JSON object for this site
```

The event is sent on with `X-Trckable-Proxy-Key` and `X-Trckable-Client-IP` (the
address as the platform in front of the site reports it: Cloudflare, Netlify,
Fly, `X-Real-IP`, `X-Forwarded-For`, then the connection), the user agent, and
Do Not Track / Global Privacy Control when the visitor sent them. Only the
`trckable_vid` cookie of the answer is handed on. Behind a CDN or reverse proxy
that overwrites those headers they are exact; on a site reachable directly a
visitor could forge them, which only skews their own country. The
`trckable_client_ip` filter replaces the address.

A dashboard widget shows visitors today and who is on the site now, from a
read-only API key (`GET /api/v1/sites/{site}/report`), cached for a minute.

## Develop

```sh
cd integrations/wordpress
composer install                  # phpcs, the WordPress standards, PHPCompatibilityWP
vendor/bin/phpcs                  # must be clean
./build.sh                        # trckable.zip
tests/setup.sh /tmp/wp            # a WordPress with the zip installed (needs php, wp, curl, unzip)
cd ../../e2e && WP_DIR=/tmp/wp pnpm exec playwright test -c wordpress/wordpress.config.ts --project=chromium --workers=1
```

The smoke test runs against that WordPress and a small stand-in for the trckable
server (`e2e/wordpress/mock-trckable.mjs`), and checks that the tag is there for
visitors and not for admins and editors, that the cookieless switch sets the
attribute, that the proxy forwards the script and events with the key and
refuses everything else, and that the widget shows the numbers. CI
(`.github/workflows/wordpress.yml`) runs all of it, plus Plugin Check, when this
folder changes.

## License

The plugin is GPL-2.0-or-later, which the wordpress.org directory requires; the
full text is `trckable/license.txt`. The server and dashboard in this
repository are AGPL-3.0 and the tracker is MIT. They do not conflict: the plugin
shares no code with the server and only talks to it over HTTP, and GPL
version 2 or later code may be combined with AGPL-3.0 code in any case (GPL
version 3, section 13). What is in this folder is under the plugin's license, not
the root one.
