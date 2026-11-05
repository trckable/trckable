package api

import (
	"fmt"
	"image"
	"math"
	"slices"
	"strings"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/query"
)

// The small numbers under the overview card's chart are the reader's pick:
// "stats" is up to cards.MaxStats of these ids, in the order given. Anything
// else is left out, and a pick with none left is the default. A stat that is
// the card's own big number (the ids that are also metrics) is never repeated.
var cardStatIDs = []string{"engaged", "avgtime", "pageviews", "visitors", "bounce", "country", "page", "source", "revenue"}

var cardStatDefault = []string{"engaged", "avgtime", "country"}

func cardStatsOf(raw, metric string) []string {
	var out []string
	for _, id := range strings.Split(raw, ",") {
		id = strings.TrimSpace(id)
		if id != "" && id != metric && slices.Contains(cardStatIDs, id) && !slices.Contains(out, id) && len(out) < cards.MaxStats {
			out = append(out, id)
		}
	}
	if len(out) > 0 {
		return out
	}
	for _, id := range cardStatDefault {
		if id != metric {
			out = append(out, id)
		}
	}
	return out
}

// stat is one small number, false when there is nothing true to say (no
// engaged visit, no time on the site, no country, no revenue connected).
func (n *cardNumbers) stat(id string, res *query.Result, icon func(host string) image.Image) (cards.Stat, bool) {
	k := res.KPIs
	switch id {
	case "engaged":
		e := engagedOf(k)
		return cards.Stat{Value: number(e), Label: cardWords.engaged}, e > 0
	case "avgtime":
		return cards.Stat{Value: duration(k.AvgSessionS), Label: cardWords.avgTime}, k.AvgSessionS >= 0.5
	case "pageviews":
		return cards.Stat{Value: number(k.Pageviews), Label: cardWords.statPageviews}, k.Pageviews > 0
	case "visitors":
		return cards.Stat{Value: number(k.Visitors), Label: cardWords.statVisitors}, k.Visitors > 0
	case "bounce":
		return cards.Stat{Value: fmt.Sprintf("%.0f%%", math.Round(k.BounceRate*100)), Label: cardWords.bounce}, k.Sessions > 0
	case "country":
		if top := res.Dims["country"]; len(top) > 0 && top[0].Visitors > 0 {
			if name := countryName(top[0].Value); name != "" {
				return cards.Stat{Value: name, Label: cardWords.topCountry, Flag: top[0].Value}, true
			}
		}
	case "page":
		if top := res.Dims["entry_page"]; len(top) > 0 && top[0].Visitors > 0 && top[0].Value != "" {
			return cards.Stat{Value: top[0].Value, Label: cardWords.topPage}, true
		}
	case "source":
		if top := res.Dims["referrer"]; len(top) > 0 && top[0].Visitors > 0 && top[0].Value != "" {
			return cards.Stat{Value: top[0].Value, Label: cardWords.topSource, Icon: icon(top[0].Value)}, true
		}
	case "revenue":
		return cards.Stat{Value: n.money, Label: cardWords.statRevenue}, n.money != ""
	}
	return cards.Stat{}, false
}
