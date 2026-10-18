---
title: "Mentions"
description: "Where your site is talked about, and the visitors each mention brought: what is watched, how it works, what it sends, how to turn it off."
---

Mentions shows who is talking about your site and how many people they sent. Open it from the **⋯** menu, or from **All mentions** under the dashboard's cards.

## What is watched

Mentions is off until you set `TRCKABLE_MENTIONS=on`. Off, nothing is searched and nothing about mentions shows in the dashboard, the API, the bell or any email.

Every 20 minutes your server looks for:

- your site's address (always, with and without `www.`, and as a subdomain). It counts only as a whole address: `acme.example` is in "I moved to acme.example." and in `acme[.]example`, and not in `notacme.example`, `acme.example.org` or a page of your own site,
- up to 10 names you add yourself in **Settings → Mentions**: a product name, a handle, anything people call your site. The bare name in your address ("acme") is only suggested, never searched until you add it. Even then it counts only with a topic word of your site beside it ("acme" and "analytics"), and in the news only as a phrase of two words or more. This keeps a headline about someone who shares your name out.

When unsure, a mention is not shown: a missed one costs little, a wrong one costs your trust.

## What you can say about your mentions

Per site you can set topic words, required words (all must be in the text), excluded words (one rules it out) and blocked sites. **Not about us** on a mention hides it for good: it stays in a hidden list you can restore from, and you are offered to exclude the words that set it apart or block its source. When you add a name, the news is sampled for it first: if headlines use it for something else, you see them and are offered words to exclude.

A page that sent your site visitors is listed as a confirmed mention with how many came (at least two in the last month), and comes first. A story that several publishers copy, or that Google News and the publisher both carry, is one mention. Every number you see (the Briefing, the palette, the bell, the weekly email) is the mentions in the list.

It looks in:

- **Hacker News**, through Algolia's public search: stories and comments, one request per site for all its words.
- **News and blogs**, through Google News's RSS search and GDELT: only articles that pass the rules above count.
- **Product Hunt**, when `TRCKABLE_PRODUCTHUNT_TOKEN` is set (a Product Hunt developer token). Without it that source is hidden.

## What a mention brings

Each mention keeps a link, a short title, the sentence that named your words, the author's public handle, the platform's own numbers (points, comments, front page) and the time. It is tied to the visitors that came from its place in the ten minutes before it was posted and the two days after.

Each visit belongs to one mention: when a place has several mentions, one ends where the next begins, so the same traffic is never counted, or told, twice. On big shared sites (Medium, GitHub, Reddit, YouTube, X, LinkedIn and the like) a visit from the site says nothing about one post, so only a visit that came from the post's own page counts, and a mention whose address cannot name its page shows no visitors.

## What leaves your server

To search, your server sends your site's address and the words you added to Algolia (Hacker News), Google News, GDELT and, with a token, Product Hunt. Nothing about your visitors is sent: the searches are only your words. What comes back is public: a link, a title, a handle and a time. It is stored with the site and removed with it, and with its retention setting.

## Turn it on or off

Set `TRCKABLE_MENTIONS=on` to turn it on; unset, it is off. With it on, set `TRCKABLE_MENTIONS_EVERY=0` and nothing is searched and nothing is sent. Any other duration (`30m`, `1h`) changes how often.
