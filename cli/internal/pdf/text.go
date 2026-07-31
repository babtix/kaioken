package pdf

import (
	"strings"

	"golang.org/x/text/encoding/charmap"
)

// The standard PDF fonts this renderer uses carry a single-byte encoding, so
// every string has to be reduced to Windows-1252 before it reaches the page.
// That covers Latin-1 plus the punctuation a report is actually written with:
// the euro sign, curly quotes, en and em dashes.
//
// Everything outside it is transliterated rather than dropped. A dossier about
// energy prices is full of ×, ≈, ° and →; a source list can carry Greek or
// Cyrillic titles. Silently deleting those characters would corrupt figures —
// "≈40" becoming "40" turns an approximation into a measurement — so each one
// is replaced by an ASCII form that means the same thing, and only genuinely
// unrepresentable text falls back to a marker.

// translit maps characters that are common in research prose but absent from
// Windows-1252 onto ASCII that carries the same meaning.
var translit = map[rune]string{
	// Mathematical and relational signs. Windows-1252 has ×, ÷ and ± already;
	// these are the ones it does not.
	'−': "-", '≈': "~", '≠': "!=", '≤': "<=", '≥': ">=",
	'→': "->", '←': "<-", '↔': "<->", '⇒': "=>",
	// Dashes and primes outside cp1252 (the en and em dash are inside it).
	'‑': "-", '‒': "-", '―': "--", '′': "'", '″': "\"",
	// Spaces that are not U+0020: ideographic, thin, hair, narrow no-break, figure.
	'　': " ", ' ': " ", ' ': " ", ' ': " ", ' ': " ",
	// Units and symbols that carry meaning in a figures-heavy report.
	'℃': "degC", '℉': "degF", 'Ω': "ohm", 'µ': "micro",
	// Greek, which turns up in formulas and variable names.
	'α': "alpha", 'β': "beta", 'γ': "gamma", 'Δ': "delta",
	'δ': "delta", 'μ': "micro", 'σ': "sigma", 'Ω': "ohm",
	'π': "pi", 'λ': "lambda", 'ε': "epsilon", 'ρ': "rho",
}

// winAnsi reduces s to the bytes a standard PDF font can draw.
func winAnsi(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r == '\r' {
			continue
		}
		if repl, ok := translit[r]; ok {
			for _, rr := range repl {
				if enc, ok := charmap.Windows1252.EncodeRune(rr); ok {
					b.WriteByte(enc)
				}
			}
			continue
		}
		if enc, ok := charmap.Windows1252.EncodeRune(r); ok {
			b.WriteByte(enc)
			continue
		}
		// Unrepresentable. A visible marker beats a silent deletion: the
		// reader can tell that something was there and go to the source.
		b.WriteByte('?')
	}
	return b.String()
}

// truncate shortens s to at most n characters, ending on an ellipsis. Used for
// running headers and long source titles, where the alternative is a line that
// overruns its column.
func truncate(s string, n int) string {
	if n <= 1 || len([]rune(s)) <= n {
		return s
	}
	r := []rune(s)
	return strings.TrimRight(string(r[:n-1]), " ,.;:-") + "..."
}
