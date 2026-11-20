---
title: "Apps that show your site in a web view"
description: "How trckable tells a visit inside an app from a visit in a phone's browser, and the one attribute that helps it."
---

A phone or tablet visit is counted as one of three things: the phone's own browser, an app that shows your site in a web view (a company app that wraps your site, for example), or a social app's built-in browser. Explore's Devices table shows it as a line under Mobile and Tablet once any visit came through an app, and Live tags such a visit with "App" or the social app's name (Facebook, Instagram, TikTok, LinkedIn, Snapchat, X, Pinterest, LINE, WeChat). Desktop visits are never tagged.

trckable works it out from the user agent, so the social apps and most web views need nothing from you. The script also looks for the bridge an app leaves on the page (React Native, Capacitor, Cordova, Flutter) and tells the server when it finds one. If your app's web view carries none of these, add one attribute to the script tag:

```html
<script defer data-site="tkb_a1b2c3d4" data-app src="https://stats.example.com/js/tkb_a1b2c3d4.js"></script>
```

Any page that carries `data-app` is counted as opened in an app, but only on a phone or tablet. The name of your app is not sent or kept.

Filter by it with the `app` filter: `browser`, `app`, or a social app's name in lowercase (`instagram`). The CSV export lists the same lines as "device and app".
