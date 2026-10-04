---
title: "Import from Google Analytics"
description: "Bring your GA4 history in with one Google sign-in, or from the command line, and create your own Google OAuth client to turn the sign-in on."
---

Two ways to bring a site's Google Analytics 4 history into trckable. Both end the
same way: the old days appear in your reports, marked **Imported**, and
everything from your first own visit on is trckable's.

- **Sign in with Google.** In the import dialog, sign in, pick a property and
  watch the progress. Turn it on once, below.
- **The command line.** `trckabled import example.com export.ndjson` reads GA4's
  BigQuery export (or a CSV). Nothing to set up, and it keeps working.

## What the sign-in imports

Daily totals (sessions, users, pageviews) and, for each day, the top sources,
mediums, pages, countries and devices, through the GA4 Data API. It asks Google
for one thing: read-only access to your Analytics (`analytics.readonly`).

- The access token stays in the server's memory for the import and is never
  written to disk or to the log. No refresh token is requested, so when the
  import is done (or an hour has passed) trckable cannot read your Analytics any
  more. Sign in again to import again.
- Only an owner can do it, and only for a site of their own account.
- The numbers are stored as daily counters in the analytics store, never as
  invented visits. Importing the same days again replaces them: nothing is counted
  twice.
- A report adds an imported day only if it is before the site's first own event
  (and not a day `trckabled import` already filled). Under a filter, or by the
  hour, imported days are left out: a daily total cannot say which of its visits a
  filter would keep. Visitors are the sum of each day's users, so a person who
  came on two days counts twice, as in GA4's own daily table.
- Google limits how much a property can ask for in an hour. The import goes one
  range at a time, slowly, stops when the quota is nearly used up, and goes on
  from where it was with **Go on**; ranges that are done are not fetched again.

## Create your own Google OAuth client

The sign-in uses an OAuth client that belongs to you. Google asks every app
that reads Analytics to be verified before it may be shown to the public; an app
only you and your team use stays in **Testing**, which needs no review.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project
   (or pick one).
2. Open **APIs & Services → Library** and enable **Google Analytics Data API** and
   **Google Analytics Admin API**.
3. Open **APIs & Services → OAuth consent screen**. Choose **External**, give the app
   a name and your email, add the scope `.../auth/analytics.readonly`, and under
   **Test users** add the Google accounts that will import (yours).
4. Open **Credentials → Create credentials → OAuth client ID**. Type: **Web
   application**. Under **Authorized redirect URIs** add exactly
   `https://your-trckable-address/api/v1/ga/callback`, the address in
   `TRCKABLE_BASE_URL` followed by that path.
5. Copy the client ID and the client secret into the server's environment:

   ```
   TRCKABLE_BASE_URL=https://stats.example.com
   GA_OAUTH_CLIENT_ID=1234-abc.apps.googleusercontent.com
   GA_OAUTH_CLIENT_SECRET=GOCSPX-...
   ```

   The secret can also come from a file: `GA_OAUTH_CLIENT_SECRET_FILE=/run/secrets/ga`.
6. Restart trckable. The import dialog now has a **Sign in with Google** step.

Without both variables, or without `TRCKABLE_BASE_URL`, the dialog shows only the
command line, as before. A test-mode app's sign-in lasts a week; you only need it
for the import.
