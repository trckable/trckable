package surge

import (
	"fmt"
	"math"
	"strconv"
	"time"

	"github.com/trckable/trckable/server/internal/moments"
)

// The words of a surge in an email, a webhook or the weekly report: a friend
// who noticed, short, with only numbers that were counted, and never a cause
// that cannot be seen ("came from", never "went viral").

// Subject is the title of the alert.
const Subject = "Your site is having a moment"

func people(n int64) string {
	if n == 1 {
		return "1 person"
	}
	return strconv.FormatInt(n, 10) + " people"
}

// usually says how many a source usually sends at this hour, as a short clause.
func usually(u float64) string {
	if r := math.Round(u); r >= 1 {
		return fmt.Sprintf("usually about %d", int64(r))
	}
	return "usually next to none"
}

// from is who sent them: "34 of them came from Facebook (usually about 2)".
func (w Why) from() string {
	if w.Source == "" {
		return ""
	}
	if w.SourceDim == "channel" && w.Source == "Direct" {
		return fmt.Sprintf("%d of them came straight to the site (%s)", w.SourceN, usually(w.SourceUsual))
	}
	return fmt.Sprintf("%d of them came from %s (%s)", w.SourceN, w.Source, usually(w.SourceUsual))
}

// Body is the alert's message, with a link to the dashboard when it has one.
func Body(s Surge, domain, link string) string {
	out := fmt.Sprintf("Right now %s on %s, about %s usual for this time.", people(s.Online)+" are", domain, moments.Times(s.Factor()))
	if f := s.Why.from(); f != "" {
		out += " " + f + "."
	}
	if s.Why.Page != "" {
		out += " The page most of them are on is " + s.Why.Page + "."
	}
	if s.Why.Campaign != "" {
		out += " The campaign is " + s.Why.Campaign + "."
	}
	out += " Worth a look while it is happening."
	if link != "" {
		out += "\n\n" + link
	}
	return out
}

// Busiest is the weekly report's one line: "Busiest moment: Tue 18:45, 53 people online, mostly from Facebook."
func Busiest(s Surge, at time.Time) string {
	line := fmt.Sprintf("Busiest moment: %s, %s online", at.Format("Mon 15:04"), people(s.Online))
	if s.Why.Source != "" {
		if s.Why.SourceN*2 > s.Online {
			line += ", mostly from " + s.Why.Source
		} else {
			line += fmt.Sprintf(", %d from %s", s.Why.SourceN, s.Why.Source)
		}
	}
	return line + "."
}
