package reports

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// Words is every sentence a client's report says, in one language, and the
// only place the server writes a number, a share, a change, a span or an
// amount. The dashboard writes the same figures with lib/format.ts: the two
// are held to the same strings by testdata/format.json (format_test.go and
// lib/format.shared.test.ts). English is the source. The others were written for this release and have not been
// read by a native speaker yet: they are marked NEEDS REVIEW below, and a
// correction is a one-line pull request to this file.
type Words struct {
	Weekly, Monthly string // the report's title
	Visitors        string
	Pageviews       string
	Bounce          string // bounce rate
	Session         string // average visit length
	Revenue         string
	Payments        string
	TopSources      string
	TopPages        string
	TopGoals        string
	DailyVisitors   string // the chart's title
	VsWeek          string // "vs the week before"
	VsMonth         string
	Up, Down        string // "up 12%", "down 12%"
	Same, New       string
	NoVisitors      string
	Stop            string // the email's "stop this report" line
	StopTitle       string // the page the link opens
	StopBody        string // takes the address
	StopButton      string
	Stopped         string
	SentBy          string // "Sent by %s"
	AI              string // the AI assistants channel
	YourWeek        string // the weekly email's title
	OpenWeek        string // its button
	Date            func(time.Time) string
	Thousands       string // the digit group separator
	Decimal         string // the decimal separator
	Months          [12]string
}

// Langs lists the languages, English first.
var Langs = []string{"en", "de", "fr", "es", "it", "nl"}

// For returns the words of a language; any other is English.
func For(lang string) Words {
	if w, ok := words[lang]; ok {
		return w
	}
	return words["en"]
}

