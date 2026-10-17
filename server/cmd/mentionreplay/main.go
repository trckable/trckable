// Command mentionreplay runs the Mentions matcher over a JSON dump of stored
// feed items and prints every hit, so a change to the matching can be checked
// against real data before Mentions is switched on. It reads a file or
// standard input, opens no database and changes nothing.
//
// The dump is {"sites": [...], "items": [...]}: each site has id, domain and
// optionally names, topic, required, excluded and blocked (the owner's words);
// each item has site (or site_id), source, url, host, title, snippet, link and
// posted_at, which are the columns of the mentions table. For example:
//
//	sqlite3 -json trckable.db "SELECT site_id, source, url, host, title, snippet, link, posted_at FROM mentions"
//
// gives the items; the sites come from the sites table and the owners' words
// (mention_keywords for names, mention_rules for the rest).
//
//	mentionreplay -in dump.json          every hit, one per line
//	mentionreplay -in dump.json -all     every item, with the reason for each refusal
//
// Exit status is 0 whatever the matcher said; the summary goes to standard error.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/mentions"
)

func main() {
	in := flag.String("in", "", "the JSON dump (default: standard input)")
	all := flag.Bool("all", false, "print the refused items too, with the reason")
	flag.Parse()
	if err := run(*in, *all, os.Stdin, os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "mentionreplay:", err)
		os.Exit(1)
	}
}

func run(path string, all bool, stdin io.Reader, out, errOut io.Writer) error {
	r := stdin
	if path != "" {
		f, err := os.Open(path) //nolint:gosec // the dump named on the command line
		if err != nil {
			return err
		}
		defer f.Close()
		r = f
	}
	var dump mentions.ReplayInput
	if err := json.NewDecoder(r).Decode(&dump); err != nil {
		return fmt.Errorf("the dump is not valid JSON: %w", err)
	}
	hits, refused, dups := 0, 0, 0
	for _, res := range mentions.Replay(dump) {
		switch {
		case res.Hit():
			hits++
			fmt.Fprintf(out, "HIT\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", res.Site, res.Source, res.Verdict.Via, res.Verdict.Word, day(res.PostedAt), clean(res.Title), res.URL)
		case res.Dup:
			dups++
			if all {
				fmt.Fprintf(out, "DUP\t%s\t%s\t\t\t%s\t%s\t%s\n", res.Site, res.Source, day(res.PostedAt), clean(res.Title), res.URL)
			}
		default:
			refused++
			if all {
				fmt.Fprintf(out, "NO\t%s\t%s\t\t%s: %s\t%s\t%s\t%s\n", res.Site, res.Source, res.Verdict.Reason, res.Verdict.Word, day(res.PostedAt), clean(res.Title), res.URL)
			}
		}
	}
	fmt.Fprintf(errOut, "%d hits, %d repeats of a story, %d refused\n", hits, dups, refused)
	return nil
}

func day(at int64) string {
	if at == 0 {
		return "-"
	}
	return time.Unix(at, 0).UTC().Format("2006-01-02")
}

// clean keeps a title on one line.
func clean(s string) string { return strings.Join(strings.Fields(s), " ") }
