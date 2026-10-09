package payments

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"hash/crc32"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

const (
	testCertURL = "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-1d93a270"
	testHookID  = "1AB23456CD789012E"
)

// ppSigner is a stand-in for PayPal: a root, a leaf signing certificate and
// the PEM chain the certificate URL would serve.
type ppSigner struct {
	key  *rsa.PrivateKey
	pem  []byte
	root *x509.CertPool
	now  time.Time
}

func newSigner(t *testing.T) *ppSigner {
	t.Helper()
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	caKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	caTpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "Test Root"}, NotBefore: now.AddDate(-1, 0, 0), NotAfter: now.AddDate(5, 0, 0),
		IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	caDER, err := x509.CreateCertificate(rand.Reader, caTpl, caTpl, &caKey.PublicKey, caKey)
	if err != nil {
		t.Fatal(err)
	}
	ca, _ := x509.ParseCertificate(caDER)
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	leafTpl := &x509.Certificate{SerialNumber: big.NewInt(2), Subject: pkix.Name{CommonName: "api.sandbox.paypal.com"}, NotBefore: now.AddDate(0, -1, 0), NotAfter: now.AddDate(1, 0, 0),
		KeyUsage: x509.KeyUsageDigitalSignature}
	leafDER, err := x509.CreateCertificate(rand.Reader, leafTpl, ca, &key.PublicKey, caKey)
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(ca)
	chain := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: leafDER})
	chain = append(chain, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER})...)
	return &ppSigner{key: key, pem: chain, root: pool, now: now}
}

// install points the verifier at this signer and counts certificate downloads.
func (s *ppSigner) install(t *testing.T) *int {
	t.Helper()
	oldRoots, oldFetch := PayPalRoots, PayPalCertFetch
	payPalCerts.Lock()
	payPalCerts.m = map[string][]*x509.Certificate{}
	payPalCerts.Unlock()
	downloads := 0
	PayPalRoots = s.root
	PayPalCertFetch = func(u string) ([]byte, error) {
		downloads++
		if u != testCertURL {
			return nil, errors.New("unexpected certificate URL " + u)
		}
		return s.pem, nil
	}
	t.Cleanup(func() { PayPalRoots, PayPalCertFetch = oldRoots, oldFetch })
	return &downloads
}

func (s *ppSigner) sign(key *rsa.PrivateKey, id, ts, hook string, body []byte) string {
	msg := id + "|" + ts + "|" + hook + "|" + strconv.FormatUint(uint64(crc32.ChecksumIEEE(body)), 10)
	sum := sha256.Sum256([]byte(msg))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		panic(err)
	}
	return base64.StdEncoding.EncodeToString(sig)
}

func (s *ppSigner) headers(body []byte) http.Header {
	ts := s.now.Format(time.RFC3339)
	h := http.Header{}
	h.Set("PAYPAL-TRANSMISSION-ID", "69cd13f0-d67a-11e5-baa3-778b53f4ae55")
	h.Set("PAYPAL-TRANSMISSION-TIME", ts)
	h.Set("PAYPAL-TRANSMISSION-SIG", s.sign(s.key, "69cd13f0-d67a-11e5-baa3-778b53f4ae55", ts, testHookID, body))
	h.Set("PAYPAL-CERT-URL", testCertURL)
	h.Set("PAYPAL-AUTH-ALGO", "SHA256withRSA")
	return h
}

var ppBody = []byte(`{"id":"WH-1","event_type":"PAYMENT.CAPTURE.COMPLETED","create_time":"2026-10-01T11:59:00.000Z","resource":{"id":"CAP-1","status":"COMPLETED","amount":{"currency_code":"EUR","value":"12.50"}}}`)

func TestPayPalVerifiesTheDocumentedSignature(t *testing.T) {
	s := newSigner(t)
	downloads := s.install(t)
	p := paypal{}
	if err := p.Verify(s.headers(ppBody), ppBody, testHookID, s.now); err != nil {
		t.Fatalf("genuine webhook refused: %v", err)
	}
	if err := p.Verify(s.headers(ppBody), ppBody, testHookID, s.now); err != nil || *downloads != 1 {
		t.Fatalf("second webhook: %v, %d certificate downloads (want 1, cached)", err, *downloads)
	}
}

