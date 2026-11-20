---
title: "Apps"
description: "See which visits come through your app and which through a browser, and how to tell trckable about an app that hides it."
---

Every visit is counted as one of these: Desktop, iOS browser, iOS app, Android browser, Android app, or a social app's own browser (Facebook, Instagram, TikTok, LinkedIn, Snapchat, X, Pinterest, LINE, WeChat). A desktop program that shows your site (a Tauri or Electron app) counts as Desktop app. On a phone or tablet with another system, the name follows it ("Windows app", "Windows browser").

You see it in three places:

- **Overview** shows a quiet line under the visitor number, "12% used your app", once at least 5% of the people did. Tap it to look at only those visits.
- **Explore → Devices** shows a thin bar, "How they open it", with each way, its icon and its share. Tap a part to filter by it. It appears once any visit came through an app.
- **Live and the visitor window** name the way too: "iOS app", "Android browser", "Instagram".

Filter by it with the `app` filter (`browser`, `app`, or a social app's name in lowercase such as `instagram`) and the `device_app` filter (`iOS|app`, `Android|browser`, `Desktop|app`, `instagram`). The CSV export lists the same ways as "device and app". The name of your app is never sent or kept.

## How trckable knows

The social apps and most web views show in the user agent, so they need nothing from you. The script also looks for what an app leaves on the page: React Native, Expo, Capacitor, Cordova, Flutter, Ionic Portals, Tauri and Electron. When it finds one, it tells the server the visit is an app visit. That is a yes or no, nothing more.

If your app's web view carries none of those, or hides that it is an app (Google sign-in, for example, refuses plain web views, so apps change the user agent), use one of the four switches below. All four send the same yes or no.

1. **`data-app`** on the script tag.

   ```html
   <script defer data-site="tkb_a1b2c3d4" data-app src="https://stats.example.com/js/tkb_a1b2c3d4.js"></script>
   ```

2. **The `app` option** of the npm package.

   ```tsx
   import { Analytics } from 'trckable/react'

   <Analytics site="tkb_a1b2c3d4" host="https://stats.example.com" app />
   ```

   With `init`, write `init({ site: 'tkb_a1b2c3d4', host: 'https://stats.example.com', app: true })`.

3. **A call**, for when the page finds out later: `inApp()` from the package, or `trckable('inApp')` with the script tag. It counts the rest of that visit as an app visit.

   ```ts
   import { inApp } from 'trckable'

   if (window.myAppBridge) inApp()
   ```

4. **`?app=1`** on the address your app opens (`?tkb_app=1` works too). The script reads it once when the page loads, remembers it for the visit in that tab, and leaves it out of the address it sends, so your reports show `/pricing`, not `/pricing?app=1`.

Put a switch only where your app's web view is. On a page people also open in their browser, `data-app` and the `app` option would make every visit there count as an app visit.

## One example for each framework

**Capacitor.** Found on its own. Nothing to add.

**Ionic.** Capacitor and Ionic Portals are both found on their own.

**React Native and Expo.** A page inside `react-native-webview` is found on its own, and so is an Expo web view. If your page needs the app to look like a browser, add the marker to the address:

```tsx
<WebView source={{ uri: 'https://example.com/?app=1' }} />
```

**Cordova.** Found on its own.

**Flutter.** `flutter_inappwebview` is found on its own. `webview_flutter` leaves nothing on the page, so load your site with the marker:

```dart
controller.loadRequest(Uri.parse('https://example.com/?app=1'));
```

**Tauri.** Tauri 2 is found on its own. With Tauri 1, add the `app` option (or `data-app`) to the site's own script.

**Electron.** Found by the `Electron/` part of its user agent. If you change the user agent, add the `app` option:

```ts
init({ site: 'tkb_a1b2c3d4', host: 'https://stats.example.com', app: true })
```
