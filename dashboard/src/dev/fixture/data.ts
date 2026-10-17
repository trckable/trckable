// The mock's dummy world, copied as it is (the walkthrough mock, round 2): sources, places, devices, the four sites and
// the ten scenarios. Dev only: nothing here is reachable from a production build (see ./index.ts).
interface SrcDef {
  id: string
  name: string
  short?: string
}
interface SiteRaw {
  id: string
  name: string
  note: string
  base: number
  curve: 'work' | 'evening'
  wk: number[]
  src: Record<string, number>
  cty: Record<string, number>
  mob: number
  pages: [string, number][]
  aff: Record<string, Record<string, number>>
  funnel: string[]
  rates: number[]
  kpi: number
  kpiName?: string
  kpiFree?: string
  money: 'saas' | 'shop' | null
  paid?: number
  up?: number
  renew?: number
  refund?: number
  goals: [string, number][]
  spikes: [number, number, number, string, number][]
  inc: [number, number, number, number][]
}
export interface SiteDef extends SiteRaw {
  sh: number[]
  dv: number[][]
  ct: number[][]
  pg: number[][]
}
export interface SaleEx {
  plan?: number
  cty?: number
  amt?: number
  label?: string
  min?: number
}
export interface Scn {
  name: string
  d: string
  site: string
  date: [number, number, number]
  start: number
  now: number
  still?: number
  quiet?: Record<string, number>
  lvl?: Record<string, number>
  since?: Record<string, number>
  boost?: Record<string, [number, number, number]>
  noCty?: Record<string, number>
  spikes: [string, number, number, string, number][]
  inc: [string, number, number, number][]
  noRand: string[]
  sales: [string, number, number, string, string, SaleEx?][]
  caps: ([number, string] | [number, string, string])[]
}
type GKind = { t: string; qi?: number; m?: number; dp?: number; im?: number } | null
import { norm } from './rand'

export const SRCS: SrcDef[] =[{id:"google",name:"Google"},{id:"direct",name:"Direct"},{id:"hn",name:"Hacker News",short:"HN"},{id:"reddit",name:"Reddit"},{id:"x",name:"X"},{id:"newsletter",name:"Newsletter",short:"News"},{id:"chatgpt",name:"ChatGPT",short:"GPT"},{id:"github",name:"GitHub"},{id:"badge",name:"trckable badge",short:"Badge"}];
export const NS=SRCS.length,SI: Record<string, number> = {};SRCS.forEach((s, i) => (SI[s.id] = i));
export const CTYS: { id: string; name: string }[] =[["US","United States"],["DE","Germany"],["GB","United Kingdom"],["IN","India"],["FR","France"],["NL","Netherlands"],["CA","Canada"],["AL","Albania"]].map(([id,name])=>({id,name}));
export const DEVS: { id: string; name: string }[] =[{id:"desktop",name:"Desktop"},{id:"mobile",name:"Mobile"},{id:"tablet",name:"Tablet"}];
const SRCDEV: Record<string, number[]> ={google:[.6,.37,.03],direct:[.66,.31,.03],hn:[.7,.28,.02],reddit:[.45,.52,.03],x:[.3,.67,.03],newsletter:[.5,.47,.03],chatgpt:[.8,.19,.01],github:[.9,.09,.01],badge:[.7,.28,.02]};
const CTYMOD: Record<string, Record<string, number>> ={hn:{US:1.7,IN:1.3,DE:.8},reddit:{US:1.5},x:{US:1.2,GB:1.2}};
export const BOUNCE = SRCS.map((s) => ({google:.42,direct:.35,hn:.66,reddit:.6,x:.58,newsletter:.3,chatgpt:.28,github:.38,badge:.5} as Record<string, number>)[s.id])
export const CONV = SRCS.map((s) => ({google:1,direct:1.2,hn:.3,reddit:.5,x:.6,newsletter:1.5,chatgpt:1.7,github:1.1,badge:.6} as Record<string, number>)[s.id])
export const CURVE: Record<string, number[]> ={work:norm([8,6,5,4,4,6,12,22,34,46,54,58,60,58,62,60,56,52,50,48,46,40,32,20]).map(x=>x*24),
 evening:norm([10,7,5,4,4,5,8,14,22,28,32,36,40,38,38,40,44,52,62,70,72,62,40,22]).map(x=>x*24)};