func TestPayPalRefusesWhatIsNotGenuine(t *testing.T) {
	s := newSigner(t)
	s.install(t)
	other := newSigner(t) // a different key and root: a forger's own certificate
	p := paypal{}
	tamper := func(f func(h http.Header)) http.Header {
		h := s.headers(ppBody)
		f(h)
		return h
	}
	cases := map[string]struct {
		h      http.Header
		body   []byte
		secret string
		now    time.Time
		want   error
	}{
		"body changed":     {s.headers(ppBody), []byte(strings.Replace(string(ppBody), "12.50", "99.50", 1)), testHookID, s.now, ErrSignature},
		"wrong webhook id": {s.headers(ppBody), ppBody, "1AB23456CD789012F", s.now, ErrSignature},
		"no webhook id":    {s.headers(ppBody), ppBody, "", s.now, ErrSignature},
		"signed by a forger": {tamper(func(h http.Header) {
			h.Set("PAYPAL-TRANSMISSION-SIG", s.sign(other.key, "69cd13f0-d67a-11e5-baa3-778b53f4ae55", s.now.Format(time.RFC3339), testHookID, ppBody))
		}), ppBody, testHookID, s.now, ErrSignature},
		"id changed":        {tamper(func(h http.Header) { h.Set("PAYPAL-TRANSMISSION-ID", "someone-elses") }), ppBody, testHookID, s.now, ErrSignature},
		"signature garbage": {tamper(func(h http.Header) { h.Set("PAYPAL-TRANSMISSION-SIG", "!!!") }), ppBody, testHookID, s.now, ErrSignature},
		"no signature":      {tamper(func(h http.Header) { h.Del("PAYPAL-TRANSMISSION-SIG") }), ppBody, testHookID, s.now, ErrSignature},
		"other algorithm":   {tamper(func(h http.Header) { h.Set("PAYPAL-AUTH-ALGO", "SHA1withRSA") }), ppBody, testHookID, s.now, ErrSignature},
		"time not a time":   {tamper(func(h http.Header) { h.Set("PAYPAL-TRANSMISSION-TIME", "yesterday") }), ppBody, testHookID, s.now, ErrSignature},
		"days old":          {s.headers(ppBody), ppBody, testHookID, s.now.Add(5 * 24 * time.Hour), ErrStale},
		"from the future":   {s.headers(ppBody), ppBody, testHookID, s.now.Add(-time.Hour), ErrStale},
		"cert outside paypal": {tamper(func(h http.Header) {
			h.Set("PAYPAL-CERT-URL", "https://api.sandbox.paypal.com.evil.example/v1/notifications/certs/x")
		}), ppBody, testHookID, s.now, ErrSignature},
		"cert over http":  {tamper(func(h http.Header) { h.Set("PAYPAL-CERT-URL", "http://api.paypal.com/v1/notifications/certs/x") }), ppBody, testHookID, s.now, ErrSignature},
		"cert wrong path": {tamper(func(h http.Header) { h.Set("PAYPAL-CERT-URL", "https://api.paypal.com/v1/other/x") }), ppBody, testHookID, s.now, ErrSignature},
		"cert with userinfo": {tamper(func(h http.Header) {
			h.Set("PAYPAL-CERT-URL", "https://api.paypal.com@evil.example/v1/notifications/certs/x")
		}), ppBody, testHookID, s.now, ErrSignature},
	}
	for name, c := range cases {
		if err := p.Verify(c.h, c.body, c.secret, c.now); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", name, err, c.want)
		}
	}

	// A certificate that does not chain to PayPal's root is refused even
	// when the signature itself is perfect.
	PayPalRoots = other.root
	payPalCerts.Lock()
	payPalCerts.m = map[string][]*x509.Certificate{}
	payPalCerts.Unlock()
	if err := p.Verify(s.headers(ppBody), ppBody, testHookID, s.now); !errors.Is(err, ErrSignature) {
		t.Errorf("untrusted root: %v", err)
	}
}

