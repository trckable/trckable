# Setup checklist API

`GET /api/v1/sites/{site}/setup` says how far a site's setup is. Anyone who can
read the site can call it (owners, viewers, API keys). Share links and embeds
cannot. Every value is computed from data trckable already has, plus a few
marks kept per site.

```json
{
  "kind": { "value": "shop", "chosen": false, "provider": "stripe" },
  "goal_suggestion": "Purchase",
  "done": 4, "counted": 9, "all_set": false,
  "items": [
    { "id": "verified", "group": "core", "done": true, "counted": true,
      "skipped": false, "skippable": false, "detail": { "pages": 12 } }
  ]
}
```

## Items

| id | group | done when |
| --- | --- | --- |
| `verified` | core | pageviews arrived from 2 or more paths (`detail.pages`) |
| `own_visits` | core | the site leaves out at least one address of yours |
| `locale` | core | time zone or currency is not UTC/USD, or you confirmed them |
| `goal` | core | a goal exists (page goal, or a goal event was seen) |
| `payments` | optional | a connected payment provider has at least one sale (`detail.provider`, `detail.sales`) |
| `funnel` | optional | a funnel was built |
| `search` | optional | Search Console has a property |
| `crawlers` | optional | an AI crawler hit was recorded |
| `proxy` | optional | an event came through your own-domain proxy in the last 7 days (`detail.last_seen`) |
| `vitals`, `heatmaps`, `ga`, `team`, `phone`, `mentions` | more | never counted |

`core` always counts. `optional` counts until you say "not for me"; a skipped
item moves to `more` (`skipped: true`) and can be brought back. `done` and
`counted` count only what is counted.

## Smart defaults

- A site with a connected payment provider that already has sales has `payments` done.
- A site that has only ever had pageviews on one path starts with `funnel` skipped (never a SaaS site).
- A site the install check reads as a content site (feed, articles, a blog path)
  starts with `payments` skipped. Bringing an item back stays back.

## Site kind

The install check also reads the homepage (no crawling) for the kind: `shop`,
`saas`, `content` or `other`, and the payment provider it carries (Stripe,
Paddle, Lemon Squeezy, Polar, Gumroad). A kind you choose is never overwritten
by a later guess (the payment provider seen keeps updating). The kind is only kept from a check whose page carries this site's script at the site's own address.

## Changes (owners only; viewers and API keys get 403)

- `PUT /api/v1/sites/{site}/setup/skip/{item}` and `DELETE` the same: skip or bring back `payments`, `funnel`, `search`, `crawlers` or `proxy`.
- `PUT /api/v1/sites/{site}/setup/locale`: confirm the time zone and currency.
- `PUT /api/v1/sites/{site}/setup/kind` with `{"kind":"shop|saas|content|other"}`.
- `POST /api/v1/sites/{site}/setup/funnel`: a funnel was built.

Each answers with the new checklist.
