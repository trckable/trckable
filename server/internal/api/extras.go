package api

import (
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/trckable/trckable/server/internal/insights"
	"github.com/trckable/trckable/server/internal/moments"
	"github.com/trckable/trckable/server/internal/query"
)

// What Full mode's Data view says beyond the lists: highlights, markers on
// the chart, the pages that sell and the latest buyers. Each one reads the
// report's own numbers; none of them shows a visitor's identity.

// insights serves GET /api/v1/sites/{site}/insights: up to four lines about
// the period against the one before it (same length, right before), by rules
// with a floor on volume (package insights). An empty list is the answer of a
// quiet site. Filters are not applied: these are about the whole site.
func (a *API) insights(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	ask := a.parse(w, r, r.PathValue("site"), true)
	if ask == nil {
		return
	}
	cur := ask.Params
	cur.Filters, cur.Daily, cur.Deep, cur.Sales = nil, false, false, false
	prev := cur
	prev.From, prev.To = cur.From.Add(-cur.To.Sub(cur.From)), cur.From
	now, err := a.cachedReport(r, q, cur)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	was, err := a.cachedReport(r, q, prev)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	in := insights.Input{
		Visitors: now.KPIs.Visitors, Channels: now.Dims["channel"], PrevChannels: was.Dims["channel"],
		Pages: now.Dims["entry_page"], PrevPages: was.Dims["entry_page"], HasRevenue: now.Money != nil,
	}
	if fresh, err := q.NewReferrers(r.Context(), cur.Site, cur.From, cur.To, 5); err == nil {
		for _, n := range fresh {
			in.Newcomers = append(in.Newcomers, insights.Newcomer{Referrer: n.Referrer, Visitors: n.Visitors})
		}
	}
	out := map[string]any{"insights": insights.Find(in), "approximate": now.Approximate || was.Approximate}
	if now.Money != nil {
		out["currency"], out["exponent"] = now.Money.Currency, now.Money.Exponent
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	writeJSON(w, http.StatusOK, out)
}

// Marker is one ring on the main chart: a spike of visitors (with who sent
// them) or a burst of sales, at the bucket it happened in.
type Marker struct {
	T        string  `json:"t"`
	Kind     string  `json:"kind"` // spike | sale
	Factor   float64 `json:"factor"`
	Referrer string  `json:"referrer,omitempty"` // spike: the referring site that sent most of it
	Count    int64   `json:"count,omitempty"`    // sale: payments in the bucket
	Amount   int64   `json:"amount,omitempty"`   // sale: net, minor units
	Channel  string  `json:"channel,omitempty"`  // sale: the channel that earned most of it
}

// MaxMarkers is how many rings a chart carries: a chart with more says nothing.
const MaxMarkers = 3

// markersOf keeps the strongest of the spikes and the sale bursts, at most
// MaxMarkers, one to a bucket (a spike that is also a burst is one spike that
// also says its sales), in time order.
func markersOf(spikes []moments.Moment, bursts []Marker) []Marker {
	all := make([]Marker, 0, len(spikes)+len(bursts))
	for _, s := range spikes {
		all = append(all, Marker{T: s.T, Kind: "spike", Factor: s.Factor, Referrer: s.Referrer})
	}
	all = append(all, bursts...)
	sort.SliceStable(all, func(i, j int) bool {
		if all[i].Factor != all[j].Factor {
			return all[i].Factor > all[j].Factor
		}
		return all[i].T < all[j].T
	})
	out := []Marker{}
	at := map[string]int{}
	for _, m := range all {
		if i, ok := at[m.T]; ok {
			if m.Kind == "sale" && out[i].Kind == "spike" {
				out[i].Count, out[i].Amount, out[i].Channel = m.Count, m.Amount, m.Channel
			}
			continue
		}
		if len(out) == MaxMarkers {
			continue
		}
		at[m.T] = len(out)
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].T < out[j].T })
	return out
}

// burstsOf turns the period's sale buckets into bursts.
func burstsOf(res *query.Result) []Marker {
	if res.Money == nil || len(res.Series) == 0 {
		return nil
	}
	by := map[string]query.SaleBucket{}
	for _, s := range res.Sales {
		by[s.T] = s
	}
	counts := make([]int64, len(res.Series))
	for i, pt := range res.Series {
		counts[i] = by[pt.T].Count
	}
	var out []Marker
	for _, b := range moments.Bursts(counts, 3, 2) {
		s := by[res.Series[b.I].T]
		out = append(out, Marker{T: s.T, Kind: "sale", Factor: float64(int(b.Factor*10)) / 10, Count: s.Count, Amount: s.Amount, Channel: s.Channel})
	}
	return out
}

