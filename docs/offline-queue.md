---
title: "When your server is down"
description: "How visits made while your server is unreachable are kept and counted once."
---

A visitor's browser keeps what it could not send, up to 24 hours and 200 events, and sends it when your server answers again: the visits made meanwhile are counted once, on the day they happened. The server takes events up to 25 hours old; the browser's queue is the only copy until then, so a visitor who clears their site data in that time takes it with them. A visitor counted without a cookie has nothing stored in the browser, so what could not be sent is kept in memory and sent again for as long as the page is open: if they close the page first, those events are lost. A visit that was cut in two by the outage is stored as two visits, with every page view counted.