export const SPK =[.55,1,.8,.5,.3,.16,.08,.04];
const RAW: SiteRaw[] = [
{id:"trk",name:"trckable.com",note:"SaaS",base:48,curve:"work",wk:[.55,1,1.05,1.05,1,.95,.6],
 src:{google:.33,direct:.25,hn:.012,reddit:.05,x:.08,newsletter:.07,chatgpt:.09,github:.1,badge:.008},
 cty:{US:.33,DE:.2,GB:.12,IN:.1,FR:.08,NL:.07,CA:.07,AL:.03},mob:1,
 pages:[["/",.42],["/pricing",.2],["/docs/self-host",.12],["/blog/why-no-cookies",.08],["/changelog",.06],["/signup",.07],["/blog/show-hn",.01]],
 aff:{hn:{"/blog/show-hn":40,"/":1.3,"/pricing":1.2},chatgpt:{"/docs/self-host":2.5},newsletter:{"/changelog":4},github:{"/docs/self-host":2}},
 funnel:["Landed","Pricing","Signed up","Paid"],rates:[.3,.035],kpi:2,money:"saas",paid:.0022,up:.5,renew:2.4,refund:.08,
 goals:[["Read the self-host docs",.07],["Started checkout",.011]],spikes:[[-35,15,10,"hn",55],[-62,11,0,"reddit",35]],inc:[]},
{id:"shop",name:"shop.example.dev",note:"store",base:62,curve:"evening",wk:[1.25,.92,.95,1,1,1.08,1.3],
 src:{google:.42,direct:.2,reddit:.05,x:.06,newsletter:.14,chatgpt:.05,hn:.003,github:.002},
 cty:{US:.28,DE:.24,GB:.16,FR:.1,NL:.08,CA:.08,IN:.04,AL:.02},mob:1.45,
 pages:[["/",.3],["/shop/sneakers",.2],["/shop/bags",.14],["/sale",.12],["/cart",.1],["/checkout",.07],["/about",.07]],
 aff:{newsletter:{"/sale":3},x:{"/shop/sneakers":2},reddit:{"/shop/bags":2}},
 funnel:["Landed","Product","Cart","Paid"],rates:[.52,.1],kpi:3,kpiName:"Orders",kpiFree:"added to cart",money:"shop",paid:.006,up:.6,renew:3,refund:.25,
 goals:[["Used search",.12],["Added to wishlist",.05]],spikes:[[-20,19,0,"newsletter",60]],inc:[[-3,9,12,23]]},
{id:"docs",name:"docs.trckable.com",note:"docs",base:26,curve:"work",wk:[.4,1,1.05,1.05,1,.9,.45],
 src:{google:.48,direct:.28,github:.13,chatgpt:.09,x:.01,reddit:.01},
 cty:{US:.3,DE:.22,IN:.14,GB:.1,FR:.08,NL:.08,CA:.06,AL:.02},mob:.5,
 pages:[["/quickstart",.26],["/api",.2],["/self-host",.18],["/sdk/js",.14],["/goals",.1],["/webhooks",.07],["/faq",.05]],
 aff:{github:{"/self-host":2.2,"/api":1.5},chatgpt:{"/api":2}},
 funnel:["Landed","Read a guide","Copied a snippet","Went to app"],rates:[.58,.24,.08],kpi:3,money:null,
 goals:[["Searched the docs",.15]],spikes:[],inc:[]},
{id:"alb",name:"albas.al",note:"blog",base:3.4,curve:"evening",wk:[1.1,.95,.95,1,1,.95,1.1],
 src:{badge:.32,google:.25,direct:.2,x:.1,reddit:.08,newsletter:.05},
 cty:{AL:.3,DE:.18,US:.16,GB:.1,IN:.08,FR:.06,NL:.06,CA:.06},mob:1.3,
 pages:[["/",.35],["/posts/tirana-cafes",.22],["/posts/remote-work",.18],["/posts/side-projects",.15],["/about",.1]],
 aff:{badge:{"/":1.6},x:{"/posts/side-projects":2.5}},
 funnel:["Landed","Read to the end","Subscribed"],rates:[.34,.025],kpi:2,money:null,
 goals:[["Clicked a project",.06]],spikes:[[-12,20,0,"x",9]],inc:[]}];
