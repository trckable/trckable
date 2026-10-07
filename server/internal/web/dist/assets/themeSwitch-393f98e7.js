<<<<<<<< HEAD:server/internal/web/dist/assets/themeSwitch-8e0ee27c.js
import{qt as e}from"./core-259d424e.js";function t(t,n){let r=document.documentElement;if(e()){n(t);return}let i=document;if(typeof i.startViewTransition==`function`){r.dataset.themeSwitch=`view`;let e=i.startViewTransition.call(i,()=>n(t)),a=()=>delete r.dataset.themeSwitch;e.finished.then(a,a);return}r.dataset.themeSwitch=`fade`,n(t),setTimeout(()=>delete r.dataset.themeSwitch,260)}export{t as switchTheme};
========
import{Gt as e}from"./core-95948b11.js";function t(t,n){let r=document.documentElement;if(e()){n(t);return}let i=document;if(typeof i.startViewTransition==`function`){r.dataset.themeSwitch=`view`;let e=i.startViewTransition.call(i,()=>n(t)),a=()=>delete r.dataset.themeSwitch;e.finished.then(a,a);return}r.dataset.themeSwitch=`fade`,n(t),setTimeout(()=>delete r.dataset.themeSwitch,260)}export{t as switchTheme};
>>>>>>>> origin/data-on-kit:server/internal/web/dist/assets/themeSwitch-393f98e7.js