func TestPayPalCertificateDownloadFailureIsRefusal(t *testing.T) {
	s := newSigner(t)
	s.install(t)
	PayPalCertFetch = func(string) ([]byte, error) { return []byte("not a certificate"), nil }
	if err := (paypal{}).Verify(s.headers(ppBody), ppBody, testHookID, s.now); !errors.Is(err, ErrSignature) {
		t.Fatalf("%v", err)
	}
	PayPalCertFetch = func(string) ([]byte, error) { return nil, errors.New("down") }
	if err := (paypal{}).Verify(s.headers(ppBody), ppBody, testHookID, s.now); !errors.Is(err, ErrSignature) {
		t.Fatalf("%v", err)
	}
}

func TestMinorUnits(t *testing.T) {
	for _, c := range []struct {
		in, cur string
		want    int64
		ok      bool
	}{
		{"10.50", "USD", 1050, true}, {"10", "USD", 1000, true}, {"0.05", "EUR", 5, true}, {"10.5", "USD", 1050, true},
		{"1000", "JPY", 1000, true}, {"1000.00", "JPY", 1000, true}, {"1000.50", "JPY", 0, false},
		{"10.505", "USD", 0, false}, {"10.500", "USD", 1050, true},
		{"-5.00", "USD", 0, false}, {"", "USD", 0, false}, {"abc", "USD", 0, false}, {".50", "USD", 0, false}, {"1e3", "USD", 0, false},
	} {
		got, ok := minorUnits(c.in, c.cur)
		if ok != c.ok || (ok && got != c.want) {
			t.Errorf("minorUnits(%q, %s) = %d, %v; want %d, %v", c.in, c.cur, got, ok, c.want, c.ok)
		}
	}
}

func TestPayPalCapture(t *testing.T) {
	body := `{"id":"WH-1","event_type":"PAYMENT.CAPTURE.COMPLETED","create_time":"2026-10-01T11:59:00.000Z","resource":{"id":"CAP-1","status":"COMPLETED","amount":{"currency_code":"EUR","value":"12.50"},"custom_id":"trckable_k3j2_m1a2b3","create_time":"2026-10-01T11:58:59Z"}}`
	ev, err := (paypal{}).Parse([]byte(body))
	if err != nil || ev.Key != "WH-1" || len(ev.Payments) != 1 {
		t.Fatalf("%+v %v", ev, err)
	}
	p := ev.Payments[0]
	if p.ID != "CAP-1" || p.Gross != 1250 || p.Currency != "EUR" || p.Visitor != ParseVisitor("k3j2") || p.Kind != KindOneTime {
		t.Fatalf("%+v", p)
	}
	// A custom_id that is somebody else's order number is no visitor.
	ev, _ = (paypal{}).Parse([]byte(strings.Replace(body, "trckable_k3j2_m1a2b3", "order1234", 1)))
	if ev.Payments[0].Visitor != 0 {
		t.Fatal("order number taken for a visitor")
	}
}

func TestPayPalIgnoresWhatIsNotAPayment(t *testing.T) {
	for name, body := range map[string]string{
		"pending":        `{"id":"1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"C","status":"PENDING","amount":{"currency_code":"USD","value":"5.00"}}}`,
		"zero":           `{"id":"1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"C","status":"COMPLETED","amount":{"currency_code":"USD","value":"0.00"}}}`,
		"negative":       `{"id":"1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"C","status":"COMPLETED","amount":{"currency_code":"USD","value":"-4.00"}}}`,
		"no currency":    `{"id":"1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"C","status":"COMPLETED","amount":{"value":"4.00"}}}`,
		"bad currency":   `{"id":"1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"C","status":"COMPLETED","amount":{"currency_code":"US1","value":"4.00"}}}`,
		"declined":       `{"id":"1","event_type":"PAYMENT.CAPTURE.DECLINED","resource":{"id":"C","amount":{"currency_code":"USD","value":"4.00"}}}`,
		"sale not done":  `{"id":"1","event_type":"PAYMENT.SALE.COMPLETED","resource":{"id":"S","state":"pending","amount":{"total":"4.00","currency":"USD"}}}`,
		"refund no link": `{"id":"1","event_type":"PAYMENT.CAPTURE.REFUNDED","resource":{"id":"R","status":"COMPLETED","amount":{"currency_code":"USD","value":"4.00"}}}`,
		"other event":    `{"id":"1","event_type":"CHECKOUT.ORDER.APPROVED","resource":{"id":"O"}}`,
	} {
		ev, err := (paypal{}).Parse([]byte(body))
		if err != nil || !ev.Empty() {
			t.Errorf("%s: %+v %v", name, ev, err)
		}
	}
	if _, err := (paypal{}).Parse([]byte(`{"event_type":`)); err == nil {
		t.Error("broken JSON accepted")
	}
}

