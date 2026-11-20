package ingest

import "testing"

func TestAppOfTheVisit(t *testing.T) {
	const (
		iosBase = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
		android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) "
	)
	cases := []struct{ name, ua, app string }{
		{"facebook ios", iosBase + "Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.107;FBBV/1;FBDV/iPhone15,2]", "facebook"},
		{"facebook android", android + "Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.40.107;]", "facebook"},
		{"instagram", iosBase + "Mobile/15E148 Instagram 330.0.0.34.116 (iPhone15,2; iOS 17_5; en_US)", "instagram"},
		{"tiktok", android + "Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6", "tiktok"},
		{"linkedin", iosBase + "Mobile/15E148 LinkedInApp", "linkedin"},
		{"snapchat", iosBase + "Mobile/15E148 Snapchat/12.80.0.33 (like Safari/604.1)", "snapchat"},
		{"twitter ios", iosBase + "Mobile/15E148 Twitter for iPhone/10.50", "twitter"},
		{"twitter android", android + "Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 TwitterAndroid", "twitter"},
		{"pinterest", android + "Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 [Pinterest/Android]", "pinterest"},
		{"line", iosBase + "Mobile/15E148 Safari Line/14.1.0", "line"},
		{"wechat", android + "Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.47", "wechat"},
		{"android web view, real shape", "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36", "app"},
		{"ios web view", iosBase + "Mobile/15E148", "app"},
		{"ios safari", iosBase + "Version/17.5 Mobile/15E148 Safari/604.1", ""},
		{"chrome ios", iosBase + "CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1", ""},
		{"firefox ios", iosBase + "FxiOS/127.0 Mobile/15E148 Safari/605.1.15", ""},
		{"edge ios", iosBase + "Version/17.0 EdgiOS/126.2592.88 Mobile/15E148 Safari/605.1.15", ""},
		{"android chrome", android + "Chrome/126.0.0.0 Mobile Safari/537.36", ""},
		{"desktop chrome", chromeUA, ""},
		{"desktop safari", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0.1 Safari/605.1.15", ""},
	}
	for _, c := range cases {
		got := parseUA(c.ua, 0)
		if got.Bot || got.App != c.app {
			t.Errorf("%s: app %q (bot %v), want %q", c.name, got.App, got.Bot, c.app)
		}
	}
}

// An app's web view on a desktop is no app: only phones and tablets carry one.
func TestDesktopNeverCarriesAnApp(t *testing.T) {
	if a := parseUA(chromeUA+" Instagram", 0).App; a != "" {
		t.Errorf("desktop: app %q", a)
	}
}

func TestPageSaysItIsInAnApp(t *testing.T) {
	const phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
	for _, c := range []struct{ body, ua, want string }{
		{`{"s":"tkb_test","k":"pv","u":"https://site.com/","ap":1}`, phone, "app"},
		{`{"s":"tkb_test","k":"pv","u":"https://site.com/","ap":true}`, phone, "app"},
		{`{"s":"tkb_test","k":"pv","u":"https://site.com/","ap":"instagram"}`, phone, ""}, // a name from the page is never believed
		{`{"s":"tkb_test","k":"pv","u":"https://site.com/"}`, phone, ""},
		{`{"s":"tkb_test","k":"pv","u":"https://site.com/","ap":1}`, chromeUA, ""}, // desktop
		// iOS's other browsers carry the web view's traces: their name wins over the flag.
		{`{"s":"tkb_test","k":"pv","u":"https://site.com/","ap":1}`, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1", ""},
		{`{"s":"tkb_test","k":"pv","u":"https://site.com/","ap":1}`, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15", ""},
		{`{"s":"tkb_test","k":"pv","u":"https://site.com/","ap":1}`, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0", "instagram"},
	} {
		h, l := newHandler(t)
		if w := post(h, c.body, c.ua); w.Code != 202 {
			t.Fatalf("%s: status %d", c.body, w.Code)
		}
		if e, _ := lastEvent(t, l); e.App != c.want {
			t.Errorf("%s: app %q, want %q", c.body, e.App, c.want)
		}
	}
}
