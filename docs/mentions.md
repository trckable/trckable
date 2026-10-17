---
title: "Mentions"
description: "Where your site is talked about, and the visitors each mention brought: what is watched, how it works, what it sends, how to turn it off."
---

Mentions shows who is talking about your site and how many people they sent. Open it from the **⋯** menu, or from **All mentions** under the dashboard's cards.

## What is watched

Mentions is off until you set `TRCKABLE_MENTIONS=on`. Off, nothing is searched and nothing about mentions shows in the dashboard, the API, the bell or any email.

Every 20 minutes your server looks for two kinds of words:

- your site's address (always, with and without `www.`). The bare name inside it is not searched by itself: "acme" also names people, places and other sites,
- up to 10 words you add yourself in **Settings → Mentions**: a product name, a handle, anything people call your site.

It looks in:

- **Hacker News**, through Algolia's public search: stories and comments, one request per site for all its words.
- **News and blogs**, through Google News's RSS search and GDELT: only articles that name one of your words in the headline, the summary or the address count.
- **Product Hunt**, when `TRCKABLE_PRODUCTHUNT_TOKEN` is set (a Product Hunt developer token). Without it that source is hidden.

## What a mention brings

Each mention keeps a link, a short title, the sentence that named your words, the author's public handle, the platform's own numbers (points, comments, front page) and the time. It is tied to the visitors that came from its place in the ten minutes before it was posted and the two days after.

Each visit belongs to one mention: when a place has several mentions, one ends where the next begins, so the same traffic is never counted, or told, twice. On big shared sites (Medium, GitHub, Reddit, YouTube, X, LinkedIn and the like) a visit from the site says nothing about one post, so only a visit that came from the post's own page counts, and a mention whose address cannot name its page shows no visitors.

## What leaves your server

To search, your server sends your site's address and the words you added to Algolia (Hacker News), Google News, GDELT and, with a token, Product Hunt. Nothing about your visitors is sent: the searches are only your words. What comes back is public: a link, a title, a handle and a time. It is stored with the site and removed with it, and with its retention setting.

## Turn it on or off

Set `TRCKABLE_MENTIONS=on` to turn it on; unset, it is off. With it on, set `TRCKABLE_MENTIONS_EVERY=0` and nothing is searched and nothing is sent. Any other duration (`30m`, `1h`) changes how often.
