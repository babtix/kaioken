package webfetch

import (
	"bytes"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// This is a small readability pass, not a browser. The goal is only to give a
// language model the sentences a human would read and none of the furniture
// around them: navigation, cookie banners, share buttons, related-article
// rails. Anything ambiguous is kept — dropping real evidence is a worse
// failure here than leaving a stray menu item in.

// dropped elements never contain article prose.
var dropped = map[atom.Atom]bool{
	atom.Script: true, atom.Style: true, atom.Noscript: true,
	atom.Nav: true, atom.Header: true, atom.Footer: true, atom.Aside: true,
	atom.Form: true, atom.Button: true, atom.Iframe: true, atom.Svg: true,
	atom.Select: true, atom.Textarea: true, atom.Template: true,
	atom.Object: true, atom.Embed: true, atom.Canvas: true, atom.Map: true,
}

// boilerplate matches class and id values that conventionally wrap chrome
// rather than content.
var boilerplate = []string{
	"nav", "menu", "sidebar", "side-bar", "footer", "header", "masthead",
	"cookie", "consent", "banner", "advert", "-ad", "ad-", "ads-", "promo",
	"social", "share", "comment", "related", "recirc", "newsletter",
	"subscribe", "signup", "sign-up", "paywall", "popup", "modal", "overlay",
	"breadcrumb", "pagination", "skip-link", "screen-reader", "sr-only",
	"toolbar", "widget", "sponsored",
}

// blockLevel elements force a line break so sentences from separate blocks do
// not run together into one unreadable paragraph.
var blockLevel = map[atom.Atom]bool{
	atom.P: true, atom.Div: true, atom.Section: true, atom.Article: true,
	atom.H1: true, atom.H2: true, atom.H3: true, atom.H4: true, atom.H5: true,
	atom.H6: true, atom.Li: true, atom.Tr: true, atom.Br: true, atom.Hr: true,
	atom.Blockquote: true, atom.Pre: true, atom.Table: true, atom.Ul: true,
	atom.Ol: true, atom.Dl: true, atom.Dt: true, atom.Dd: true, atom.Figure: true,
	atom.Figcaption: true, atom.Main: true, atom.Details: true, atom.Summary: true,
}

// extract parses HTML and returns its title and readable text.
func extract(body []byte) (title, text string) {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		// A parse failure still leaves the raw bytes; stripping tags crudely
		// beats returning nothing for a page that is merely malformed.
		return "", collapse(stripAllTags(string(body)))
	}

	title = findTitle(doc)
	prune(doc)

	// Prefer an explicit content container when the page offers one; fall
	// back to whichever candidate carries the most text.
	root := bestContainer(doc)
	var sb strings.Builder
	renderText(root, &sb)
	text = collapse(sb.String())

	// A content container that turns out to be nearly empty means the guess
	// was wrong (single-page apps love empty <main>), so retry on the body.
	if len(text) < 200 {
		var full strings.Builder
		renderText(doc, &full)
		if alt := collapse(full.String()); len(alt) > len(text) {
			text = alt
		}
	}
	return title, text
}

// findTitle prefers <title>, falling back to the first <h1>.
func findTitle(n *html.Node) string {
	var title, h1 string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.DataAtom {
			case atom.Title:
				if title == "" {
					title = collapse(textOf(n))
				}
			case atom.H1:
				if h1 == "" {
					h1 = collapse(textOf(n))
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	if title != "" {
		return title
	}
	return h1
}

// prune deletes non-content subtrees in place.
func prune(n *html.Node) {
	var next *html.Node
	for c := n.FirstChild; c != nil; c = next {
		next = c.NextSibling // captured before a possible removal
		if c.Type == html.CommentNode || (c.Type == html.ElementNode && shouldDrop(c)) {
			n.RemoveChild(c)
			continue
		}
		prune(c)
	}
}

func shouldDrop(n *html.Node) bool {
	if dropped[n.DataAtom] {
		return true
	}
	// <head> holds no prose, but <title> was already harvested from it.
	if n.DataAtom == atom.Head {
		return true
	}
	for _, a := range n.Attr {
		switch a.Key {
		case "class", "id", "role", "aria-label":
			v := strings.ToLower(a.Val)
			if a.Key == "role" && (v == "navigation" || v == "banner" || v == "complementary" || v == "search") {
				return true
			}
			if a.Key == "class" || a.Key == "id" {
				for _, bad := range boilerplate {
					if strings.Contains(v, bad) {
						return true
					}
				}
			}
		case "hidden":
			return true
		case "aria-hidden":
			if strings.EqualFold(a.Val, "true") {
				return true
			}
		}
	}
	return false
}

// bestContainer picks the subtree most likely to hold the article: an
// <article> or <main> when present, otherwise the node with the most text.
func bestContainer(doc *html.Node) *html.Node {
	var best *html.Node
	bestLen := 0
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && (n.DataAtom == atom.Article || n.DataAtom == atom.Main) {
			if l := len(textOf(n)); l > bestLen {
				best, bestLen = n, l
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	if best != nil && bestLen >= 200 {
		return best
	}
	return doc
}

// renderText walks the tree writing text nodes, inserting newlines at block
// boundaries and list markers so structure survives into plain text.
func renderText(n *html.Node, sb *strings.Builder) {
	switch n.Type {
	case html.TextNode:
		sb.WriteString(n.Data)
		return
	case html.ElementNode:
		if n.DataAtom == atom.Li {
			sb.WriteString("\n- ")
		} else if blockLevel[n.DataAtom] {
			sb.WriteString("\n")
		} else if n.DataAtom == atom.Td || n.DataAtom == atom.Th {
			sb.WriteString(" | ")
		}
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		renderText(c, sb)
	}
	if n.Type == html.ElementNode && blockLevel[n.DataAtom] {
		sb.WriteString("\n")
	}
}

// textOf returns the concatenated text of a subtree, for length comparisons.
func textOf(n *html.Node) string {
	var sb strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			sb.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return sb.String()
}

// collapse normalises whitespace: runs of spaces become one, runs of blank
// lines become one, and leading/trailing space per line is dropped. Web pages
// are full of indentation that would otherwise burn tokens.
func collapse(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, " ", " ") // non-breaking space
	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	blank := 0
	for _, line := range lines {
		line = strings.Join(strings.Fields(line), " ")
		if line == "" {
			blank++
			if blank > 1 {
				continue
			}
			out = append(out, "")
			continue
		}
		blank = 0
		out = append(out, line)
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

// stripAllTags is the crude fallback for unparseable markup.
func stripAllTags(s string) string {
	var b strings.Builder
	depth := 0
	for _, r := range s {
		switch {
		case r == '<':
			depth++
		case r == '>':
			if depth > 0 {
				depth--
			}
		case depth == 0:
			b.WriteRune(r)
		}
	}
	return b.String()
}