export const SITES: SiteDef[] = RAW.map((site) => ({
  ...site,
  sh: norm(SRCS.map((s) => site.src[s.id] || 0)),
  dv: SRCS.map((s) => {
    const a = SRCDEV[s.id].slice()
    a[1] *= site.mob
    a[2] *= site.mob
    return norm(a)
  }),
  ct: SRCS.map((s) => norm(CTYS.map((c) => (site.cty[c.id] || 0.005) * (CTYMOD[s.id]?.[c.id] || 1)))),
  pg: SRCS.map((s) => norm(site.pages.map(([p, w]) => w * (site.aff[s.id]?.[p] || 1)))),
}))
export const SCN: Record<string, Scn> = {
 hn:{name:"HN launch spike",d:"trckable.com, Fri: a Show HN post at 14:10",site:"trk",date:[2026,9,16],start:9*60,now:16*60+30,
  spikes:[["trk",14,10,"hn",95]],inc:[],noRand:["trk"],noCty:{trk:7},boost:{trk:[85,88,1.22]},
  sales:[["trk",15,20,"new","google",{plan:2,cty:7}],["trk",16,0,"upgrade","direct",{amt:218,label:"Upgrade · Pro → Business · team of 12"}],["trk",18,40,"new","hn",{plan:1}]],
  caps:[[0,"a calm night"],[540,"a calm morning"],[850,"post on Hacker News"],[880,"pricing starts leaking"],[920,"a new customer","r"],[960,"an upgrade","r"],[1120,"a customer from HN","r"],[1230,"calm again"],[1439,"end of day"]]},
 down:{name:"Site down 23 min",d:"shop.example.dev, Thu: no answer 11:40 to 12:03",site:"shop",date:[2026,9,15],start:600,now:780,still:1,
  spikes:[],inc:[["shop",11,40,23]],noRand:[],sales:[],
  caps:[[0,"night"],[600,"a normal morning"],[700,"shop.example.dev is down"],[723,"back up after 23 min"],[780,"traffic back in the band"],[1439,"end of day"]]},
 sunday:{name:"Quiet Sunday",d:"trckable.com, Sun: all normal, one upgrade",site:"trk",date:[2026,9,11],start:480,now:480,quiet:{trk:.98},
  spikes:[],inc:[],noRand:["trk"],sales:[["trk",15,10,"upgrade","direct",{amt:20,label:"Upgrade · Hobby → Pro"}]],
  caps:[[0,"night"],[480,"a quiet Sunday"],[910,"one upgrade","r"],[1080,"still all normal"],[1439,"end of day"]]},
 newsite:{name:"Brand-new site",d:"albas.al: no visit yet",site:"alb",date:[2026,9,16],start:600,now:600,still:1,since:{alb:999},spikes:[],inc:[],noRand:[],sales:[],caps:[[0,"night"],[600,"nobody yet"],[1439,"end of day"]]},
 firstday:{name:"First day, still learning",d:"albas.al: today is the first day of data",site:"alb",date:[2026,9,16],start:900,now:900,still:1,since:{alb:89},spikes:[],inc:[],noRand:[],sales:[],caps:[[0,"night"],[900,"day one"],[1439,"end of day"]]},
 low:{name:"Low traffic",d:"albas.al: under 20 people a day",site:"alb",date:[2026,9,16],start:900,now:900,still:1,lvl:{alb:.15},spikes:[],inc:[],noRand:[],sales:[],caps:[[0,"night"],[900,"a handful of readers"],[1439,"end of day"]]},
 outage:{name:"Outage right now",d:"shop.example.dev: no answer since 11:40",site:"shop",date:[2026,9,15],start:730,now:730,still:1,spikes:[],inc:[["shop",11,40,90]],noRand:[],sales:[],caps:[[0,"night"],[700,"shop.example.dev is down"],[1439,"end of day"]]},
 revonly:{name:"Quiet day, renewals",d:"trckable.com: few visitors, three renewals",site:"trk",date:[2026,9,16],start:990,now:990,still:1,quiet:{trk:.1},spikes:[],inc:[],noRand:["trk"],sales:[["trk",9,15,"renewal","direct",{plan:1}],["trk",11,40,"renewal","google",{plan:2}],["trk",14,5,"renewal","direct",{plan:1}]],caps:[[0,"night"],[540,"a renewal","r"],[990,"still quiet"],[1439,"end of day"]]},
 nopay:{name:"Docs afternoon",d:"docs.trckable.com: a normal afternoon",site:"docs",date:[2026,9,16],start:840,now:840,still:1,spikes:[],inc:[],noRand:[],sales:[],caps:[[0,"night"],[840,"a normal afternoon"],[1439,"end of day"]]}};
export const GSC: Record<string, [string, number, number, number][]> ={
 trk:[["trckable",.13,1.3,.46],["self hosted analytics",.17,6.8,.05],["privacy friendly analytics",.14,8.9,.032],["cookieless analytics",.12,7.4,.04],["plausible alternative",.09,9.5,.03],["open source web analytics",.1,10.2,.026],["analytics without cookies",.07,12.1,.02]],
 shop:[["white sneakers",.2,5.6,.06],["leather tote bag",.15,7.2,.045],["sneaker sale",.13,6.1,.05],["minimal backpack",.12,9.3,.03],["shop example sneakers",.1,1.9,.38],["canvas bag",.1,11,.02]],
 docs:[["trckable api",.2,2.1,.31],["trckable docker compose",.16,3.4,.2],["track goals api",.14,5.8,.07],["trckable webhooks",.12,2.9,.22],["self hosted analytics docs",.1,8.3,.04],["trckable sdk js",.1,2.4,.27]],
 alb:[["tirana cafes",.24,4.2,.09],["remote work albania",.2,6.5,.05],["best cafes to work in tirana",.14,5.1,.07],["side projects to build",.1,12.4,.015],["albania digital nomad",.1,9.8,.025]]};
export const GNEW: Record<string, string> ={trk:"cookieless analytics for saas",shop:"vegan leather sneakers",docs:"trckable mcp server",alb:"tirana coworking cafes"};
export const GKIND: Record<string, Record<string, GKind>> ={hn:{trk:{t:"new"}},down:{shop:{t:"top",qi:0,m:.45}},sunday:{trk:{t:"pos",dp:-1.1}},revonly:{trk:null},nopay:{docs:{t:"top",qi:1,m:1.9}},outage:{shop:{t:"ctr",im:1.6}},low:{alb:null},newsite:{alb:null},firstday:{alb:null}};
export const PLANS: [string, number, number][] =[["Hobby",9,.45],["Pro",29,.4],["Business",87,.15]];
export const D = 90
export const END = 89
export const NH = D * 24
