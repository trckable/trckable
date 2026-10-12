---
title: "Widgets"
description: "Small live cards for your own pages: no script, no cookie, nothing sent anywhere."
---

Settings → Widgets makes a small card for your own pages: live now, last 7 days, a counter, open revenue, a privacy seal, and **Online**, how many people are on the site now. Each is a page of HTML and CSS under `/w/<id>`: no script, no cookie, nothing sent anywhere. It is off until you make it, only the numbers its design shows are public, and it is never counted as a visit. Every widget has a name, a language (or the visitor's own), wording you can change, and an Edit view that shows the real card on a light or dark page, inline or in a corner; saving keeps the same id, so the code on your pages keeps working.

Online has three modes: a **pill** ("12 online" with a pulsing dot), the pill with a **30-minute sparkline**, and a **card** with the chart and the top pages or countries. It counts the last five minutes, the same as the dashboard's Online. Below three people it says "A few" and draws no chart, and a page or country appears only with three or more on it. Put it where you like, as a frame:

```html
<iframe src="https://stats.example.com/w/w_abc123" width="230" height="44" style="border:0;background:transparent"></iframe>
```

or float it in a corner with one small script (under 1 KB gzipped, separate from the tracker; the visitor can close it, it is hidden in print and fades in only without reduced motion). Paste it once: the corner, size, theme, colour, words and language are kept in Settings → Widgets, and a change there shows on the next page load, with no new code. (A tag with `data-pos="bl"` keeps that corner until Settings chooses one.)

```html
<script async src="https://stats.example.com/js/w_abc123.online.js"></script>
```

