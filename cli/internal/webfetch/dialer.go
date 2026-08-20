package webfetch

import (
	"fmt"
	"net"
	"net/http"
	"syscall"
	"time"
)

// The guard lives here, in one place, because two very different callers need
// it: the plain Fetcher below, and the loopback proxy the headless browser is
// pointed at. Chrome resolves and connects on its own, so the only way its
// traffic stays inside the same address policy is for every byte to leave
// through a dialer built here.

// guardedDialer returns a dialer that refuses to connect anywhere the fetcher
// is not allowed to go.
//
// The address check happens at dial time, not when the URL is parsed. A
// hostname that resolves to a public address during validation can resolve to
// 127.0.0.1 a moment later when the connection is actually made (DNS
// rebinding); checking the IP the dialer is about to connect to closes that
// window, and covers redirects for free.
func guardedDialer() *net.Dialer {
	return &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
		// Control runs after DNS resolution with the concrete address about
		// to be dialled — the only place where the IP cannot change again
		// before the connection is made.
		Control: func(network, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return &ErrBlockedAddress{Reason: "unparseable address " + address}
			}
			ip := net.ParseIP(host)
			if ip == nil {
				return &ErrBlockedAddress{Reason: "unresolvable address " + host}
			}
			if reason := blockedIP(ip); reason != "" {
				return &ErrBlockedAddress{Reason: reason}
			}
			return nil
		},
	}
}

// guardedTransport returns a transport whose every connection goes through
// guardedDialer.
func guardedTransport() *http.Transport {
	return &http.Transport{
		DialContext:           guardedDialer().DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
		DisableCompression:    false,
		MaxIdleConns:          64,
		IdleConnTimeout:       30 * time.Second,
	}
}

// checkRedirect bounds a redirect chain and keeps it on http(s). The dialer
// guards the IP; this guards the scheme, so a redirect cannot walk a client
// off http(s) entirely.
func checkRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= maxRedirects {
		return fmt.Errorf("stopped after %d redirects", maxRedirects)
	}
	return checkScheme(req.URL)
}
