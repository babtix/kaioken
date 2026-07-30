package daemon

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// The in-app browser renders pages in an iframe, and most large sites refuse to
// be framed via X-Frame-Options or a frame-ancestors CSP directive. Those
// headers are instructions to the *embedding* browser, so the only way to honour
// the user's intent ("show me this page") is to fetch the page here and hand the
// WebView a copy that does not carry them.
//
// This is a local developer tool: the daemon listens on loopback and every
// request is bearer-authenticated, so the proxy is not reachable from anywhere
// but the app itself.

const (
	// proxyMaxBytes caps a single fetched document. Pages beyond this are
	// truncated rather than streamed — the browser pane is for reading, not for
	// downloading disk images through.
	proxyMaxBytes = 8 << 20 // 8 MiB
	proxyTimeout  = 20 * time.Second
	proxyMaxHops  = 5
)

// headersToStrip are the response headers that would either block framing or
// re-impose the origin's own policy on the copy we serve.
var headersToStrip = map[string]bool{
	"x-frame-options":                     true,
	"content-security-policy":             true,
	"content-security-policy-report-only": true,
	"cross-origin-opener-policy":          true,
	"cross-origin-embedder-policy":        true,
	"cross-origin-resource-policy":        true,
	// Hop-by-hop headers must not be forwarded.
	"connection":          true,
	"keep-alive":          true,
	"transfer-encoding":   true,
	"upgrade":             true,
	"proxy-authenticate":  true,
	"proxy-authorization": true,
	"te":                  true,
	"trailer":             true,
}

var headTagRe = regexp.MustCompile(`(?i)<head[^>]*>`)

// metaCspRe matches <meta> tags that carry Content-Security-Policy inside the
// HTML body — these would re-impose frame-ancestors even after the header was
// stripped. Removing them is safe: the daemon's own CSP governs the copy.
var metaCspRe = regexp.MustCompile(`(?i)<meta[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>`)

// GET /v1/browser/proxy?url=<absolute http(s) url>
//
// Fetches a page server-side and returns it with framing restrictions removed
// and a <base> tag injected, so relative links and assets still resolve against
// the real origin.
//
// The bearer token may be supplied as ?token= here, uniquely among the routes:
// an iframe's src cannot carry an Authorization header, and this endpoint exists
// precisely to be an iframe's src. The exchange never leaves loopback.
func (s *Server) handleBrowserProxy(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("url")
	if raw == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "url is required", "")
		return
	}
	target, err := url.Parse(raw)
	if err != nil || !target.IsAbs() {
		writeError(w, http.StatusBadRequest, codeBadRequest, "url must be absolute", raw)
		return
	}
	// Only the two schemes a browser pane has any business fetching. file://
	// in particular would turn this into an arbitrary-file-read endpoint.
	if target.Scheme != "http" && target.Scheme != "https" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "only http and https are supported", target.Scheme)
		return
	}

	client := &http.Client{
		Timeout: proxyTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= proxyMaxHops {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target.String(), nil)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}
	// Identify as a normal desktop browser. Sites that content-negotiate on
	// User-Agent otherwise serve a stripped or blocked variant.
	req.Header.Set("User-Agent",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := client.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, codeEngineError, "could not fetch the page", err.Error())
		return
	}
	defer resp.Body.Close()

	for name, values := range resp.Header {
		if headersToStrip[strings.ToLower(name)] {
			continue
		}
		for _, v := range values {
			w.Header().Add(name, v)
		}
	}
	// The copy is same-origin with the app, so nothing downstream should cache
	// it as if it were the real site.
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Del("Content-Length") // the body may be rewritten below

	body, err := io.ReadAll(io.LimitReader(resp.Body, proxyMaxBytes))
	if err != nil {
		writeError(w, http.StatusBadGateway, codeEngineError, "could not read the page", err.Error())
		return
	}

	// Only HTML needs rewriting; images, CSS and scripts pass through as-is.
	if strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "html") {
		body = injectBase(body, resp.Request.URL)
	}

	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(body)
}