var words = map[string]Words{
	"en": {
		Weekly: "Weekly report", Monthly: "Monthly report", Visitors: "Visitors", Pageviews: "Pageviews", Bounce: "Bounce rate", Session: "Visit length",
		Revenue: "Revenue", Payments: "payments", TopSources: "Top sources", TopPages: "Top pages", TopGoals: "Goals", DailyVisitors: "Visitors per day",
		VsWeek: "vs the week before", VsMonth: "vs the month before", Up: "up", Down: "down", Same: "about the same", New: "new",
		NoVisitors: "No visitors arrived in this period.",
		Stop:       "Stop receiving this report", StopTitle: "Stop this report", StopBody: "Stop sending this report to %s?", StopButton: "Stop it", Stopped: "Done. This report will not be sent to %s again.",
		SentBy: "Sent by %s", AI: "AI assistants", YourWeek: "Your week", OpenWeek: "Open your week", Thousands: ",",
		Months: [12]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"},
	},
	// NEEDS REVIEW: German, French, Spanish, Italian and Dutch below were not
	// checked by a native speaker.
	"de": {
		Weekly: "Wochenbericht", Monthly: "Monatsbericht", Visitors: "Besucher", Pageviews: "Seitenaufrufe", Bounce: "Absprungrate", Session: "Besuchsdauer",
		Revenue: "Umsatz", Payments: "Zahlungen", TopSources: "Top-Quellen", TopPages: "Top-Seiten", TopGoals: "Ziele", DailyVisitors: "Besucher pro Tag",
		VsWeek: "gegenüber der Vorwoche", VsMonth: "gegenüber dem Vormonat", Up: "plus", Down: "minus", Same: "ungefähr gleich", New: "neu",
		NoVisitors: "In diesem Zeitraum gab es keine Besucher.",
		Stop:       "Diesen Bericht abbestellen", StopTitle: "Bericht abbestellen", StopBody: "Diesen Bericht nicht mehr an %s senden?", StopButton: "Abbestellen", Stopped: "Erledigt. Dieser Bericht wird nicht mehr an %s gesendet.",
		SentBy: "Gesendet von %s", AI: "KI-Assistenten", YourWeek: "Deine Woche", OpenWeek: "Deine Woche öffnen", Thousands: ".",
		Months: [12]string{"Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"},
	},
	"fr": {
		Weekly: "Rapport hebdomadaire", Monthly: "Rapport mensuel", Visitors: "Visiteurs", Pageviews: "Pages vues", Bounce: "Taux de rebond", Session: "Durée de visite",
		Revenue: "Chiffre d’affaires", Payments: "paiements", TopSources: "Principales sources", TopPages: "Pages les plus vues", TopGoals: "Objectifs", DailyVisitors: "Visiteurs par jour",
		VsWeek: "par rapport à la semaine précédente", VsMonth: "par rapport au mois précédent", Up: "en hausse de", Down: "en baisse de", Same: "à peu près stable", New: "nouveau",
		NoVisitors: "Aucun visiteur sur cette période.",
		Stop:       "Ne plus recevoir ce rapport", StopTitle: "Arrêter ce rapport", StopBody: "Ne plus envoyer ce rapport à %s ?", StopButton: "Arrêter", Stopped: "C’est fait. Ce rapport ne sera plus envoyé à %s.",
		SentBy: "Envoyé par %s", AI: "Assistants IA", YourWeek: "Votre semaine", OpenWeek: "Ouvrir votre semaine", Thousands: " ",
		Months: [12]string{"janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."},
	},
	"es": {
		Weekly: "Informe semanal", Monthly: "Informe mensual", Visitors: "Visitantes", Pageviews: "Páginas vistas", Bounce: "Tasa de rebote", Session: "Duración de la visita",
		Revenue: "Ingresos", Payments: "pagos", TopSources: "Principales fuentes", TopPages: "Páginas más vistas", TopGoals: "Objetivos", DailyVisitors: "Visitantes por día",
		VsWeek: "respecto a la semana anterior", VsMonth: "respecto al mes anterior", Up: "sube", Down: "baja", Same: "casi igual", New: "nuevo",
		NoVisitors: "No hubo visitantes en este periodo.",
		Stop:       "Dejar de recibir este informe", StopTitle: "Dejar de recibir este informe", StopBody: "¿Dejar de enviar este informe a %s?", StopButton: "Dejar de enviarlo", Stopped: "Hecho. Este informe ya no se enviará a %s.",
		SentBy: "Enviado por %s", AI: "Asistentes de IA", YourWeek: "Tu semana", OpenWeek: "Abrir tu semana", Thousands: ".",
		Months: [12]string{"ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"},
	},
	"it": {
		Weekly: "Rapporto settimanale", Monthly: "Rapporto mensile", Visitors: "Visitatori", Pageviews: "Visualizzazioni di pagina", Bounce: "Frequenza di rimbalzo", Session: "Durata della visita",
		Revenue: "Ricavi", Payments: "pagamenti", TopSources: "Fonti principali", TopPages: "Pagine più viste", TopGoals: "Obiettivi", DailyVisitors: "Visitatori al giorno",
		VsWeek: "rispetto alla settimana precedente", VsMonth: "rispetto al mese precedente", Up: "in aumento del", Down: "in calo del", Same: "più o meno uguale", New: "nuovo",
		NoVisitors: "Nessun visitatore in questo periodo.",
		Stop:       "Non ricevere più questo rapporto", StopTitle: "Interrompi questo rapporto", StopBody: "Interrompere l’invio di questo rapporto a %s?", StopButton: "Interrompi", Stopped: "Fatto. Questo rapporto non sarà più inviato a %s.",
		SentBy: "Inviato da %s", AI: "Assistenti IA", YourWeek: "La tua settimana", OpenWeek: "Apri la tua settimana", Thousands: ".",
		Months: [12]string{"gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"},
	},
	"nl": {
		Weekly: "Weekrapport", Monthly: "Maandrapport", Visitors: "Bezoekers", Pageviews: "Paginaweergaven", Bounce: "Bouncepercentage", Session: "Bezoekduur",
		Revenue: "Omzet", Payments: "betalingen", TopSources: "Belangrijkste bronnen", TopPages: "Meest bekeken pagina’s", TopGoals: "Doelen", DailyVisitors: "Bezoekers per dag",
		VsWeek: "ten opzichte van de week ervoor", VsMonth: "ten opzichte van de maand ervoor", Up: "omhoog", Down: "omlaag", Same: "ongeveer gelijk", New: "nieuw",
		NoVisitors: "Er waren geen bezoekers in deze periode.",
		Stop:       "Dit rapport niet meer ontvangen", StopTitle: "Dit rapport stoppen", StopBody: "Dit rapport niet meer naar %s sturen?", StopButton: "Stoppen", Stopped: "Klaar. Dit rapport wordt niet meer naar %s gestuurd.",
		SentBy: "Verzonden door %s", AI: "AI-assistenten", YourWeek: "Jouw week", OpenWeek: "Open je week", Thousands: ".",
		Months: [12]string{"jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"},
	},
}

