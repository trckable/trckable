package ipfilter

import (
	"fmt"
	"reflect"
	"testing"
)

func TestParseAndMatch(t *testing.T) {
	for _, c := range []struct {
		entry string
		hit   []string
		miss  []string
	}{
		{"203.0.113.7", []string{"203.0.113.7", "203.0.113.7:5555", "::ffff:203.0.113.7"}, []string{"203.0.113.8", "2001:db8::1"}},
		{"203.0.113.0/24", []string{"203.0.113.0", "203.0.113.255"}, []string{"203.0.114.0", "203.0.112.255"}},
		{"203.0.113.77/24", []string{"203.0.113.1"}, []string{"203.0.114.1"}}, // typed from a host: the whole range
		{"2001:db8::1", []string{"2001:db8::1", "[2001:db8::1]:443"}, []string{"2001:db8::2", "203.0.113.7"}},
		{"2001:db8::/32", []string{"2001:db8:ffff::1", "2001:DB8::"}, []string{"2001:db9::1"}},
		{"::ffff:198.51.100.0/120", []string{"198.51.100.9"}, []string{"198.51.101.9"}}, // an IPv4 range spelled in IPv6
		{"0.0.0.0/0", []string{"8.8.8.8"}, []string{"::1"}},
	} {
		p, err := Parse(c.entry)
		if err != nil {
			t.Fatalf("%s: %v", c.entry, err)
		}
		list := Prefixes([]string{c.entry})
		if len(list) != 1 || list[0] != p {
			t.Fatalf("%s: stored list reads back as %v", c.entry, list)
		}
		for _, ip := range c.hit {
			if !Match(list, ip) {
				t.Errorf("%s should match %s", c.entry, ip)
			}
		}
		for _, ip := range c.miss {
			if Match(list, ip) {
				t.Errorf("%s should not match %s", c.entry, ip)
			}
		}
	}
}

func TestParseRefusesWhatIsNotAnAddress(t *testing.T) {
	for _, bad := range []string{"", "banana", "203.0.113", "203.0.113.256", "203.0.113.0/33", "2001:db8::/129", "203.0.113.0/", "/24", "fe80::1%eth0", "1.2.3.4-1.2.3.9", "::ffff:1.2.3.0/64", "1.2.3.4/-1", "203.0.113.0/24/8"} {
		if _, err := Parse(bad); err == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
}

func TestMatchNeverMatchesWhatItCannotRead(t *testing.T) {
	list := Prefixes([]string{"0.0.0.0/0", "::/0"})
	for _, ip := range []string{"", "unknown", "999.1.1.1", "203.0.113.7/24"} {
		if Match(list, ip) {
			t.Errorf("%q matched", ip)
		}
	}
	if Match(nil, "203.0.113.7") {
		t.Fatal("an empty list matched")
	}
}

func TestCleanKeepsOneSpellingAndDropsRepeats(t *testing.T) {
	got, err := Clean([]string{" 203.0.113.7 ", "", "203.0.113.0/24", "203.0.113.9/24", "2001:DB8:0::1", "::ffff:203.0.113.7", "203.0.113.7/32"})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"203.0.113.7", "203.0.113.0/24", "2001:db8::1"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestCleanReportsTheBadLine(t *testing.T) {
	if _, err := Clean([]string{"203.0.113.7", "nope"}); err == nil {
		t.Fatal("a bad line passed")
	}
}

func TestTheCapIsFifty(t *testing.T) {
	var lines []string
	for i := 0; i < Max; i++ {
		lines = append(lines, fmt.Sprintf("10.0.%d.1", i))
	}
	if got, err := Clean(lines); err != nil || len(got) != Max {
		t.Fatalf("fifty were refused: %d, %v", len(got), err)
	}
	if _, err := Clean(append(lines, "10.9.9.9")); err != ErrTooMany {
		t.Fatalf("a fifty-first was accepted: %v", err)
	}
	// Repeats and blank lines are not entries.
	if _, err := Clean(append(append([]string{}, lines...), "", "10.0.0.1")); err != nil {
		t.Fatalf("a repeat counted: %v", err)
	}
	// What is read back never exceeds the cap either.
	var many []string
	for i := 0; i < 80; i++ {
		many = append(many, fmt.Sprintf("10.1.%d.1", i))
	}
	if n := len(Prefixes(many)); n != Max {
		t.Fatalf("read %d", n)
	}
}
