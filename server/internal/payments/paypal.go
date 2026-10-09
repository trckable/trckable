package payments

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"hash/crc32"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/fx"
)

// PayPal: webhooks are signed with a certificate PayPal publishes. Following
// https://developer.paypal.com/api/rest/webhooks/rest/ (offline verification),
// the signed string is
//
//	<Paypal-Transmission-Id>|<Paypal-Transmission-Time>|<webhook id>|<crc32 of the raw body, decimal>
//
// signed with SHA256 and RSA, the signature base64 in Paypal-Transmission-Sig,
// the certificate at Paypal-Cert-Url. The webhook id (shown where the webhook
// is created) is the connection's secret. The certificate is only fetched from
// PayPal's own API hosts, must chain to a trusted root, and is cached.
//
// Payments are captures (PAYMENT.CAPTURE.*, Checkout and Payments v2) or
// sales (PAYMENT.SALE.*, subscriptions). Neither says how much of the amount
// is tax, so revenue is the amount paid. A checkout is attributed when its
// custom_id is "trckable_<visitor>" (the form Stripe's client_reference_id
// uses); a subscription carries it in its own custom_id, and its payments
// follow the subscription.
type paypal struct{}

func init() { register(paypal{}) }

func (paypal) Name() string { return "paypal" }

// PayPalEvents is what trckable subscribes to.
var PayPalEvents = []string{
	"PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED",
	"PAYMENT.SALE.COMPLETED", "PAYMENT.SALE.REFUNDED", "PAYMENT.SALE.REVERSED",
	"BILLING.SUBSCRIPTION.ACTIVATED",
	"CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED", "CUSTOMER.DISPUTE.RESOLVED",
}

// payPalStale is how old a signed transmission may be. PayPal retries a
// delivery for up to three days; a replay inside that window is harmless
// because every event id is stored once.
const payPalStale = 4 * 24 * time.Hour

// payPalHosts are the only places a signing certificate is fetched from.
var payPalHosts = map[string]bool{
	"api.paypal.com": true, "api-m.paypal.com": true,
	"api.sandbox.paypal.com": true, "api-m.sandbox.paypal.com": true,
}

// PayPalRoots are the roots a signing certificate must chain to; nil means
// the system's. Tests replace it.
var PayPalRoots *x509.CertPool

// PayPalCertFetch downloads a signing certificate chain (PEM). Tests replace it.
var PayPalCertFetch = func(u string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	res, err := HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, errors.New("certificate download answered " + res.Status)
	}
	return io.ReadAll(io.LimitReader(res.Body, 64<<10))
}

var payPalCerts = struct {
	sync.Mutex
	m map[string][]*x509.Certificate
}{m: map[string][]*x509.Certificate{}}

func payPalChain(u string) ([]*x509.Certificate, error) {
	payPalCerts.Lock()
	defer payPalCerts.Unlock()
	if c, ok := payPalCerts.m[u]; ok {
		return c, nil
	}
	raw, err := PayPalCertFetch(u)
	if err != nil {
		return nil, err
	}
	var chain []*x509.Certificate
	for len(raw) > 0 {
		var blk *pem.Block
		blk, raw = pem.Decode(raw)
		if blk == nil {
			break
		}
		if blk.Type != "CERTIFICATE" {
			continue
		}
		c, err := x509.ParseCertificate(blk.Bytes)
		if err != nil {
			return nil, err
		}
		chain = append(chain, c)
	}
	if len(chain) == 0 {
		return nil, errors.New("no certificate in the download")
	}
	if len(payPalCerts.m) >= 16 { // a handful exist; never grow without bound
		payPalCerts.m = map[string][]*x509.Certificate{}
	}
	payPalCerts.m[u] = chain
	return chain, nil
}

func payPalCertURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || !payPalHosts[strings.ToLower(u.Hostname())] {
		return false
	}
	if p := u.Port(); p != "" && p != "443" {
		return false
	}
	return strings.HasPrefix(u.Path, "/v1/notifications/certs/") && u.RawQuery == "" && u.Fragment == ""
}

