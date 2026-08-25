package webfetch

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// A loopback proxy so a browser's traffic stays inside the address guard.
//
// Chrome resolves its own hostnames and opens its own sockets, so pointing it
// at a URL would leave every protection in this package behind: no dial-time
// IP check, no rebinding window closed, no metadata endpoint refused. Running
// it through a proxy we own puts all of it back, because the proxy's outbound
// connections are made by guardedDialer like everything else here.
//
// The invariant this file exists to preserve: allowLoopback is NOT relaxed for
// the browser. Three connections are involved and only two are ours. Chrome's
// hop to 127.0.0.1 is made by Chrome's own stack and never reaches our dialer,
// so it needs no exemption; the proxy's hops out to the origin are guarded
// exactly as a plain Fetch would be. The comment on allowLoopback stays true:
// nothing exported reaches it.
//
// While it is alive the proxy is reachable by any process on the machine. That
// is bounded by binding to loopback only, refusing a non-loopback client,
// running every outbound dial through blockedIP, allowing only ports 80 and
// 443, and living for exactly one FetchMany call. A local process could open
// those same outbound connections itself, so the proxy hands it nothing new.
// Proxy authentication is not an option: Chrome answers Proxy-Authorization
// interactively, which is unusable headless.

// hopByHop headers are connection-scoped and must not be forwarded. Same set
// the daemon's browser endpoint strips, kept local on purpose — that handler
// builds a bare client with no address guard at all and is a precedent for
// shape, never for safety.
var hopByHop = map[string]bool{
	"connection":          true,
	"keep-alive":          true,
	"proxy-authenticate":  true,
	"proxy-authorization": true,
	"proxy-connection":    true,
	"te":                  true,
	"trailer":             true,
	"transfer-encoding":   true,
	"upgrade":             true,
}

// proxyBodyLimit bounds one proxied response. It is generous because this
// carries script bundles and fonts, not just documents — the 2 MiB article cap
// would break real pages. The render deadline is the real bound.
const proxyBodyLimit = 64 << 20

// guardProxy is an HTTP/CONNECT proxy bound to loopback whose every outbound
// connection goes through the guarded dialer.
type guardProxy struct {
	ln   net.Listener
	srv  *http.Server
	tr   *http.Transport
	dial func(ctx context.Context, network, addr string) (net.Conn, error)

	// tunnelLife bounds a hijacked connection, which carries opaque TLS and
	// so cannot be bounded by bytes the way a plain response can.
	tunnelLife time.Duration

	mu      sync.Mutex
	closed  bool
	tunnels map[net.Conn]struct{}
}

// startGuardProxy binds an ephemeral loopback port and serves until Close.
func startGuardProxy(tunnelLife time.Duration) (*guardProxy, error) {
	// Loopback literal, never ":0": a proxy on 0.0.0.0 would be reachable
	// from the network.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("starting the fetch proxy: %w", err)
	}
	tr := guardedTransport()
	// A proxy passes Content-Encoding through untouched. Letting the
	// transport add Accept-Encoding and silently decompress would leave the
	// header describing a body that is no longer encoded.
	tr.DisableCompression = true

	p := &guardProxy{
		ln:         ln,
		tr:         tr,
		dial:       guardedDialer().DialContext,
		tunnelLife: tunnelLife,
		tunnels:    map[net.Conn]struct{}{},
	}
	p.srv = &http.Server{Handler: p, ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = p.srv.Serve(ln) }()
	return p, nil
}

// Addr is the host:port to hand a browser.
func (p *guardProxy) Addr() string { return p.ln.Addr().String() }

// Close stops serving and tears down any tunnel still open.
func (p *guardProxy) Close() error {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil
	}
	p.closed = true
	open := make([]net.Conn, 0, len(p.tunnels))
	for c := range p.tunnels {
		open = append(open, c)
	}
	p.tunnels = map[net.Conn]struct{}{}
	p.mu.Unlock()

	// http.Server.Shutdown neither waits for nor terminates hijacked
	// connections, so closing them here is the only thing that actually ends
	// a tunnel. Without this they outlive the server.
	for _, c := range open {
		_ = c.Close()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	err := p.srv.Shutdown(ctx)
	p.tr.CloseIdleConnections()
	return err
}

func (p *guardProxy) track(c net.Conn) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return false
	}
	p.tunnels[c] = struct{}{}
	return true
}

func (p *guardProxy) untrack(c net.Conn) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.tunnels, c)
}

func (p *guardProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Defence in depth against a future edit of the bind address: even if the
	// listener moved off loopback, a remote client gets nothing.
	if !clientIsLocal(r.RemoteAddr) {
		http.Error(w, "proxy is loopback only", http.StatusForbidden)
		return
	}
	if r.Method == http.MethodConnect {
		p.handleConnect(w, r)
		return
	}
	p.handlePlain(w, r)
}

