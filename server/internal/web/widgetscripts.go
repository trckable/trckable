package web

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
)

// WidgetPageScript runs inside a widget's own page (/w/{id}). It only tells
// the page that embeds the card how tall the card is, on load, on resize and
// whenever the card changes size: one postMessage, nothing read, nothing sent
// anywhere else. The page's policy allows exactly this script, by its hash.
const WidgetPageScript = `(function(){var p=parent,m=location.pathname.match(/^\/w\/([\w-]+)$/),d=document.documentElement;if(p===window)return;` +
	`var s=function(){p.postMessage({type:'trckable:h',id:m?m[1]:'',h:Math.ceil(d.getBoundingClientRect().height)},'*')};` +
	`s();addEventListener('load',s);addEventListener('resize',s);if(window.ResizeObserver)new ResizeObserver(s).observe(d)})()`

// WidgetPageScriptHash is WidgetPageScript as a CSP source.
var WidgetPageScriptHash = func() string {
	sum := sha256.Sum256([]byte(WidgetPageScript))
	return "sha256-" + base64.StdEncoding.EncodeToString(sum[:])
}()

// WidgetLoaderFile is the name of the loader a page that embeds widgets
// includes once: /js/w.js.
const WidgetLoaderFile = "w.js"

// widgetLoader sets the height of a widget's frame from its message. It takes
// a message only from the origin it was loaded from, only from the window of
// one of the page's own frames, and only for the widget that frame shows.
const widgetLoader = `(function(){var o=document.currentScript.src.split('/').slice(0,3).join('/');` +
	`addEventListener('message',function(e){var d=e.data;if(e.origin!==o||!d||d.type!=='trckable:h'||!(d.h>0))return;` +
	`for(var f=document.getElementsByTagName('iframe'),i=0;i<f.length;i++)if(f[i].contentWindow===e.source&&f[i].src.indexOf(o+'/w/'+d.id)===0)f[i].style.height=Math.min(d.h,4000)+'px'})})()`

// WidgetLoader serves /js/w.js.
func WidgetLoader() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		h := w.Header()
		h.Set("Content-Type", "application/javascript; charset=utf-8")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
		h.Set("Access-Control-Allow-Origin", "*")
		_, _ = w.Write([]byte(widgetLoader))
	})
}