func (paypal) Verify(h http.Header, body []byte, secret string, now time.Time) error {
	id, ts := h.Get("Paypal-Transmission-Id"), h.Get("Paypal-Transmission-Time")
	sigB64, certURL, algo := h.Get("Paypal-Transmission-Sig"), h.Get("Paypal-Cert-Url"), h.Get("Paypal-Auth-Algo")
	if secret == "" || id == "" || ts == "" || sigB64 == "" || certURL == "" {
		return ErrSignature
	}
	if algo != "" && !strings.EqualFold(algo, "SHA256withRSA") {
		return ErrSignature
	}
	if !payPalCertURL(certURL) {
		return ErrSignature
	}
	sent, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return ErrSignature
	}
	if d := now.Sub(sent); d > payPalStale || d < -Tolerance {
		return ErrStale
	}
	sig, err := base64.StdEncoding.DecodeString(sigB64)
	if err != nil {
		return ErrSignature
	}
	chain, err := payPalChain(certURL)
	if err != nil {
		return ErrSignature
	}
	inter := x509.NewCertPool()
	for _, c := range chain[1:] {
		inter.AddCert(c)
	}
	if _, err := chain[0].Verify(x509.VerifyOptions{Roots: PayPalRoots, Intermediates: inter, CurrentTime: now, KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageAny}}); err != nil {
		return ErrSignature
	}
	pub, ok := chain[0].PublicKey.(*rsa.PublicKey)
	if !ok {
		return ErrSignature
	}
	msg := id + "|" + ts + "|" + strings.TrimSpace(secret) + "|" + strconv.FormatUint(uint64(crc32.ChecksumIEEE(body)), 10)
	sum := sha256.Sum256([]byte(msg))
	if rsa.VerifyPKCS1v15(pub, crypto.SHA256, sum[:], sig) != nil {
		return ErrSignature
	}
	return nil
}

// minorUnits reads PayPal's decimal string ("10.50", "1000" for yen) as ISO
// 4217 minor units. Negative, malformed and over-precise amounts are refused.
func minorUnits(s, cur string) (int64, bool) {
	s = strings.TrimSpace(s)
	whole, frac, _ := strings.Cut(s, ".")
	if whole == "" || strings.HasPrefix(s, "-") {
		return 0, false
	}
	exp := fx.Exponent(cur)
	if len(frac) > exp {
		if strings.Trim(frac[exp:], "0") != "" {
			return 0, false
		}
		frac = frac[:exp]
	}
	frac += strings.Repeat("0", exp-len(frac))
	n, err := strconv.ParseInt(whole+frac, 10, 64)
	return n, err == nil && n >= 0
}

type payPalMoney struct {
	CurrencyCode string `json:"currency_code"`
	Currency     string `json:"currency"` // sales
	Value        string `json:"value"`
	Total        string `json:"total"` // sales
}

func (m payPalMoney) minor() (int64, string, bool) {
	cur, v := strings.ToUpper(m.CurrencyCode+m.Currency), m.Value+m.Total
	if !isCurrency(cur) {
		return 0, "", false
	}
	n, ok := minorUnits(v, cur)
	return n, cur, ok
}

type payPalLink struct {
	Href string `json:"href"`
	Rel  string `json:"rel"`
}

// upID is the id at the end of the "up" link of a refund or reversal: the
// capture it belongs to.
func upID(ls []payPalLink) string {
	for _, l := range ls {
		if l.Rel == "up" && strings.Contains(l.Href, "/captures/") {
			return l.Href[strings.LastIndex(l.Href, "/")+1:]
		}
	}
	return ""
}

