---
title: "Answers"
description: "What ChatGPT, Perplexity and Claude say about your site, and what it was worth: what is asked, what leaves your server, what it costs, how to turn it off."
---

Answers asks AI assistants the questions your buyers ask, every week, and shows whether they name you, link to you, or name someone else, and what the pages they link to were worth. Open it from Explore, **Site**, **Answers**. The questions are set in **Settings**, **Data**, **Answers**.

## What is asked

You write the questions the way a buyer would, for example "best privacy-friendly analytics for a Shopify store". A site keeps 10 by default (`TRCKABLE_ANSWERS_QUESTIONS`, up to 100), and up to 5 other sites to compare. A question that names your own site is refused: it would change the answer. You can start from **Suggest questions**, which reads your homepage and, when connected, your Search Console searches.

The server asks **ChatGPT** (OpenAI), **Perplexity** and **Claude** (Anthropic) each question through their official APIs with web search on, **twice** per assistant (`TRCKABLE_ANSWERS_RUNS`, 1 to 3), once a week (`TRCKABLE_ANSWERS_EVERY`, default `168h`, never faster than every 24 hours). The first round starts right after the first questions are saved, and **Ask now** starts one by hand (not twice within 6 hours). An assistant with no key on the server is hidden everywhere. The country the question is asked from is set per site; answers differ by country.

## What an answer brings

Each answer is one of four states, shown as a ghost:

- **Named and linked.** The answer names you (your address, your name, or a word from **Settings**, **Mentions**) and one of its sources is your site.
- **Named, no link.** The answer names you but links elsewhere. A page worth citing could earn the link.
- **Linked, not named.** The answer uses your page as a source but names someone else. Your name may be missing from that page.
- **Not there.** Neither.

The headline is **Seen**: named or linked, counted over the latest complete round and set against the round before ("Seen in 9 of 30 answers, last round 6 of 30"). Because answers vary, each question shows how many of its runs saw you, never a false certainty. Every answer also keeps who else was named, and your place among the names.

Every page the assistants linked is set against what trckable already knows about it: the times AI crawlers read it, the visitors an AI assistant sent to it, and the revenue those visitors made (when Revenue is on). Only links to your own address join: a link to `docs.example.com` counts as linked, but adds no row for `example.com`'s pages. Dashboard filters do not change these counts.

When an assistant names you for a question for the first time, the dashboard says so once. When one that named you in the last two rounds stops, you get the **Answers** alert (Settings, Alerts), the bell, a line in the Briefing and the moments on the chart; the weekly email carries one line of the round. The first answer ever to name you is told once.

## What leaves your server

Only the **questions** and an approximate **country** leave your server, to OpenAI, Perplexity and Anthropic. OpenAI is asked not to store them (`store` is off). Your site's address and words, and anything about your visitors, are never sent: the words are matched on your server, in the answers that come back. Keys are read from `TRCKABLE_OPENAI_KEY`, `TRCKABLE_PERPLEXITY_KEY` and `TRCKABLE_ANTHROPIC_KEY` (or the same with `_FILE`), and are never logged, returned by the API or put in an error.

Answers are stored with the site, follow its retention setting and go with it when it is deleted. The text of an answer is kept for the last 6 rounds; older rows keep their scores. The privacy report lists the assistants that are on. Answers never shows on share links or embeds.

## What it costs

The providers bill you directly. Each check is one question to one assistant, and a round is questions × assistants × runs. The server estimates every call (tokens plus web searches) at the list prices below, which it keeps in `server/internal/answers/prices.go` with their dates, and stores the estimate with the run.

| Assistant | Default model | Tokens in / out, per 1M | Web search |
| --- | --- | --- | --- |
| ChatGPT | `gpt-4.1-mini` | $0.40 / $1.60 | $10 per 1,000 searches |
| Claude | `claude-haiku-5-5` | $0.10 / $0.50 | $10 per 1,000 searches |
| Perplexity | `sonar` | $1 / $1 | $5 per 1,000 requests |

The defaults are the cheapest model each provider documents with web search. Set `TRCKABLE_ANSWERS_OPENAI_MODEL`, `TRCKABLE_ANSWERS_ANTHROPIC_MODEL` or `TRCKABLE_ANSWERS_PERPLEXITY_MODEL` to use another; a model that is not in the table is estimated at the dearest row of its assistant, never at nothing. With the defaults, 10 questions on three assistants asked twice, about 4 rounds a month, come to roughly $3 to $10 a month at list prices. It is an estimate: the providers' bills are the truth.

**The budget.** `TRCKABLE_ANSWERS_BUDGET` (US dollars, default `20`, `0` is no cap) caps the estimated spend of the whole server in a calendar month. A whole round is reserved before it starts, so there are no half rounds; a round that would pass the cap waits until the 1st and the dashboard says so. Each site gets at most a fair share of the cap (the cap divided by the sites that have questions, and always at least one round), so one site cannot use up the rest.

## What it is not

It is what each API answered when asked fresh with web search on. People using the apps may see something else, and trckable does not claim otherwise. It does not promise rankings and gives no advice on how to be named. Gemini is not asked: its search terms don't fit how Answers keeps and compares answers. We'll add it if that changes.

## Network

The server reaches OpenAI, Perplexity and Anthropic directly, as it does for webhooks. A server that can only reach the internet through an outbound proxy cannot ask them.

## From the command line

`trckabled answers check example.com "best privacy-friendly analytics"` asks once per assistant that has a key and prints, for each, whether the site was named or linked, its place, the linked addresses, the estimated cost and the start of the answer. It adds `--country DE` and `--engine openai` and writes nothing.

## In the API

`GET /api/v1/sites/{site}/report/answers` (with `from` and `to`) answers with the latest round (`latest`) and the one before (`was`), the other sites named (`rivals`), each question per assistant, the pages with their `read`, `sent` and `revenue`, and the changes. `GET /api/v1/sites/{site}/answers/setup` answers with the questions, the other sites, the country and, for an owner, the month's budget. Where no assistant has a key, both answer `200` with `{"engines": []}`. The MCP server has a read-only `trckable_answers` tool with the same numbers and no answer text.

## Turn it off

Set `TRCKABLE_ANSWERS_EVERY=0`, or remove the keys, and nothing is asked and nothing is sent. Turn off a single question in **Settings**, **Answers** to keep its past answers; removing it also removes them.
