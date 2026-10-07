package alerts

// resendAPI sends one email through Resend's HTTPS API. Hosts such as
// Railway block outgoing SMTP ports; port 443 is open everywhere.
type resendAPI struct {
	key      string
	endpoint string // tests point it elsewhere
}
