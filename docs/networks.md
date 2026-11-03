---
title: "Networks"
description: "Visits, conversion and load time by internet provider, and how to turn the network database on or off."
---

Explore → Tech → Networks lists the internet providers your visitors came through ("Deutsche Telekom", "Vodafone", "Comcast"): their visits, how many of them converted and how fast your pages loaded for them. Above the table one line compares the weakest provider with the strongest, once both have 30 visits or more. Tap a row to filter every table by that provider.

Conversion counts sales where payments are connected, otherwise the signup goal, otherwise the visits that stayed. A load time is the 75th percentile of the largest contentful paint, red above 2.5 s, and shows once enough page views were measured.

The tab is hidden until a visit in the period named a provider.

## What is stored

Only the provider's name, up to 64 characters, with the visit. It is looked up from the IP address in memory, and the address is never stored. It is a company, not a person, but it is kept under the same switch as region and city: Settings → Data & privacy → Region and city off, or cookieless mode, and no provider is recorded. Visits recorded before, or without the network database, have none.

## Self-hosting: the network database

Providers come from the free DB-IP "ASN Lite" database (CC BY 4.0, a few MB), which an instance uses for stricter bot filtering too. It is not fetched for Networks alone, so an instance that never asked for it records no provider. To turn it on, fetch the databases into a directory and point the instance at it, then restart:

```
trckabled geo update /var/lib/trckable-geo
TRCKABLE_GEO_DIR=/var/lib/trckable-geo
```

`geo update` downloads the country (or `city`) database and the network database; run it monthly from cron to keep them current. An instance that already downloaded the network database for stricter bot filtering has it in its own geo directory and needs nothing more. To turn it off, remove `dbip-asn-lite.mmdb` from the geo directory and restart, or set `TRCKABLE_GEO=off`, which switches off all geolocation.
