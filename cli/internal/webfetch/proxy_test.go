package webfetch

import (
	"bufio"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// ── Guarded proxy ─────────────────────────────────────────────────────────

// Go's own transport speaks the same proxy protocol a browser does, CONNECT
// included, so the whole proxy is exercised here without a browser anywhere.

func startTestProxy(t *testing.T) *guardProxy {
	t.Helper()
	p, err := startGuardProxy(20 * time.Second)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { p.Close() })
	return p
}

// clientThrough builds a client that sends everything through p.
func clientThrough(t *testing.T, p *guardProxy) *http.Client {
	t.Helper()
	u, err := url.Parse("http://" + p.Addr())
	if err != nil {
		t.Fatal(err)
	}
	return &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			Proxy:           http.ProxyURL(u),
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
}

func TestGuardProxyListensOnLoopbackOnly(t *testing.T) {
	p := startTestProxy(t)
	host, _, err := net.SplitHostPort(p.Addr())
	if err != nil {
		t.Fatal(err)
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		t.Errorf("Addr() = %q, want a loopback address", p.Addr())
	}
}

func TestGuardProxyForwardsPlainHTTP(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, "<html><body><p>through the proxy</p></body></html>")
	}))
	defer srv.Close()

	allowLoopbackForTest(t)
	p := startTestProxy(t)
	relaxProxyPortsForTest(t)
	resp, err := clientThrough(t, p).Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "through the proxy") {
		t.Errorf("body = %q, want the origin's response", body)
	}
}

func TestGuardProxyTunnelsCONNECTToAnAllowedHost(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "tunnelled")
	}))
	defer srv.Close()

	allowLoopbackForTest(t)
	p := startTestProxy(t)
	// httptest picks an ephemeral port, which the 80/443 rule would refuse,
	// so widen the check for this test only — the rule itself has its own.
	relaxProxyPortsForTest(t)

	resp, err := clientThrough(t, p).Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "tunnelled" {
		t.Errorf("body = %q, want %q", body, "tunnelled")
	}
}

// The test that proves the browser tier did not buy its way in by relaxing the
// address guard: no allowLoopbackForTest here, so loopback is off limits.
func TestGuardProxyRefusesCONNECTToABlockedAddress(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "should never be reached")
	}))
	defer srv.Close()

	p := startTestProxy(t)
	relaxProxyPortsForTest(t)

	_, err := clientThrough(t, p).Get(srv.URL)
	if err == nil {
		t.Fatal("err = nil, want the tunnel to a loopback origin to be refused")
	}
}

func TestGuardProxyBlocksPlainHTTPToAPrivateAddress(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "should never be reached")
	}))
	defer srv.Close()

	// Guard armed: the origin is on loopback and must stay unreachable.
	p := startTestProxy(t)
	relaxProxyPortsForTest(t)
	resp, err := clientThrough(t, p).Get(srv.URL)
	if err != nil {
		return // refused at the transport, also fine
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403 for a blocked address", resp.StatusCode)
	}
}

// relaxProxyPortsForTest lets a test reach an httptest origin, which always
// listens on an ephemeral port. Scoped to the tests that need it so the rule
// is still enforced everywhere else in this file.
func relaxProxyPortsForTest(t *testing.T) {
	t.Helper()
	allowAnyProxyPort = true
	t.Cleanup(func() { allowAnyProxyPort = false })
}

func TestGuardProxyRefusesNonWebPorts(t *testing.T) {
	// A real origin standing in for something listening on a port that is
	// none of the proxy's business. It must never be connected to.
	var accepted atomic.Int64
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			accepted.Add(1)
			conn.Close()
		}
	}()

	allowLoopbackForTest(t) // even with the address allowed, the port is not
	p := startTestProxy(t)

	client, err := net.Dial("tcp", p.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	client.SetDeadline(time.Now().Add(10 * time.Second))
	fmt.Fprintf(client, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n",
		ln.Addr().String(), ln.Addr().String())
	resp, err := http.ReadResponse(bufio.NewReader(client), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403 for a non-web port", resp.StatusCode)
	}
	if n := accepted.Load(); n != 0 {
		t.Errorf("origin accepted %d connections, want 0 — the port must be refused before dialling", n)
	}
}