// navInterceptScript is injected into every proxied HTML page. It catches
// clicks on <a> elements and window.open() calls, forwarding the target URL
// to the parent frame via postMessage so the desktop app can re-route them
// through the proxy instead of letting the iframe navigate directly (which
// bypasses the proxy and fails with X-Frame-Options errors or broken assets).
//
// It also neutralises frame-busting patterns: many sites check whether they
// are framed (top !== self) and try to break out. We override the accessors
// so the page believes it is top-level.
const navInterceptScript = `<script data-kai-nav>
(function(){
  // --- Frame-busting neutraliser ---
  // Make the page think it is the top frame. Many sites test
  // (window.top !== window.self) or (window.parent !== window) and redirect
  // or refuse to render when framed. Overriding these on the prototype makes
  // the checks pass transparently.
  try {
    Object.defineProperty(window, 'top',    {get:function(){return window},configurable:true});
    Object.defineProperty(window, 'parent', {get:function(){return window},configurable:true});
    // Some scripts test window.frameElement — a non-null value means framed.
    Object.defineProperty(window, 'frameElement', {get:function(){return null},configurable:true});
  } catch(_){}

  // Keep a private reference to the real parent for our own postMessage calls.
  var _realParent = window.__kaiParent;
  if (!_realParent) {
    // The real parent is captured before the overrides above take effect.
    // We stash it on a property that the override getter does not shadow.
  }
  function sendToApp(url) {
    // Use parent.postMessage on the *real* parent. Since we overwrote
    // window.parent, we need the iframe's contentWindow.parent. The
    // simplest reliable approach: use the <iframe>'s own frameElement's
    // ownerDocument.defaultView (the parent window).
    // Fallback: self.postMessage — the parent listens on window.message
    // and the iframe's messages bubble up in same-origin contexts.
    try {
      // window.__kaiRealParent is set before defineProperty above.
      window.__kaiRealParent.postMessage({type:"kai:navigate",url:url},"*");
    } catch(_) {
      // If same-origin, self.postMessage will reach the parent's listener.
      self.postMessage({type:"kai:navigate",url:url},"*");
    }
  }

  // Intercept link clicks on capture so we fire before any handler can
  // stopPropagation. Walk up from the click target to find the nearest <a>.
  document.addEventListener("click",function(e){
    var n=e.target;
    while(n&&n.tagName!=="A")n=n.parentElement;
    if(!n||!n.href)return;
    var u=n.href;
    if(!/^https?:\/\//i.test(u))return;
    // Same-page anchors (just a hash change) should scroll, not navigate.
    try{var p=new URL(u);var c=new URL(location.href);
      if(p.origin===c.origin&&p.pathname===c.pathname&&p.hash)return;
    }catch(_){}
    e.preventDefault();e.stopImmediatePropagation();
    sendToApp(u);
  },true);
  // Intercept window.open — some pages use JS navigation instead of <a>.
  var _open=window.open;
  window.open=function(u){
    if(u&&/^https?:\/\//i.test(String(u))){
      sendToApp(String(u));
      return null;
    }
    return _open.apply(this,arguments);
  };
  // Intercept form submissions that navigate away. We let same-origin
  // actions through (search forms on the proxied page) but catch
  // cross-origin ones.
  document.addEventListener("submit",function(e){
    var f=e.target;if(!f||f.tagName!=="FORM")return;
    var a=f.action||"";
    if(!/^https?:\/\//i.test(a))return;
    try{var au=new URL(a);var cu=new URL(location.href);
      if(au.origin!==cu.origin){
        e.preventDefault();
        sendToApp(a);
      }
    }catch(_){}
  },true);
})();
</script>`

// injectBase adds <base href> so that relative URLs in the copy still resolve
// against the origin the document actually came from (after redirects), rather
// than against the daemon. Without it, every stylesheet and image 404s.
//
// It also strips inline <meta> CSP tags that would re-impose frame-ancestors,
// and injects a navigation-interceptor + frame-busting-neutraliser script so
// the page behaves as though it is not framed.
func injectBase(body []byte, final *url.URL) []byte {
	// Strip any <meta http-equiv="Content-Security-Policy" ...> tags that
	// carry frame-ancestors or other policies re-imposing the framing ban.
	body = metaCspRe.ReplaceAll(body, nil)

	base := &url.URL{Scheme: final.Scheme, Host: final.Host, Path: final.Path}
	// A base href ending in a filename resolves siblings correctly only if the
	// path keeps its trailing directory; browsers already treat it that way.
	tag := fmt.Sprintf(`<base href="%s">`, base.String())

	// The real-parent stash must run *before* the nav script overrides
	// window.parent, so the script can still postMessage to the actual parent.
	realParentStash := `<script>window.__kaiRealParent=window.parent;</script>`
	injection := tag + realParentStash + navInterceptScript

	if loc := headTagRe.FindIndex(body); loc != nil {
		out := make([]byte, 0, len(body)+len(injection))
		out = append(out, body[:loc[1]]...)
		out = append(out, injection...)
		out = append(out, body[loc[1]:]...)
		return out
	}
	// No <head> to anchor to (a fragment, or malformed markup) — prepending
	// still gives the parser a base before any relative reference appears.
	return append([]byte(injection), body...)
}
