---
title: "Revenue from Gumroad and PayPal"
description: "Connect Gumroad or PayPal to see which traffic pays: where each key and ID comes from, how a sale reaches the visitor who made it, and what is and isn't counted."
---

Gumroad and PayPal work like the other providers in Settings → Revenue: a sale
arrives by webhook, is matched to the visitor who started it, and refunds and
disputes take the money back out. The difference is how each one proves a
webhook is real, so setup differs.

## Gumroad

Gumroad does not sign its pings. trckable makes a secret and puts it in the
ping URL, and answers only pings that carry it. Anyone who knows the URL can
send sales to your site, so treat it like a password; to change it, disconnect
and connect again.

**With an access token (recommended).** In Gumroad open Settings → Advanced →
Applications, create an application and generate an access token (the
`view_sales` scope is all it needs). Paste it in Settings → Revenue → Gumroad.
trckable subscribes to sales, refunds, disputes and won disputes for you, and
removes the subscriptions when you disconnect.

**By hand.** Choose "I'll add the webhook myself", then copy the ping URL (it
ends in `?token=…`) into Gumroad's Settings → Advanced → Ping. Gumroad's Ping
URL reports sales only, so refunds and disputes are not seen this way.

What is counted:

- Revenue is the sale's `price`, in the product's currency. Gumroad's ping does
  not report tax, so none is subtracted.
- A refund ping takes back the whole sale: the ping carries no refunded amount,
  so a partial refund is counted as a full one.
- A dispute removes the sale until `dispute_won` says it was won.
- A purchase you make of your own product (Gumroad marks it `test`) is test
  money and stays out of the numbers.
- A subscription's later charges follow the visitor of its first one.

**Attribution.** Add the visitor to the product link: Gumroad passes any
URL parameter back in `url_params`.

```
https://you.gumroad.com/l/guide?trckable_vid=<value of the trckable_vid cookie>
```

## PayPal

PayPal signs every webhook with a certificate it publishes. trckable checks
the signature the way PayPal documents it: the certificate must come from
PayPal's own API address, chain to a trusted root, and sign the delivery's id,
time, your webhook ID and a checksum of the body.

1. Open [developer.paypal.com/dashboard](https://developer.paypal.com/dashboard/applications)
   and pick the app (Live or Sandbox) your checkout uses.
2. Under Webhooks, add a webhook with the URL trckable shows you and subscribe
   it to the events trckable lists (captures, sales, subscription activation,
   disputes).
3. Copy the **Webhook ID** PayPal shows for it and paste it into trckable.

Sandbox and live webhooks are separate: connect each as its own connection,
choosing Sandbox for the first. Payments in a sandbox connection are test money.

What is counted:

- A completed capture (PayPal Checkout, Payments v2) or sale (subscriptions) is
  a payment, at the amount paid. A capture does not report tax, so none is
  subtracted; a subscription sale that reports its tax has it removed.
- A refund reaches its payment through the capture it belongs to.
  A reversal and a dispute resolved in the buyer's favour remove the money;
  a dispute resolved in yours restores it.

**Attribution.** Set the order's `custom_id` to `trckable_` followed by the
visitor id, with the dot written as an underscore, for example
`trckable_k3j2_m1a2b3` (the same form Stripe's `client_reference_id` takes).
For a subscription set the same value as the subscription's `custom_id`:
its payments follow it.

## Link a checkout to the visit

A payment with no visit linked still counts in your revenue, but it cannot say which page or source brought the buyer. Checkouts made by trckable's own tracker are linked for you. A checkout your server creates, or an overlay you open yourself, needs the visitor passed along.

Read the value of the `trckable_vid` cookie in the browser (it looks like `k3j2.m1a2b3`: the visitor's id and when they were first seen, both in base 36) and send it with the checkout:

- Stripe, Polar, Dodo Payments: put it in the checkout's `metadata` as `{ "trckable_vid": "<value>" }`.
- Lemon Squeezy: the checkout's custom data (`checkout_data.custom`). Paddle: the transaction's `custom_data`. The key is `trckable_vid` in both.
- Stripe also reads `client_reference_id`, Polar `reference_id`, and checkout links `?reference_id=` or `?metadata_trckable_vid=`. These fields are shared with other tools, so they only count in the form `trckable_<id>_<firstseen>`, for example `trckable_k3j2_m1a2b3`.
- Gumroad: add `?trckable_vid=<value>` to the product link, as above.

The visit is linked from the next payment on; earlier payments stay unlinked.
