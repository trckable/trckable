=== trckable – Private, Open-Source Analytics ===
Contributors: adudija
Tags: analytics, privacy, cookieless, statistics, self-hosted
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

The only analytics you need. Private, free and open source.

== Description ==

trckable counts visitors without following them. It sets no cookie in its cookieless mode, stores no IP address, and the numbers are yours: run it on your own server for free, or use the hosted version.

This plugin adds trckable's tracking script to your site and nothing else. It does not bundle the script: the browser loads it from your trckable server, so the tracker is always the version your server runs.

* A branded settings page with a first-run card, a choice of server (trckable Cloud, or your own), and a live preview of what you will see.
* Cookieless switch: no cookie, no banner needed.
* Admins and editors are left out of the numbers (on by default), and so is any role you pick.
* Optional first-party proxy: the script and the events go through your own domain, so blocklists do not see them and every visitor keeps their own country.
* Dashboard widget: visitors today and who is on the site now, with a read-only API key.

= Free and open source =

trckable is open source, and so is this plugin. Questions: support@trckable.com. Install guides: https://docs.trckable.com/install/platforms/

== Installation ==

1. Upload the plugin and activate it, or install it from Plugins, Add New.
2. Open the new trckable menu. The first-run card asks where your trckable runs: trckable Cloud, or your own server (then its https address).
3. In trckable, open Settings, Install, and copy your site ID (it starts with `tkb_`), and paste it. Check connection tells you whether the server knows it.
4. Visit your site in a private window. With a read-only API key the page shows the first visit arriving.

== Frequently Asked Questions ==

= Where do I find the site ID? =

In trckable, Settings, Install. It starts with `tkb_`.

= Does it use cookies? =

By default trckable sets one first-party cookie to tell returning visitors apart. Turn on Cookieless and it sets none.

= Why are my own visits missing? =

On purpose. Logged-in admins and editors are not counted, and you can leave out more roles. Open the site in a private window to see your own visit.

= What does the proxy do, and should I turn it on? =

It sends the script and the events through your own domain. Browser extensions and DNS blockers that block known analytics addresses then do not see them, and the visitor's address still reaches your trckable server, so countries stay right. It needs the proxy key from trckable, Settings, Install. It forwards exactly two things, the script of your site and one event per request, and nothing else.

= Does it work with page caching? =

Yes. The script tag is the same for every visitor. Logged-in people usually skip the page cache, which is also why they are left out of the numbers.

= Does it track WooCommerce sales? =

Not in this version. Revenue is connected in trckable itself, with your payment provider.

= Is it GDPR compliant? =

trckable stores no IP address and, in cookieless mode, nothing in the visitor's browser. Whether you need a notice depends on your country and your setup; this is not legal advice.

= Where do I get help? =

Write to support@trckable.com, or read the install guides at https://docs.trckable.com/install/platforms/.

== Screenshots ==

1. The trckable page: status, the site, the server, the switches, and a live preview with the tag that is added.
2. The dashboard widget: visitors today and who is on the site now.
3. The trckable dashboard.
4. The switches and the preview that follows them.
5. The first-run card: where trckable runs, the site ID, the first visit.

== Privacy ==

The plugin stores its settings in your database, in one option. It sets no cookie of its own and collects nothing itself.

What the tracking script collects, and where it goes, is described under External services. In cookieless mode nothing is stored in the visitor's browser. trckable keeps no IP address: it is used in memory for the country and bot checks and is never written to disk.

Deleting the plugin removes its settings.

== External services ==

This plugin connects to a trckable server, the analytics service it is built for. You choose it on the trckable page (the first-run card, or the Server card later): "trckable Cloud" is `https://cloud.trckable.com`, run by trckable; "My own server" is the address of a trckable you run yourself, and then no data goes to us. Nothing is sent anywhere until a site ID is set. The Check connection button asks the chosen server for its script and whether it knows the site ID; it sends no visitor data.

**The tracking script** is loaded from the server in the visitor's browser (or through your site, with the proxy on). For each page view it sends the server the page address, the referrer, the screen width and the browser language. The server also receives the visitor's IP address with the request, uses it for the country and to filter bots, and does not store it. Without Cookieless it also sets one first-party cookie, `trckable_vid`, to recognise returning visitors.

**The proxy (optional)** receives the script and the events on your site and forwards them to the server, adding the visitor's IP address, user agent and the proxy key you entered.

**The trckable page and the dashboard widget (optional)** ask the server, from your site's server, for who is online, visitors today, the last seven days and the top pages, using the read-only API key you entered. Without a key the preview shows sample data and nothing is asked. Nothing about your visitors is sent.

Terms of service: https://trckable.com/terms/
Privacy policy: https://trckable.com/privacy/

== Changelog ==

= 1.0.0 =
* First release.

== Upgrade Notice ==

= 1.0.0 =
First release.
