package retrieval

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"
)

// RAG-Fusion generalises the fusion step from two ranked lists to 2N.
//
// A query is one phrasing of an information need, and the corpus used a
// different one. "How do we avoid rate limits" and "backoff policy" are the
// same question to a person and different points to a retriever. Expanding the
// query into several phrasings, running both legs for each, and fusing all 2N
// rankings turns agreement between phrasings into evidence: a document that
// surfaces under three wordings accumulates score from all three.
//
// It is off by default. Cost scales linearly in the variant count — one BM25
// and one vector search each, plus the expansion call — so it is worth turning
// on where evaluation shows it pays and not before.

// MaxVariants caps expansion. Past four the variants begin paraphrasing each
// other and fusion just re-ranks the same documents at four times the price.
const MaxVariants = 4

// variantTimeout bounds the expansion call. Expansion is an optimisation: if
// it has not answered by now, retrieving the original query is better than
// making the user wait.
const variantTimeout = 15 * time.Second

// variantCacheTTL is long because variants depend only on the query text,
// never on the corpus, so they survive every import.
const variantCacheTTL = 24 * time.Hour

// maxVariantCacheEntries bounds this cache the same way the retrieval-result
// cache bounds itself — a few hundred entries is far more than one session
// asks distinct questions, and clearing beats a fixed-size eviction policy
// for something this cheap to rebuild.
const maxVariantCacheEntries = 256

const variantSystem = "You rewrite a search query into alternative phrasings for a " +
	"document retrieval system. Produce phrasings that use different " +
	"terminology for the same intent - synonyms, the full form of an " +
	"abbreviation, the abbreviation of a full form, or a more specific " +
	"restatement. Do not answer the question. Do not add commentary. " +
	"Return one rewritten query per line, and nothing else."

// VariantCache memoises expansions. Determinism is what makes it worth having:
// the call runs at temperature 0, so the same question yields the same
// variants, so the retrieval cache below it can hit at all. With a
// non-deterministic generator every identical request would produce different
// variants, miss every cache, and return a slightly different answer.
type VariantCache struct {
	mu sync.Mutex
	m  map[string]variantEntry
}

type variantEntry struct {
	variants []string
	expires  time.Time
}

func NewVariantCache() *VariantCache { return &VariantCache{m: map[string]variantEntry{}} }

func (vc *VariantCache) get(key string) ([]string, bool) {
	vc.mu.Lock()
	defer vc.mu.Unlock()
	e, ok := vc.m[key]
	if !ok || time.Now().After(e.expires) {
		return nil, false
	}
	return e.variants, true
}

func (vc *VariantCache) set(key string, variants []string) {
	vc.mu.Lock()
	defer vc.mu.Unlock()
	if len(vc.m) >= maxVariantCacheEntries {
		clear(vc.m)
	}
	vc.m[key] = variantEntry{variants: variants, expires: time.Now().Add(variantCacheTTL)}
}

// ExpandQuery returns up to n phrasings of query, the original first.
//
// It always returns at least the original: expansion is an optimisation, so
// every failure degrades to plain single-query retrieval rather than erroring.
func ExpandQuery(ctx context.Context, u Utility, vc *VariantCache, query string, n int) []string {
	if n > MaxVariants {
		n = MaxVariants
	}
	if n <= 1 || u == nil {
		return []string{query}
	}

	key := u.ID() + "|" + strconv.Itoa(n) + "|" + query
	if hit, ok := vc.get(key); ok {
		return hit
	}

	ctx, cancel := context.WithTimeout(ctx, variantTimeout)
	defer cancel()

	out, err := u.Complete(ctx, variantSystem,
		"Write "+strconv.Itoa(n-1)+" alternative phrasings of this query:\n"+query, 200)
	if err != nil {
		return []string{query}
	}

	variants := []string{query}
	seen := map[string]bool{strings.ToLower(strings.TrimSpace(query)): true}
	for _, line := range strings.Split(out, "\n") {
		// Models add list markers despite being told not to.
		c := strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line), "-*0123456789.) "))
		if c == "" || seen[strings.ToLower(c)] {
			continue
		}
		seen[strings.ToLower(c)] = true
		variants = append(variants, c)
		if len(variants) >= n {
			break
		}
	}

	vc.set(key, variants)
	return variants
}