func TestGuardProxyStripsHopByHopHeaders(t *testing.T) {
	var got http.Header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		fmt.Fprint(w, "ok")
	}))
	defer srv.Close()

	allowLoopbackForTest(t)
	p := startTestProxy(t)
	relaxProxyPortsForTest(t)

	req, err := http.NewRequest(http.MethodGet, srv.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Proxy-Authorization", "Bearer nope")
	req.Header.Set("X-Kept", "yes")
	resp, err := clientThrough(t, p).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	if v := got.Get("Proxy-Authorization"); v != "" {
		t.Errorf("Proxy-Authorization reached the origin as %q, want it stripped", v)
	}
	if v := got.Get("X-Kept"); v != "yes" {
		t.Errorf("X-Kept = %q, want it forwarded", v)
	}
}

func TestGuardProxyForwardsRedirectsWithoutFollowingThem(t *testing.T) {
	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if r.URL.Path == "/from" {
			http.Redirect(w, r, "/to", http.StatusFound)
			return
		}
		fmt.Fprint(w, "arrived")
	}))
	defer srv.Close()

	allowLoopbackForTest(t)
	p := startTestProxy(t)
	relaxProxyPortsForTest(t)
	client := clientThrough(t, p)
	// Stop the client following, so what comes back is what the proxy sent.
	client.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}

	resp, err := client.Get(srv.URL + "/from")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusFound {
		t.Errorf("status = %d, want 302 forwarded verbatim", resp.StatusCode)
	}
	if n := hits.Load(); n != 1 {
		t.Errorf("origin hits = %d, want 1 — the proxy must not follow the redirect", n)
	}
}

func TestGuardProxyDrainsBytesPipelinedAfterConnect(t *testing.T) {
	// An echo origin, so the payload sent in the same write as the CONNECT
	// request comes back only if the proxy drained its buffered reader.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		io.Copy(conn, conn)
	}()

	allowLoopbackForTest(t)
	p := startTestProxy(t)
	relaxProxyPortsForTest(t)

	client, err := net.Dial("tcp", p.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	client.SetDeadline(time.Now().Add(10 * time.Second))

	// One write: the CONNECT request AND the first payload bytes, exactly as
	// a browser pipelines its ClientHello.
	payload := "PIPELINED-PAYLOAD"
	fmt.Fprintf(client, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n%s",
		ln.Addr().String(), ln.Addr().String(), payload)

	br := bufio.NewReader(client)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 Connection Established", resp.StatusCode)
	}

	echo := make([]byte, len(payload))
	if _, err := io.ReadFull(br, echo); err != nil {
		t.Fatalf("reading the echo: %v — the pipelined bytes were dropped", err)
	}
	if string(echo) != payload {
		t.Errorf("echo = %q, want %q", echo, payload)
	}
}

func TestGuardProxyCloseTerminatesOpenTunnels(t *testing.T) {
	// An origin that accepts and then says nothing, so the tunnel stays open
	// until something closes it.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	held := make(chan struct{})
	defer close(held)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		<-held // hold the tunnel open; only Close should end it
		conn.Close()
	}()

	allowLoopbackForTest(t)
	p, err := startGuardProxy(5 * time.Minute) // long enough that only Close can end it
	if err != nil {
		t.Fatal(err)
	}
	relaxProxyPortsForTest(t)

	client, err := net.Dial("tcp", p.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	fmt.Fprintf(client, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n",
		ln.Addr().String(), ln.Addr().String())
	br := bufio.NewReader(client)
	if _, err := http.ReadResponse(br, nil); err != nil {
		t.Fatal(err)
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		client.SetReadDeadline(time.Now().Add(10 * time.Second))
		io.Copy(io.Discard, br)
	}()

	p.Close()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Error("the tunnel outlived Close — Shutdown does not touch hijacked conns")
	}
}