// markers serves GET /api/v1/sites/{site}/markers: the rings on the main
// chart. bucket is day (the default) or hour; the dashboard puts a day's ring
// on the week or month bucket that holds it.
func (a *API) markers(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	bucket := r.URL.Query().Get("bucket")
	if bucket == "" {
		bucket = "day"
	}
	if bucket != "day" && bucket != "hour" {
		fail(w, http.StatusBadRequest, "bucket must be day or hour")
		return
	}
	ask := a.parse(w, r, r.PathValue("site"), true)
	if ask == nil {
		return
	}
	p := ask.Params
	p.Bucket, p.Daily, p.Deep, p.Sales = bucket, false, false, p.Revenue
	res, err := a.cachedReport(r, q, p)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	out := map[string]any{"bucket": bucket, "markers": markersOf(a.spikesOf(r, q, p, ask.Loc, ask.Live), burstsOf(res))}
	if res.Money != nil {
		out["currency"], out["exponent"] = res.Money.Currency, res.Money.Exponent
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	writeJSON(w, http.StatusOK, out)
}

// pagesSell serves GET /api/v1/sites/{site}/report/pages-sell: the revenue
// credited to visits that read each page (revenue module on). A sale counts
// under every page of the visit that earned it, so the rows add up to more
// than the revenue.
func (a *API) pagesSell(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "revenue") {
		return
	}
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	ask := a.parse(w, r, r.PathValue("site"), true)
	if ask == nil {
		return
	}
	p := ask.Params
	p.Daily, p.Deep, p.Sales, p.SalePages = false, false, false, true
	res, err := a.cachedReport(r, q, p)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	out := map[string]any{"pages": res.SalePages}
	if out["pages"] == nil {
		out["pages"] = []query.Row{}
	}
	if res.Money != nil {
		out["currency"], out["exponent"] = res.Money.Currency, res.Money.Exponent
	}
	writeJSON(w, http.StatusOK, out)
}

// Buyer is one sale and the path that led to it: where the buyer came from,
// the first pages of that visit, how many visits and how long it took. Never
// a name, an email or an id.
type Buyer struct {
	At       time.Time `json:"at"`
	Amount   int64     `json:"amount"` // net, minor units
	Kind     string    `json:"kind"`
	Channel  string    `json:"channel,omitempty"`
	Referrer string    `json:"referrer,omitempty"`
	Pages    []string  `json:"pages,omitempty"`
	Visits   int       `json:"visits,omitempty"`
	Seconds  int64     `json:"seconds,omitempty"` // from the first visit to the sale
}

// MaxBuyerPages is how many pages of the winning visit a line names.
const MaxBuyerPages = 3

// buyerOf reads one journey the way a sale is credited: the latest visit that
// came from somewhere, else the latest of all, before the payment.
func buyerOf(f time.Time, j *query.Journey) (visits int, first time.Time, pick *query.JourneyVisit) {
	for i := range j.Visits {
		v := &j.Visits[i] // newest first
		if v.Start.After(f.Add(time.Minute)) {
			continue
		}
		visits++
		if first.IsZero() || v.Start.Before(first) {
			first = v.Start
		}
		if pick == nil {
			pick = v
		}
		if pickDirect(pick) && !pickDirect(v) && f.Sub(v.Start) <= query.AttributionWindow {
			pick = v
		}
	}
	return visits, first, pick
}

func pickDirect(v *query.JourneyVisit) bool { return v.Channel == "" || v.Channel == "Direct" }

// buyers serves GET /api/v1/sites/{site}/buyers: the latest sales in the
// period (new customers, not renewals), newest first, each with its path.
// Needs the revenue and journeys modules: the same reads the People tab and
// the report already make.
func (a *API) buyers(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "revenue") || !a.needs(w, r, "journeys") {
		return
	}
	q, p, ok := a.params(w, r)
	if !ok {
		return
	}
	if a.Revenue == nil {
		writeJSON(w, http.StatusOK, map[string]any{"buyers": []Buyer{}})
		return
	}
	n, _ := strconv.Atoi(r.URL.Query().Get("n"))
	if n <= 0 || n > 20 {
		n = 8
	}
	facts, err := a.Revenue.Facts(r.Context(), p.Site, p.Currency, p.From, p.To, false)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	sort.SliceStable(facts, func(i, j int) bool { return facts[i].PaidAt.After(facts[j].PaidAt) })
	out := []Buyer{}
	for _, f := range facts {
		if len(out) == n {
			break
		}
		if f.Kind == "renewal" || !f.Converted {
			continue
		}
		b := Buyer{At: f.PaidAt, Amount: f.Amount - f.Refunded, Kind: f.Kind}
		if f.Visitor != 0 {
			if j, err := q.Journey(r.Context(), p.Site, f.Visitor, f.PaidAt.Add(time.Minute)); err == nil {
				visits, first, pick := buyerOf(f.PaidAt, j)
				b.Visits = visits
				if !first.IsZero() {
					b.Seconds = int64(f.PaidAt.Sub(first).Seconds())
				}
				if pick != nil {
					b.Channel, b.Referrer, b.Pages = pick.Channel, pick.Referrer, pagesOf(pick)
				}
			}
		}
		out = append(out, b)
	}
	resp := map[string]any{"buyers": out, "currency": p.Currency}
	writeJSON(w, http.StatusOK, resp)
}

// pagesOf is the first distinct pages of a visit, in the order they were opened.
func pagesOf(v *query.JourneyVisit) []string {
	var out []string
	for _, e := range v.Events {
		if e.Kind != "pageview" || e.Path == "" || len(out) == MaxBuyerPages {
			continue
		}
		if len(out) == 0 || out[len(out)-1] != e.Path {
			out = append(out, e.Path)
		}
	}
	return out
}
