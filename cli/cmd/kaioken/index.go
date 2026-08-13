package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"kaioken/internal/config"
	"kaioken/internal/embed"
	"kaioken/internal/search"
)

// cmdIndex builds the search index over the generated knowledge. Searching
// never requires this — internal/search rebuilds the lexical half on demand —
// but embeddings cost a round trip per passage, so they are computed here,
// once, rather than on somebody's first query.
func cmdIndex(ctx context.Context, f flags) error {
	repo := f.repo

	if f.force {
		// A forced rebuild throws away the vectors too, which is the point:
		// -force exists for when the index is suspected wrong, and reusing
		// cached vectors would preserve exactly what is being doubted.
		_ = os.Remove(filepath.Join(repo, config.Dir, "search_index.json"))
	}

	ec := embed.ConfigFor(repo)
	emb, err := embed.New(ec)
	if err != nil {
		return err
	}

	if emb == nil {
		fmt.Println("indexing (lexical only — no embedding model configured) …")
	} else {
		fmt.Printf("indexing with embeddings from %s …\n", ec.Model)
	}

	lastPct := -1
	progress := func(done, total int) {
		pct := done * 100 / total
		if pct/10 != lastPct/10 {
			lastPct = pct
			fmt.Printf("  embedding %d/%d (%d%%)\n", done, total, pct)
		}
	}
	if emb == nil {
		progress = nil
	}

	idx, err := search.Build(ctx, repo, emb, progress)
	if err != nil {
		// Build persists the lexical index even when embedding fails, so this
		// is a degraded success worth describing precisely.
		if idx != nil {
			docs, chunks, embedded := idx.Stats()
			fmt.Printf("  ! embedding failed after %d/%d chunks — %d doc(s), %d chunk(s) indexed lexically\n",
				embedded, chunks, docs, chunks)
		}
		return err
	}

	docs, chunks, embedded := idx.Stats()
	if docs == 0 {
		fmt.Println("nothing to index — run `kaioken wiki` or `kaioken generate` first")
		return nil
	}
	fmt.Printf("\nindexed %d document(s) into %d chunk(s)\n", docs, chunks)
	if embedded > 0 {
		fmt.Printf("  %d chunk(s) embedded — search is hybrid (BM25 + vectors)\n", embedded)
	} else {
		fmt.Println("  no embeddings — search is BM25 only")
		fmt.Println("  to enable semantic search, set search.embed_model in .kaioken/config.yaml")
		fmt.Println("  (a local Ollama needs no key: embed_provider: ollama, embed_model: nomic-embed-text)")
	}
	if secs := idx.Sections(); len(secs) > 0 {
		fmt.Printf("  sections: %d\n", len(secs))
	}
	return nil
}

// cmdSearch is the CLI face of the index — mostly a debugging aid for tuning
// ranking, but genuinely useful for "where is this documented".
func cmdSearch(ctx context.Context, f flags) error {
	query := f.positional
	if query == "" {
		return fmt.Errorf(`usage: kaioken search "<query>"`)
	}

	idx, err := search.Open(f.repo)
	if err != nil {
		return err
	}
	emb, _ := embed.New(embed.ConfigFor(f.repo))

	hits, err := idx.Search(ctx, search.Query{Text: query, Limit: 10, Embedder: emb})
	if err != nil {
		return err
	}
	if len(hits) == 0 {
		fmt.Printf("no matches for %q\n", query)
		return nil
	}
	mode := "lexical"
	if emb != nil && idx.Semantic() {
		mode = "hybrid"
	}
	fmt.Printf("%d match(es) for %q (%s):\n\n", len(hits), query, mode)
	for _, h := range hits {
		fmt.Printf("  %-8s %s:%d\n", h.Kind, h.Path, h.Line)
		if h.Heading != "" {
			fmt.Printf("           %s\n", h.Heading)
		}
		fmt.Printf("           %s\n\n", firstLine(h.Snippet))
	}
	return nil
}

func firstLine(s string) string {
	for i, r := range s {
		if r == '\n' {
			return s[:i] + " …"
		}
	}
	return s
}
