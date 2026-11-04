---
title: "Privacy report"
description: "What a site is set to collect and what it is not, ready to print."
---

Settings → Data & privacy → Privacy report states what the site is set to collect and what it is not, in the dashboard's language: cookieless and consent mode, the cookie and its lifetime, retention, exclusions, the features that are on, where the data is, the privacy-policy paragraph and a short "do I need a banner?". View it, or print it / save it as a PDF from the browser.

Where the server has an AI key for Answers, the "Where the data is" part adds one line: "Answers sends your questions to OpenAI, Perplexity and Anthropic. Nothing about your visitors." It names only the assistants that are on. See [answers](answers.md).

## Form fields kept in a goal

With Form submissions on, a field marked `data-trckable-keep="site"` adds what was typed in it to that form's goal, so the goal can say which site was scanned or which plan was picked. It is opt-in per field: nothing is read from a field you did not mark. Use one lowercase word without spaces for the label (the server lowercases it and drops a label with a space). At most 9 fields are kept, each cut to 100 characters. Only text, url, search and number fields, selects, text areas and chosen checkboxes or radios count. Never sent, even when marked: passwords, email addresses, phone numbers, card numbers, one-time codes, hidden fields, files, and any value containing an @.

## Internet provider

Where the instance has the network database, a visit also keeps the name of the visitor's internet provider ("Deutsche Telekom"), under the same switch as region and city: with Region and city off, or in cookieless mode, it is not kept. The privacy report and the privacy-policy paragraph say so. See [networks](networks.md).

## Customer names and license keys

Sales → Customers shows a buyer's name and email, and the license keys they hold, when your payment provider can say (Dodo Payments today). They are read live from your provider when you open the list or a customer, kept in the server's memory for ten minutes and never stored: trckable keeps only the keyed hash of the email it always kept. A license key is shown by its last four characters only. Signed-in people see them; API keys and shared links never do.
