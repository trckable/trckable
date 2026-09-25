// Package alerts tells you the four things worth knowing without opening the
// dashboard: tracking stopped, today is unusual, someone paid, or the disk is
// filling up.
//
// Delivery is a webhook, because every tool already accepts one and trckable
// should not need an SMTP server to be useful; email works too once the owner
// gives it one (mail.go). The destination is checked
// before every send: a URL that resolves to a private address is refused, so
// an alert can never be turned into a probe of the network trckable runs in.
package alerts

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"
)

// Event is what a webhook receives.
type Event struct {
	Kind    string         `json:"kind"`
	Site    string         `json:"site"`
	Domain  string         `json:"domain"`
	Title   string         `json:"title"`
	Message string         `json:"message"`
	At      time.Time      `json:"at"`
	Data    map[string]any `json:"data,omitempty"`
	// Text is what a chat tool shows when it ignores everything else: Slack
	// and Mattermost read text, Discord reads content (a webhook without it
	// is refused), so the same line goes in both.
	Text    string `json:"text"`
	Content string `json:"content"`
}

// ErrUnsafeTarget is returned for a destination trckable will not call.
var ErrUnsafeTarget = fmt.Errorf("that address is not reachable from outside this server")

// CheckTarget rejects anything that is not a public https (or http) URL, or
// an email address when this server can send email.
func CheckTarget(raw string) error {
	if strings.HasPrefix(strings.TrimSpace(raw), "mailto:") {
		if Mail == nil {
			return fmt.Errorf("Email is not set up on this server: set TRCKABLE_SMTP_URL, or use a webhook")
		}
		if _, ok := mailAddress(raw); !ok {
			return fmt.Errorf("that is not an email address")
		}
		return nil
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return fmt.Errorf("a webhook URL starts with https://")
	}
	host := u.Hostname()
	// Platform-internal names never resolve publicly, and that is exactly
	// what makes them useful for probing from inside.
	if strings.HasSuffix(host, ".internal") || strings.HasSuffix(host, ".local") || host == "localhost" {
		return ErrUnsafeTarget
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("that host does not resolve")
	}
	for _, ip := range ips {
		if unsafeIP(ip) {
			return ErrUnsafeTarget
		}
	}
	return nil
}

// cgnat is the shared address space (100.64.0.0/10): carrier NAT, Tailscale,
// and some platforms' internal networks. Never a webhook.
var cgnat = &net.IPNet{IP: net.IPv4(100, 64, 0, 0), Mask: net.CIDRMask(10, 32)}

// unsafeIP is an address an alert must never reach: this machine, a private
// or internal network, link-local (the cloud metadata service lives there),
// or no address at all.
func unsafeIP(ip net.IP) bool {
	// An IPv4 address carried inside IPv6 (NAT64, 6to4) is judged as itself.
	if len(ip) == net.IPv6len && ip.To4() == nil {
		if nat64.Contains(ip) {
			return unsafeIP(net.IP(ip[12:16]))
		}
		if sixToFour.Contains(ip) {
			return unsafeIP(net.IP(ip[2:6]))
		}
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() || cgnat.Contains(ip) {
		return true
	}
	for _, n := range special {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// special are the IPv4 ranges that are no public host: "this network",
// IETF protocol assignments (192.0.0.192 is Oracle Cloud's metadata),
// benchmarking, and the reserved block.
var special = []*net.IPNet{
	mustNet("0.0.0.0/8"), mustNet("192.0.0.0/24"), mustNet("198.18.0.0/15"), mustNet("240.0.0.0/4"),
}

var (
	nat64     = mustNet("64:ff9b::/96")
	sixToFour = mustNet("2002::/16")
)

func mustNet(cidr string) *net.IPNet {
	_, n, err := net.ParseCIDR(cidr)
	if err != nil {
		panic(err)
	}
	return n
}

// safeDial refuses to connect to an unsafe address. CheckTarget looks the
// name up once; the connection looks it up again, and a DNS server that
// answers differently the second time (rebinding) would otherwise walk an
// alert straight into the internal network. This checks the address actually
// being dialled, after every lookup.
var safeDial = (&net.Dialer{
	Timeout: 5 * time.Second,
	Control: func(network, address string, _ syscall.RawConn) error {
		host, _, err := net.SplitHostPort(address)
		if err != nil {
			return err
		}
		if ip := net.ParseIP(host); ip == nil || unsafeIP(ip) {
			return ErrUnsafeTarget
		}
		return nil
	},
}).DialContext

// Send delivers one event. It is deliberately short-lived: an alert that
// cannot be delivered in five seconds is not worth holding a goroutine for.
func Send(ctx context.Context, target string, e Event) error {
	if err := CheckTarget(target); err != nil {
		return err
	}
	if e.Text == "" {
		e.Text = e.Title + " — " + e.Message
	}
	e.Content = e.Text
	if to, ok := mailAddress(target); ok {
		return Mail.send(ctx, to, e)
	}
	body, err := json.Marshal(e)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "trckable")
	client := &http.Client{
		Timeout: 5 * time.Second,
		// No proxy from the environment (it would dial on our behalf, past
		// the check), and every connection through safeDial.
		Transport: &http.Transport{Proxy: nil, DialContext: safeDial, TLSHandshakeTimeout: 5 * time.Second},
		// Redirects are where an approved destination becomes an internal
		// one, so every hop is checked again.
		CheckRedirect: func(r *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return fmt.Errorf("too many redirects")
			}
			return CheckTarget(r.URL.String())
		},
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return fmt.Errorf("the webhook answered %d", res.StatusCode)
	}
	return nil
}

// SafeClient is an HTTP client that can only reach the public internet: every
// connection goes through safeDial, so no redirect or DNS answer can walk it
// into this machine or its private network. For outbound fetches other than
// alerts (a site's favicon).
func SafeClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout:   timeout,
		Transport: &http.Transport{Proxy: nil, DialContext: safeDial, TLSHandshakeTimeout: timeout},
	}
}
