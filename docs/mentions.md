---
title: "Mentions"
description: "Where your site is talked about, and the visitors each mention brought: what is watched, how it works, what it sends, how to turn it off."
---

Mentions shows who is talking about your site and how many people they sent. Open it from the **⋯** menu, or from **All mentions** under the dashboard's cards.

## What is watched

Every 20 minutes your server looks for three kinds of words:

- your site's address (always),
- its name, when the name is distinctive (it holds the address's own label, or is two words or more; a lone ordinary word would find everything but your site),
- up to 10 words you add yourself in **Settings → Mentions**: a product name, a handle, anything people call your site.

It looks in:

- **Hacker News**, through Algolia's public search: stories and comments, one request per site for all its words.
- **News and blogs**, through Google News's RSS search and GDELT: only articles that name one of your words in the headline, the summary or the address count.
- **Product Hunt**, when `TRCKABLE_PRODUCTHUNT_TOKEN` is set (a Product Hunt developer token). Without it that source is hidden.

## What a mention brings

Each mention keeps a link, a short title, the sentence that named your words, the author's public handle, the platform's own numbers (points, comments, front page) and the time. It is tied to the visitors that came from its place in the ten minutes before it was posted and the two days after.

Each visit belongs to one mention: when a place has several mentions, one ends where the next begins, so the same traffic is never counted, or told, twice. On big shared sites (Medium, GitHub, Reddit, YouTube, X, LinkedIn and the like) a visit from the site says nothing about one post, so only a visit that came from the post's own page counts, and a mention whose address cannot name its page shows no visitors.

## What leaves your server

To search, your server sends your site's address, name and the words you added to Algolia (Hacker News), Google News, GDELT and, with a token, Product Hunt. Nothing about your visitors is sent: the searches are only your words. What comes back is public: a link, a title, a handle and a time. It is stored with the site and removed with it, and with its retention setting.

## Turn it off

Set `TRCKABLE_MENTIONS_EVERY=0` and nothing is searched and nothing is sent. Any other duration (`30m`, `1h`) changes how often.