func init() {
	for k, w := range words {
		k, w := k, w
		w.Decimal = ","
		switch k {
		case "en":
			w.Decimal = "."
			w.Date = func(t time.Time) string { return fmt.Sprintf("%s %d", w.Months[t.Month()-1], t.Day()) }
		case "de":
			w.Date = func(t time.Time) string { return fmt.Sprintf("%d. %s", t.Day(), w.Months[t.Month()-1]) }
		default:
			w.Date = func(t time.Time) string { return fmt.Sprintf("%d %s", t.Day(), w.Months[t.Month()-1]) }
		}
		words[k] = w
	}
}

// Number groups the digits of n the way the language does.
func (w Words) Number(n int64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := fmt.Sprint(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + w.Thousands + s[i:]
	}
	if neg {
		s = "-" + s
	}
	return s
}

// Range is the period as "Sep 15 – Sep 21".
func (w Words) Range(from, to time.Time) string {
	last := to.AddDate(0, 0, -1)
	return w.Date(from) + " – " + w.Date(last)
}

// MoveFlat is the share of change below which a figure "stayed about the same".
// The dashboard's FLAT (lib/format.ts) is the same number.
const MoveFlat = 0.005

// fixed writes x with exactly digits decimals, half up (the way the dashboard
// rounds), in the language's decimal separator.
func (w Words) fixed(x float64, digits int) string {
	p := math.Pow10(digits)
	s := strconv.FormatFloat(math.Floor(x*p+0.5)/p, 'f', digits, 64)
	if w.Decimal != "." {
		s = strings.Replace(s, ".", w.Decimal, 1)
	}
	return s
}

// Percent writes a share (0.123) as a percentage: whole numbers, one decimal
// under 10% ("45%", "4.5%"). The dashboard's fmtPct.
func (w Words) Percent(x float64) string {
	digits := 0
	if x > 0 && x < 0.1 {
		digits = 1
	}
	return w.fixed(x*100, digits) + "%"
}

// MovePct writes how far a figure moved, as a share (0.034 is 3.4% either way):
// one decimal under 10, whole from 10 on, no sign. The dashboard's fmtMove.
func (w Words) MovePct(change float64) string {
	pct := math.Abs(change * 100)
	digits := 1
	if pct >= 10 || pct == 0 {
		digits = 0
	}
	return w.fixed(pct, digits)
}

// Change says how cur moved against prev: "up 12%", "down 3.4%", "about the
// same", or "new" when there was nothing before.
func (w Words) Change(cur, prev float64) string {
	if prev <= 0 {
		if cur > 0 {
			return w.New
		}
		return w.Same
	}
	d := (cur - prev) / prev
	if math.Abs(d) < MoveFlat {
		return w.Same
	}
	dir := w.Up
	if d < 0 {
		dir = w.Down
	}
	return strings.TrimSpace(dir + " " + w.MovePct(d) + "%")
}

// Duration writes a visit's length: "45s", "1m 05s", "1h 05m". The dashboard's
// fmtDuration.
func Duration(sec float64) string {
	s := int(math.Floor(sec + 0.5))
	if s < 60 {
		return fmt.Sprintf("%ds", s)
	}
	m := s / 60
	if m < 60 {
		return fmt.Sprintf("%dm %02ds", m, s%60)
	}
	return fmt.Sprintf("%dh %02dm", m/60, m%60)
}

// Money writes minor units as whole currency. The dashboard's fmtMoney with
// cents off.
func (w Words) Money(minor int64, cur string, exp int) string {
	whole := int64(math.Floor(float64(minor)/math.Pow10(exp) + 0.5))
	sym := map[string]string{"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "CHF": "CHF "}[cur]
	if sym == "" {
		return w.Number(whole) + " " + cur
	}
	return sym + w.Number(whole)
}

// MoneyCents writes a small amount (minor units, a fraction of a unit is fine:
// money per visitor) with its decimals, two at most. The dashboard's fmtMoney
// with cents on.
func (w Words) MoneyCents(minor float64, cur string, exp int) string {
	digits := min(exp, 2)
	v := w.fixed(minor/math.Pow10(exp), digits)
	sym := map[string]string{"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "CHF": "CHF "}[cur]
	if sym == "" {
		return v + " " + cur
	}
	return sym + v
}