func TestPayPalRefundReversalAndDispute(t *testing.T) {
	ref, _ := (paypal{}).Parse([]byte(`{"id":"WH-r","event_type":"PAYMENT.CAPTURE.REFUNDED","create_time":"2026-10-02T10:00:00Z","resource":{"id":"REF-1","status":"PENDING","amount":{"currency_code":"USD","value":"5.00"},"links":[{"href":"https://api.paypal.com/v2/payments/refunds/REF-1","rel":"self"},{"href":"https://api.paypal.com/v2/payments/captures/CAP-9","rel":"up"}]}}`))
	if len(ref.Refunds) != 1 || ref.Refunds[0].PaymentID != "CAP-9" || ref.Refunds[0].Amount != 500 || ref.Refunds[0].Status != RefundPending {
		t.Fatalf("%+v", ref.Refunds)
	}
	rev, _ := (paypal{}).Parse([]byte(`{"id":"WH-v","event_type":"PAYMENT.CAPTURE.REVERSED","create_time":"2026-10-03T10:00:00Z","resource":{"id":"REV-1","amount":{"currency_code":"USD","value":"5.00"},"links":[{"href":"https://api.paypal.com/v2/payments/captures/CAP-9","rel":"up"}]}}`))
	if len(rev.Disputes) != 1 || rev.Disputes[0].PaymentID != "CAP-9" || rev.Disputes[0].Status != DisputeLost {
		t.Fatalf("%+v", rev.Disputes)
	}
	open, _ := (paypal{}).Parse([]byte(`{"id":"WH-d","event_type":"CUSTOMER.DISPUTE.CREATED","create_time":"2026-10-04T10:00:00Z","resource":{"dispute_id":"PP-D-9","status":"OPEN","disputed_transactions":[{"seller_transaction_id":"CAP-9","gross_amount":{"currency_code":"USD","value":"5.00"}}]}}`))
	won, _ := (paypal{}).Parse([]byte(`{"id":"WH-w","event_type":"CUSTOMER.DISPUTE.RESOLVED","create_time":"2026-10-09T10:00:00Z","resource":{"dispute_id":"PP-D-9","status":"RESOLVED","dispute_outcome":{"outcome_code":"RESOLVED_SELLER_FAVOUR"},"disputed_transactions":[{"seller_transaction_id":"CAP-9","gross_amount":{"currency_code":"USD","value":"5.00"}}]}}`))
	if open.Disputes[0].Status != DisputeOpen || won.Disputes[0].Status != DisputeWon || open.Disputes[0].ID != won.Disputes[0].ID || won.Disputes[0].At <= open.Disputes[0].At {
		t.Fatalf("%+v %+v", open.Disputes, won.Disputes)
	}
}

func TestPayPalSubscriptionSaleCarriesTax(t *testing.T) {
	ev, _ := (paypal{}).Parse([]byte(`{"id":"WH-s","event_type":"PAYMENT.SALE.COMPLETED","create_time":"2026-10-02T10:00:00Z","resource":{"id":"S-1","state":"completed","amount":{"total":"23.80","currency":"EUR","details":{"subtotal":"20.00","tax":"3.80"}},"billing_agreement_id":"I-X"}}`))
	p := ev.Payments[0]
	if p.Gross != 2380 || p.Tax == nil || *p.Tax != 380 || p.SubscriptionID != "I-X" || p.Kind != KindSubscription {
		t.Fatalf("%+v", p)
	}
}
