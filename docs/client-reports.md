---
title: "Client reports"
description: "Scheduled email and PDF reports for the people who pay for them."
---

For an agency or a freelancer: **Settings → Alerts → Client reports** sends a site's numbers on a schedule to the people who pay for them. Each report is weekly (the first morning of the site's week, 08:00 in its time zone) or monthly (the first morning of the month, for the month that ended), goes to up to 10 addresses, is written in the language you pick for that schedule (English, German, French, Spanish, Italian or Dutch; the translations are marked "needs review" in `server/internal/reports/lang.go`, and a correction is a pull request to that one file) and wears the site's look from **Share → Link**: its logo, colour and "Hide trckable branding". It is an HTML email with the visitors, pageviews, bounce rate and visit length against the period before, revenue when payments are connected, the top sources, pages and goals, and, if you leave it on, a one-page PDF with the same numbers and a bar a day. Reports need email on the server (`TRCKABLE_SMTP_URL`, or a Resend key) and `TRCKABLE_BASE_URL`; without them the card says so. A site can have five schedules; "Send me a copy" sends the last period to you, three times a day at most.

The PDF is written by trckable itself, in plain Go, with no browser and no library: one page of Helvetica, so Western European letters only (a character outside them is drawn as "?"). A PNG, JPEG or GIF logo is placed in the email and the PDF; an SVG logo is not (mail clients and PDF readers do not draw it), so the name stands in its place.

Every email carries a link that stops it for that one address, and the headers mail clients use for their own Unsubscribe button; it works without signing in and removes only that address. Reports need email on the server (`TRCKABLE_SMTP_URL`, or `TRCKABLE_RESEND_KEY` where SMTP is blocked, with `TRCKABLE_MAIL_FROM`) and `TRCKABLE_BASE_URL`, which the stop links are built from: without both nothing is sent.

