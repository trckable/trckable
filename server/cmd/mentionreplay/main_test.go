package main

import (
	"bytes"
	"strings"
	"testing"
)

const dump = `{"sites":[{"id":"s1","domain":"albas.al","names":["albas"]}],
"items":[
 {"site_id":"s1","source":"news","url":"https://a.example/1","host":"a.example","title":"Dan Albas MP Report","posted_at":1760000000},
 {"site_id":"s1","source":"hn","url":"https://news.ycombinator.com/item?id=1","host":"news.ycombinator.com","title":"I use albas.al","posted_at":1760100000}
]}`

func TestReplayPrintsEveryHitAndWhyTheOthersWereRefused(t *testing.T) {
	var out, errOut bytes.Buffer
	if err := run("", false, strings.NewReader(dump), &out, &errOut); err != nil {
		t.Fatal(err)
	}
	if lines := strings.Split(strings.TrimSpace(out.String()), "\n"); len(lines) != 1 || !strings.HasPrefix(lines[0], "HIT\ts1\thn\tdomain\talbas.al\t") {
		t.Fatalf("one hit: %q", out.String())
	}
	if !strings.Contains(errOut.String(), "1 hits, 0 repeats of a story, 1 refused") {
		t.Fatalf("summary: %q", errOut.String())
	}
	out.Reset()
	if err := run("", true, strings.NewReader(dump), &out, &errOut); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "NO\ts1\tnews\t\tname without a co-word: ") && !strings.Contains(out.String(), "NO\ts1\tnews\t\tnews needs a phrase: ") {
		t.Fatalf("the refusal says why: %q", out.String())
	}
	if err := run("", false, strings.NewReader("not json"), &out, &errOut); err == nil {
		t.Fatal("a broken dump is an error")
	}
}