func (paypal) Parse(body []byte) (Event, error) {
	var e struct {
		ID         string          `json:"id"`
		CreateTime string          `json:"create_time"`
		EventType  string          `json:"event_type"`
		Resource   json.RawMessage `json:"resource"`
	}
	if err := json.Unmarshal(body, &e); err != nil {
		return Event{}, err
	}
	ev := Event{Key: e.ID, Type: e.EventType, At: rfc3339ms(e.CreateTime)}
	switch e.EventType {
	case "PAYMENT.CAPTURE.COMPLETED":
		var c struct {
			ID         string      `json:"id"`
			Status     string      `json:"status"`
			Amount     payPalMoney `json:"amount"`
			CustomID   string      `json:"custom_id"`
			CreateTime string      `json:"create_time"`
		}
		if err := json.Unmarshal(e.Resource, &c); err != nil {
			return ev, err
		}
		n, cur, ok := c.Amount.minor()
		if !ok || n <= 0 || c.ID == "" || (c.Status != "" && c.Status != "COMPLETED") {
			return ev, nil
		}
		paid := rfc3339ms(c.CreateTime)
		if paid == 0 {
			paid = ev.At
		}
		ev.Payments = append(ev.Payments, Payment{ID: c.ID, PaidAt: paid, Currency: cur, Gross: n, Visitor: strictVisitor(c.CustomID), Kind: KindOneTime})

	case "PAYMENT.SALE.COMPLETED":
		var s struct {
			ID     string `json:"id"`
			State  string `json:"state"`
			Amount struct {
				payPalMoney
				Details struct {
					Tax string `json:"tax"`
				} `json:"details"`
			} `json:"amount"`
			BillingAgreement string `json:"billing_agreement_id"`
			Custom           string `json:"custom"`
			CreateTime       string `json:"create_time"`
		}
		if err := json.Unmarshal(e.Resource, &s); err != nil {
			return ev, err
		}
		n, cur, ok := s.Amount.minor()
		if !ok || n <= 0 || s.ID == "" || (s.State != "" && s.State != "completed") {
			return ev, nil
		}
		var tax *int64
		if t, ok := minorUnits(s.Amount.Details.Tax, cur); ok && s.Amount.Details.Tax != "" {
			tax = ptr(t)
		}
		paid := rfc3339ms(s.CreateTime)
		if paid == 0 {
			paid = ev.At
		}
		kind, vis := KindOneTime, strictVisitor(s.Custom)
		if s.BillingAgreement != "" {
			kind = KindSubscription // later payments of one subscription are recognised by the ledger as renewals
		}
		ev.Payments = append(ev.Payments, Payment{ID: s.ID, PaidAt: paid, Currency: cur, Gross: n, Tax: tax, SubscriptionID: s.BillingAgreement, Visitor: vis, Kind: kind})
		ev.Links = links(vis, "", s.BillingAgreement)

	case "BILLING.SUBSCRIPTION.ACTIVATED":
		var s struct {
			ID         string `json:"id"`
			CustomID   string `json:"custom_id"`
			Subscriber struct {
				PayerID string `json:"payer_id"`
			} `json:"subscriber"`
		}
		if err := json.Unmarshal(e.Resource, &s); err != nil {
			return ev, err
		}
		ev.Links = links(strictVisitor(s.CustomID), s.Subscriber.PayerID, s.ID)

	case "PAYMENT.CAPTURE.REFUNDED", "PAYMENT.SALE.REFUNDED":
		var r struct {
			ID         string       `json:"id"`
			Status     string       `json:"status"`
			State      string       `json:"state"`
			Amount     payPalMoney  `json:"amount"`
			SaleID     string       `json:"sale_id"`
			Links      []payPalLink `json:"links"`
			CreateTime string       `json:"create_time"`
		}
		if err := json.Unmarshal(e.Resource, &r); err != nil {
			return ev, err
		}
		pay := r.SaleID
		if pay == "" {
			pay = upID(r.Links)
		}
		n, cur, ok := r.Amount.minor()
		if !ok || n <= 0 || r.ID == "" || pay == "" {
			return ev, nil
		}
		st := RefundPending
		switch strings.ToUpper(r.Status + r.State) {
		case "COMPLETED":
			st = RefundSucceeded
		case "FAILED", "CANCELLED":
			st = RefundFailed
		}
		at := rfc3339ms(r.CreateTime)
		if at == 0 {
			at = ev.At
		}
		ev.Refunds = append(ev.Refunds, Refund{ID: r.ID, PaymentID: pay, Amount: n, Currency: cur, Status: st, At: at})

	case "PAYMENT.CAPTURE.REVERSED", "PAYMENT.SALE.REVERSED":
		var r struct {
			ID     string       `json:"id"`
			Amount payPalMoney  `json:"amount"`
			SaleID string       `json:"sale_id"`
			Links  []payPalLink `json:"links"`
		}
		if err := json.Unmarshal(e.Resource, &r); err != nil {
			return ev, err
		}
		pay := r.SaleID
		if pay == "" {
			pay = upID(r.Links)
		}
		if pay == "" {
			pay = r.ID
		}
		n, cur, ok := r.Amount.minor()
		if !ok || n <= 0 || pay == "" {
			return ev, nil
		}
		ev.Disputes = append(ev.Disputes, Dispute{ID: "rev:" + pay, PaymentID: pay, Amount: n, Currency: cur, Status: DisputeLost, At: ev.At})

	case "CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED", "CUSTOMER.DISPUTE.RESOLVED":
		var d struct {
			DisputeID string `json:"dispute_id"`
			Status    string `json:"status"`
			Outcome   struct {
				Code string `json:"outcome_code"`
			} `json:"dispute_outcome"`
			Transactions []struct {
				ID    string      `json:"seller_transaction_id"`
				Gross payPalMoney `json:"gross_amount"`
			} `json:"disputed_transactions"`
		}
		if err := json.Unmarshal(e.Resource, &d); err != nil {
			return ev, err
		}
		st := DisputeOpen
		if strings.EqualFold(d.Status, "RESOLVED") {
			switch d.Outcome.Code {
			case "RESOLVED_BUYER_FAVOUR":
				st = DisputeLost
			case "RESOLVED_SELLER_FAVOUR":
				st = DisputeWon
			}
		}
		for i, t := range d.Transactions {
			n, cur, ok := t.Gross.minor()
			if !ok || n <= 0 || t.ID == "" || d.DisputeID == "" {
				continue
			}
			id := d.DisputeID
			if i > 0 {
				id += ":" + t.ID
			}
			ev.Disputes = append(ev.Disputes, Dispute{ID: id, PaymentID: t.ID, Amount: n, Currency: cur, Status: st, At: ev.At})
		}
	}
	return ev, nil
}
