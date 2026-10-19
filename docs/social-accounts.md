---
title: "Social accounts (Channels)"
description: "See the views of your own YouTube, Instagram and Threads accounts beside your sites: what is read, what is kept, and how to create the app keys on your own server."
---

Channels, on the All sites page, shows how many views your own YouTube channel, Instagram account and Threads profile got, next to your sites. Each platform has its own card, with its views over the period you pick, a small trend and how many accounts are watched.

The platforms count differently (a play, a view and an impression are not the same thing), so the numbers are never added together. Each card is that platform's own count.

## What is read and kept

- **Read-only.** trckable asks each platform for the one analytics permission it needs and nothing it could change.
- **One number a day.** For each account, the views of each day. Nothing else about your posts or audience is stored.
- **Tokens are sealed** with your instance key (`TRCKABLE_SECRET`), never logged and never sent to the browser.
- **Disconnecting deletes.** The account's access and every number stored for it go at once, and the platform is told where it can be.
- **Stale data is deleted.** YouTube requires data to be refreshed at least every 30 days. If an account cannot be read for 28 days, its numbers are deleted and the card asks you to connect it again.
- **Who.** Everyone who sees the team sees the numbers. Only an owner connects or disconnects accounts.

Every `TRCKABLE_CHANNELS_EVERY` (default `24h`, `0` turns reading off) the server reads each account once.

## Turn a platform on

Each platform needs an app of your own, and the server needs its keys. Without them, the platform's **Connect** is disabled. `TRCKABLE_BASE_URL` must be your public https address: the platforms send people back to it.

| Platform | Variables | Redirect address to register |
| --- | --- | --- |
| YouTube | `TRCKABLE_YOUTUBE_CLIENT_ID`, `TRCKABLE_YOUTUBE_CLIENT_SECRET` | `<base url>/api/v1/channels/youtube/callback` |
| Instagram | `TRCKABLE_INSTAGRAM_APP_ID`, `TRCKABLE_INSTAGRAM_APP_SECRET` | `<base url>/api/v1/channels/instagram/callback` |
| Threads | `TRCKABLE_THREADS_APP_ID`, `TRCKABLE_THREADS_APP_SECRET` | `<base url>/api/v1/channels/threads/callback` |

Each secret can also come from a file: `TRCKABLE_YOUTUBE_CLIENT_SECRET_FILE=/run/secrets/youtube`.

### YouTube

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **YouTube Analytics API** and **YouTube Data API v3**.
2. Under **OAuth consent screen**, choose **External**, add the scopes `.../auth/yt-analytics.readonly` and `.../auth/youtube.readonly`, and add yourself as a test user. An app only you use can stay in **Testing**; the sign-in then lasts a week and you reconnect weekly. To avoid that, publish the app and go through Google's verification.
3. Under **Credentials**, create an **OAuth client ID** of type **Web application** with the redirect address above.

### Instagram and Threads

Both are Meta apps. Instagram needs a Business or Creator account (a personal one has no API).

1. In [Meta for Developers](https://developers.facebook.com/), create an app and add **Instagram API with Instagram Login** and **Threads API**.
2. Put the Instagram app id and secret and the Threads app id and secret in the variables above, and register the redirect addresses.
3. While the app is in development mode, only the accounts you add as testers can connect. For anyone else, submit the app for Meta's review.
4. Set the app's deauthorize and data deletion callbacks to `<base url>/api/v1/channels/instagram/deauth` and `<base url>/api/v1/channels/threads/deauth`, so removing the app from Instagram or Threads deletes the data here too.

Instagram's numbers are read a day at a time, and Meta can take up to two days to settle a day, so the newest days may rise a little.
