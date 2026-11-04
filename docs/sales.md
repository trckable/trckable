---
title: "Sales"
description: "Payments, customers and where buyers are from: what each part of Sales shows and where the details come from."
---

Sales is in Explore, once a payment provider is connected (Settings → Revenue).
Payments and Customers are their own entries under Sales in the section list
and on the phone menu.

## At a glance

The page opens with summary cards: net revenue, orders, customers, average
order, and refunds when there are any. Beside them, **Where buyers are from**
lists the top five countries by revenue.

## Payments

One row per payment: the country flag (initials when the country is unknown),
the country, the provider, and the time and amount on the right. When the
provider's currency differs from the site's, the original currency shows too.
The country comes from the payment; if it has none, from the visit it is
linked to.

When the provider says so, a row also shows **what was bought** (the product
name, up to 120 characters) and **how it was paid**: card, PayPal, Apple Pay,
Google Pay, bank or crypto. Nothing is shown when the provider does not say.
Payments you already had fill in on their own after an update.

## Customers

A buyer with no linked visit shows the name the provider has for them. Open a
customer to see their payments in a sheet over the list. For providers that
keep license keys (Dodo), the sheet also shows each key's status, activations
and devices. A key is shown by its last four characters only.

Customer details are read from the provider when you open the sheet, kept in
memory for ten minutes and never stored. Only signed-in people see them, not
shared pages.

## Counting rules

When trckable changes how payments are counted, every site with a payment
connection is read again in the background, one at a time. Nothing is sent
about it. You can still run Recalculate payments item in Settings → Revenue yourself.
