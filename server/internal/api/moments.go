package api

import (
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/moments"
	"github.com/trckable/trckable/server/internal/query"
)

// Moments serves GET /api/v1/sites/{site}/moments: what happened in a period,
// bucket by bucket, for Replay to tell as a story.
//
//	from, to, tz, f   as the report
//	bucket            day | hour (Replay plays nothing else)
//
// Spikes, a country's first visit ever, the first AI assistant visit (with
// the crawlers module on), sales summed per bucket, milestones reached and
// the site's notes. Aggregates only, the same as the report: never a visitor
// or a single payment. Sales and money milestones are there only where the
// report would show revenue to this reader.
func (a *API) moments(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	site := r.PathValue("site")
	bucket := r.URL.Query().Get("bucket")
	if bucket != "day" && bucket != "hour" {
		fail(w, http.StatusBadRequest, "bucket must be day or hour")
		return
	}
	ask := a.parse(w, r, site, true)
	if ask == nil {
		return
	}
	p := ask.Params
	p.Daily, p.Deep, p.Sales = false, false, p.Revenue
	res, err := a.cachedReport(r, q, p)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	out := a.spikesOf(r, q, p, ask.Loc, ask.Live)
	out = append(out, salesOf(res)...)
	out = append(out, a.firstsOf(r, q, p)...)
	out = append(out, a.dayMoments(r, site, ask)...)
	moments.Sort(out)
	if len(out) > maxMoments {
		out = out[:maxMoments]
	}
	body := map[string]any{"bucket": bucket, "moments": out}
	if res.Money != nil {
		body["currency"], body["exponent"] = res.Money.Currency, res.Money.Exponent
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	writeJSON(w, http.StatusOK, body)
}

const maxMoments = 200

// spikesOf finds the period's biggest jumps and asks who sent them. The
// baseline reaches a week before the period, so its first days have one.
func (a *API) spikesOf(r *http.Request, q *query.Q, p query.Params, loc *time.Location, live bool) []moments.Moment {
	period, step := 1, 24*time.Hour
	if p.Bucket == "hour" {
		period, step = 24, time.Hour
	}
	back := p
	back.From, back.Revenue, back.Sales, back.Goals = p.From.AddDate(0, 0, -7), false, false, false
	res, err := a.cachedReport(r, q, back)
	if err != nil {
		return nil
	}
	series := res.Series
	start := len(series)
	values := make([]int64, len(series))
	for i, pt := range series {
		values[i] = pt.Visitors
		if start == len(series) {
			if at, err := time.ParseInLocation("2006-01-02T15:04", pt.T, loc); err == nil && !at.Before(p.From) {
				start = i
			}
		}
	}
	var out []moments.Moment
	for _, s := range moments.Top(moments.Spikes(values, start, period, 7, 3, 10), 5) {
		m := moments.Moment{T: series[s.I].T, Kind: "spike", Factor: float64(int(s.Factor*10)) / 10}
		if at, err := time.ParseInLocation("2006-01-02T15:04", m.T, loc); err == nil {
			m.Referrer, _ = q.TopReferrer(r.Context(), p.Site, at.UTC(), at.Add(step).UTC())
		}
		out = append(out, m)
	}
	return out
}

// salesOf is the period's payments bucket by bucket, when the report
// carries money at all.
func salesOf(res *query.Result) []moments.Moment {
	if res.Money == nil {
		return nil
	}
	var out []moments.Moment
	for _, s := range res.Sales {
		out = append(out, moments.Moment{T: s.T, Kind: "sale", Count: s.Count, Amount: s.Amount, Channel: s.Channel})
	}
	return out
}

// firstsOf is each country's first visit ever, and the first AI assistant
// that came by in the period (crawlers module on).
func (a *API) firstsOf(r *http.Request, q *query.Q, p query.Params) []moments.Moment {
	var out []moments.Moment
	if cs, err := q.CountryFirsts(r.Context(), p.Site, p.TZ, p.From, p.To, 20); err == nil {
		for _, c := range cs {
			out = append(out, moments.Moment{T: bucketKey(c.At, p.Bucket), Kind: "country", Country: c.Country})
		}
	}
	if !a.moduleOn(r, p.Site, "crawlers") {
		return out
	}
	rep, err := q.Crawlers(r.Context(), p)
	if err != nil {
		return out
	}
	first, bot := -1, ""
	for _, s := range rep.Series {
		if s.Kind != "answer" {
			continue
		}
		for i, v := range s.Values {
			if v > 0 && (first < 0 || i < first) {
				first, bot = i, s.Name
				break
			}
		}
	}
	if first >= 0 && first < len(rep.Buckets) {
		out = append(out, moments.Moment{T: bucketKey(rep.Buckets[first], p.Bucket), Kind: "ai", Bot: bot})
	}
	return out
}

// dayMoments are the ones kept by the day: milestones reached (their family
// only where it may be shown) and the site's notes.
func (a *API) dayMoments(r *http.Request, site string, ask *asked) []moments.Moment {
	from, to := ask.From.Format("2006-01-02"), ask.To.AddDate(0, 0, -1).Format("2006-01-02")
	var out []moments.Moment
	if on, err := a.Ctl.MilestonesOn(r.Context(), site); err == nil && on {
		if list, _, err := a.visibleMilestones(r, site); err == nil {
			for _, m := range list {
				if m.Day >= from && m.Day <= to {
					out = append(out, moments.Moment{T: m.Day + "T00:00", Kind: "milestone", Family: m.Kind, Step: m.Step, Value: m.Value, Currency: m.Currency})
				}
			}
		}
	}
	if notes, err := a.Ctl.Annotations(r.Context(), site, from, to); err == nil {
		for _, n := range notes {
			out = append(out, moments.Moment{T: n.Day + "T00:00", Kind: "note", Text: n.Text})
		}
	}
	return out
}

// bucketKey is the series key an hour ("2026-09-27T20:00") falls in.
func bucketKey(hour, bucket string) string {
	if bucket == "day" && len(hour) >= 10 {
		return hour[:10] + "T00:00"
	}
	return hour
}
