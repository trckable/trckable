package query

// GoalNames are a site's goal names as written, by key.
type GoalNames map[string]string

// Name is the goal as to be shown: its label, or the key when it has none.
func (g GoalNames) Name(key string) string {
	if l := g[key]; l != "" {
		return l
	}
	return key
}

// Name is what a row is called on screen: the goal's name as written, or its
// value.
func (r Row) Name() string {
	if r.Label != "" {
		return r.Label
	}
	return r.Value
}

// Goals returns the rows with each goal's label added. The rows it is given
// are not changed (a report may be cached). A page goal is already named by
// its value and keeps it.
func (g GoalNames) Goals(rows []Row, pages []Group) []Row {
	if len(g) == 0 || len(rows) == 0 {
		return rows
	}
	out := make([]Row, len(rows))
	copy(out, rows)
	for i := range out {
		if _, isPage := pageGoal(pages, out[i].Value); isPage {
			continue
		}
		out[i].Label = g[out[i].Value]
	}
	return out
}

// Report returns the report with its goals labelled, as a copy.
func (g GoalNames) Report(r *Result, pages []Group) *Result {
	if r == nil || len(g) == 0 || len(r.Goals) == 0 {
		return r
	}
	c := *r
	c.Goals = g.Goals(r.Goals, pages)
	return &c
}

// Funnel labels the goal steps.
func (g GoalNames) Funnel(steps []FunnelStep) []FunnelStep {
	for i := range steps {
		if steps[i].Kind == "goal" {
			steps[i].Label = g[steps[i].Value]
		}
	}
	return steps
}

// Journey labels the goals of one visitor's history.
func (g GoalNames) Journey(j *Journey) {
	if j == nil {
		return
	}
	for v := range j.Visits {
		for e := range j.Visits[v].Events {
			if ev := &j.Visits[v].Events[e]; ev.Kind == "goal" {
				ev.Label = g[ev.Goal]
			}
		}
	}
}
