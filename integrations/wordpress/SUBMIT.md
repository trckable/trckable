# Submitting trckable to the wordpress.org plugin directory

Everything is prepared; the submission needs a wordpress.org account, so it is
done by hand. Nothing here runs by itself.

The plugin name must be submitted exactly as it is in the plugin header and
`readme.txt`: **trckable – Private, Open-Source Analytics** (with the en dash).
The directory address (the slug) is taken from that name at submission:
`wordpress.org/plugins/trckable/`.

## 1. An account

Log in at https://login.wordpress.org/ or register there. The account you
submit from owns the plugin at first, and its username is the one in
`readme.txt` (`Contributors: adudija`). The reviewers write to the account's
email address, so use one that is read.

Optional, and recommended: make a second account for the company, for example
`trckable`, with support@trckable.com. After the plugin is approved, add it
(step 5) so that the plugin page lists the company, not a person. The page
shows the plugin name, the author field of the plugin header (`Trckable`,
https://trckable.com) and the contributors; the author field already says
Trckable.

Turn on two-factor authentication on every account that can commit: it is
required for commit access.

## 2. Upload the zip

Build it from a clean checkout of the branch you are releasing:

```sh
integrations/wordpress/build.sh        # integrations/wordpress/trckable.zip
```

The same zip is attached to every run of the `wordpress` workflow
(artifact `trckable-zip`). Upload it at
https://wordpress.org/plugins/developers/add/ and send it. The automatic
check runs at once; fix what it reports (Plugin Check is clean for this plugin)
and upload again.

## 3. Answer the review

A volunteer reviews the plugin by hand and writes to the account's email. Reply
to that email (not a new thread), with the zip attached again if you changed
anything. Expect about one to two weeks for the first answer (the submission page shows
the current queue), and a few days for each reply after that. Do not resubmit while
you wait.

What reviewers send plugins back for, and where this one stands:

| Common reason | This plugin |
| --- | --- |
| Not GPL-compatible, or no license stated | GPL-2.0-or-later: plugin header, `readme.txt`, `license.txt` |
| Calls an outside service without saying so | `readme.txt` has an External services section: names the trckable server, what is sent, when, and links the terms and privacy policy |
| Loads code from a remote server | It loads the tracker script from the configured server by design. It is the documented use of the service, it is disclosed in External services, and a self-hoster loads it from their own server. If a reviewer asks, the answer is that the script is the service's client and is served by the site owner's own chosen server, as with any analytics plugin |
| Missing escaping, sanitizing, nonces or capability checks | Settings API (nonce) plus `manage_options`; every output escaped; every input cleaned. Plugin Check and WPCS are clean |
| Generic function, class or option names | Everything is prefixed `trckable` / `Trckable_` |
| Admin pages that nag or advertise | None: one Settings page and one dashboard widget, no notices |
| Trademark or name issues | The name is the product's own |
| Wrong readme (contributors, tags, short description, stable tag) | `readme.txt` follows the validator: five tags, short description under 150 characters, Stable tag equals the version |
| Bundled libraries, minified code | None |
| Data left behind | `uninstall.php` removes the option and the cached answers (every site of a network) |
| `Tested up to` out of date | 7.1 at submission. Raise it, and the readme, whenever a new WordPress ships |

## 4. After approval: SVN

Approval email gives the repository, `https://plugins.svn.wordpress.org/trckable/`.
It starts empty (`trunk`, `tags`, `assets`).

```sh
svn checkout https://plugins.svn.wordpress.org/trckable/ trckable-svn
cd trckable-svn

# the plugin, as it is in the zip
cp -R /path/to/trckable/integrations/wordpress/trckable/. trunk/
# the directory assets: banners, icons, screenshots (not part of the zip)
cp /path/to/trckable/integrations/wordpress/assets/*.png /path/to/trckable/integrations/wordpress/assets/icon.svg assets/

svn add --force trunk assets
svn cp trunk tags/1.0.0
svn commit -m "trckable 1.0.0" --username <your wordpress.org username>
```

The first commit asks for your wordpress.org password (or an SVN password from
your profile). The page, its screenshots and the zip appear within a few
minutes. `readme.txt` in `trunk` and in `tags/1.0.0` must both say `Stable tag: 1.0.0`.

Screenshots are matched to `== Screenshots ==` by number: `assets/screenshot-1.png`
is item 1, and so on. Banners and icons are matched by name.

## 5. Add the company account (optional)

Plugin page, Advanced, or the `Contributors` line of `readme.txt`: add the
company's username to `Contributors` in the next release. To let the company
account commit, open the plugin's admin page on wordpress.org (Advanced, then
Committers) and add it by username. It needs two-factor authentication too.

## 6. Every later release

1. Change the version in three places: `Version:` in `trckable.php`, the
   `TRCKABLE_VERSION` constant next to it, and `Stable tag:` in `readme.txt`.
   `build.sh` refuses to build when they differ. Add a `= x.y.z =` entry to the
   readme's Changelog, and raise `Tested up to` when WordPress has moved.
2. Merge it, build the zip, and check it (`vendor/bin/phpcs`, the smoke test,
   `wp plugin check trckable`) or let the `wordpress` workflow do all three.
3. Put the new files in `trunk` and tag the release. From the SVN checkout:

   ```sh
   svn update
   rsync -a --delete /path/to/trckable/integrations/wordpress/trckable/ trunk/
   svn status                       # review: svn add new files, svn rm removed ones
   svn cp trunk tags/1.1.0
   svn commit -m "trckable 1.1.0"
   ```

   Only change `Stable tag:` to the new version after `tags/1.1.0` exists: the
   directory serves whatever `Stable tag` names, from `tags/`.
4. A changed banner, icon or screenshot goes in `assets/` alone, with its own
   commit; it needs no release.
