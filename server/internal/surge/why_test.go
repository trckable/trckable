package surge

import (
	"reflect"
	"testing"
)

func TestNameGroupsAReferrersHosts(t *testing.T) {
	for host, want := range map[string]string{
		"l.facebook.com": "Facebook", "m.facebook.com": "Facebook", "www.reddit.com": "Reddit", "news.ycombinator.com": "Hacker News",
		"t.co": "X", "blog.example.org": "example.org",
	} {
		if got := Name(host); got != want && !(host == "blog.example.org" && got == "blog.example.org") {
			t.Errorf("Name(%q) = %q, want %q", host, got, want)
		}
	}
}

func TestBuildSaysWhoSentThem(t *testing.T) {
	why, hosts := Build(Seen{
		Online: 53, Before: 20,
		Hosts:     []Count{{"l.facebook.com", 20}, {"m.facebook.com", 14}, {"google.com", 6}},
		Channels:  []Count{{"Social", 34}, {"Direct", 13}, {"Search", 6}},
		Pages:     []Count{{"/blog/launch-post", 30}, {"/", 12}},
		Countries: []Count{{"US", 40}, {"DE", 8}},
		Campaigns: []Count{{"launch", 25}},
	}, 15)
	if why.Source != "Facebook" || why.SourceN != 34 || why.SourceDim != "referrer" || why.SourceValue != "l.facebook.com" {
		t.Fatalf("source: %+v", why)
	}
	if !reflect.DeepEqual(hosts, []string{"l.facebook.com", "m.facebook.com"}) {
		t.Fatalf("hosts: %v", hosts)
	}
	if why.Page != "/blog/launch-post" || why.PageN != 30 || why.Country != "US" || why.CountryN != 40 || why.Campaign != "launch" || why.Before != 20 || why.Minutes != 15 {
		t.Fatalf("rest: %+v", why)
	}
}

// Without a referring site that most of them share, the channel is the
// source; a country that does not hold most of them is not told; a page one
// person is on is not "the page".
func TestBuildFallsBackAndStaysSilentWhenNothingStandsOut(t *testing.T) {
	why, hosts := Build(Seen{
		Online: 40, Hosts: []Count{{"google.com", 5}}, Channels: []Count{{"Direct", 30}, {"Search", 5}},
		Pages: []Count{{"/", 1}}, Countries: []Count{{"US", 15}, {"DE", 10}}, Campaigns: []Count{{"x", 1}},
	}, 15)
	if why.Source != "Direct" || why.SourceDim != "channel" || why.SourceN != 30 || hosts != nil {
		t.Fatalf("source: %+v %v", why, hosts)
	}
	if why.Page != "" || why.Country != "" || why.Campaign != "" {
		t.Fatalf("told what does not stand out: %+v", why)
	}
}