func clientIsLocal(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// allowAnyProxyPort widens the port rule for this package's own tests, which
// need an httptest origin on an ephemeral port. Deliberately the same shape as
// allowLoopback: package-private, set only from a test, with no exported
// field, flag or config key that reaches it.
var allowAnyProxyPort = false

// allowedProxyPort keeps the proxy from being a port scanner. blockedIP says
// which addresses are off limits, not which ports, so without this an
// attacker-chosen page could ask for :22 or :3306 on any public host and read
// the connect/refuse timing.
func allowedProxyPort(port string) bool {
	if allowAnyProxyPort {
		return true
	}
	return port == "80" || port == "443"
}

// handleConnect tunnels raw bytes to an origin after checking where they are
// going. The ordering here is load-bearing; see the comments inline.
func (p *guardProxy) handleConnect(w http.ResponseWriter, r *http.Request) {
	host, port, err := net.SplitHostPort(r.Host)
	if err != nil {
		http.Error(w, "CONNECT needs host:port", http.StatusBadRequest)
		return
	}
	if !allowedProxyPort(port) {
		http.Error(w, "only ports 80 and 443 are proxied", http.StatusForbidden)
		return
	}

	// Dial BEFORE hijacking, for two reasons. Hijack cancels the request
	// context, so a dial started afterwards with r.Context() fails at once.
	// And while the ResponseWriter is still usable a blocked address can be
	// answered with a clean 403 — the browser reports a failed tunnel, the
	// render fails, and the page the plain fetcher already read survives.
	upstream, err := p.dial(r.Context(), "tcp", net.JoinHostPort(host, port))
	if err != nil {
		status := http.StatusBadGateway
		var blocked *ErrBlockedAddress
		if errors.As(err, &blocked) {
			status = http.StatusForbidden
		}
		http.Error(w, "upstream refused", status)
		return
	}

	hj, ok := w.(http.Hijacker)
	if !ok {
		upstream.Close()
		http.Error(w, "hijacking unsupported", http.StatusInternalServerError)
		return
	}
	client, bufrw, err := hj.Hijack()
	if err != nil {
		upstream.Close()
		return
	}
	if !p.track(client) { // raced with Close
		client.Close()
		upstream.Close()
		return
	}
	defer p.untrack(client)

	deadline := time.Now().Add(p.tunnelLife)
	_ = client.SetDeadline(deadline)
	_ = upstream.SetDeadline(deadline)

	if _, err := bufrw.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n"); err != nil {
		client.Close()
		upstream.Close()
		return
	}
	if err := bufrw.Flush(); err != nil {
		client.Close()
		upstream.Close()
		return
	}

	// Drain what the client already sent. A browser pipelines the TLS
	// ClientHello immediately behind the CONNECT request, so those bytes are
	// sitting in this reader; copying straight from the raw conn would drop
	// them and the handshake would hang until the deadline.
	if n := bufrw.Reader.Buffered(); n > 0 {
		if _, err := io.CopyN(upstream, bufrw.Reader, int64(n)); err != nil {
			client.Close()
			upstream.Close()
			return
		}
	}

	var wg sync.WaitGroup
	wg.Add(2)
	pipe := func(dst, src net.Conn) {
		defer wg.Done()
		_, _ = io.Copy(dst, src)
		// Whichever direction ends first closes both, so the other copy
		// unblocks instead of waiting out the deadline.
		dst.Close()
		src.Close()
	}
	go pipe(upstream, client)
	go pipe(client, upstream)
	wg.Wait()
}

// refusePlain rejects a proxied request by dropping the connection.
//
// It must not write a body. A browser renders whatever comes back as the
// document, so a refusal with an explanation in it would be handed to the
// extractor and quoted as though the site had said it. Closing the connection
// is reported as a network error instead, which is what a refusal actually is.
//
// CONNECT does not need this: a non-200 answer to CONNECT is already a
// tunnel failure to the browser, never a page.
func refusePlain(w http.ResponseWriter) {
	if hj, ok := w.(http.Hijacker); ok {
		if conn, _, err := hj.Hijack(); err == nil {
			conn.Close()
			return
		}
	}
	http.Error(w, "refused", http.StatusForbidden)
}

// handlePlain forwards an ordinary proxied request. Chrome sends absolute-form
// request URIs to a proxy, so r.URL already carries the scheme and host.
func (p *guardProxy) handlePlain(w http.ResponseWriter, r *http.Request) {
	if r.URL == nil || r.URL.Host == "" {
		refusePlain(w)
		return
	}
	if err := checkScheme(r.URL); err != nil {
		refusePlain(w)
		return
	}
	if port := r.URL.Port(); port != "" && !allowedProxyPort(port) {
		refusePlain(w)
		return
	}

	out := r.Clone(r.Context())
	out.RequestURI = ""
	out.Close = false
	for name := range out.Header {
		if hopByHop[strings.ToLower(name)] {
			out.Header.Del(name)
		}
	}

	// RoundTrip, not a Client: a redirect is forwarded verbatim so the browser
	// re-issues it as a fresh proxied request, which gets its own guarded
	// dial. Following it here would mean tracking a chain whose later hops
	// nobody re-checks.
	resp, err := p.tr.RoundTrip(out)
	if err != nil {
		// Blocked or simply unreachable, the browser must see a failed
		// request rather than a page describing the failure.
		refusePlain(w)
		return
	}
	defer resp.Body.Close()

	dst := w.Header()
	for name, values := range resp.Header {
		if hopByHop[strings.ToLower(name)] {
			continue
		}
		for _, v := range values {
			dst.Add(name, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, io.LimitReader(resp.Body, proxyBodyLimit))
}
