package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"kaioken/internal/prism"
)

// cmdPrism is the CLI face of the imported-document retriever.
//
//	kaioken prism modules
//	kaioken prism new <name>
//	kaioken prism rm <slug>
//	kaioken prism import <path…> -module <slug>
//	kaioken prism docs -module <slug>
//	kaioken prism ask "<question>" -module <slug>
//	kaioken prism status
func cmdPrism(ctx context.Context, f flags) error {
	sub := ""
	rest := f.positionals
	if len(rest) > 0 {
		sub, rest = rest[0], rest[1:]
	}

	switch sub {
	case "", "status":
		return prismStatus(ctx, f)
	case "modules", "ls":
		return prismModules(f)
	case "new", "create":
		return prismNew(f, rest)
	case "rm", "delete":
		return prismRemove(f, rest)
	case "import", "add":
		return prismImport(ctx, f, rest)
	case "docs":
		return prismDocs(f)
	case "ask", "query":
		return prismAsk(ctx, f, rest)
	case "eval":
		return prismEval(ctx, f, rest)
	default:
		return fmt.Errorf("unknown prism command %q — try: modules, new, rm, import, docs, ask, status", sub)
	}
}

func prismStatus(ctx context.Context, f flags) error {
	e, err := prism.Open(ctx, f.repo)
	if err != nil {
		return err
	}
	fmt.Println(e.Status())

	mods, err := e.Store.Modules()
	if err != nil {
		return err
	}
	if len(mods) == 0 {
		fmt.Println("\nno modules yet — `kaioken prism new \"<name>\"` to make one")
		return nil
	}
	fmt.Printf("\n%d module(s):\n", len(mods))
	for _, m := range mods {
		fmt.Printf("  %-24s %d doc(s), %d chunk(s)\n", m.Slug, m.DocumentCount, m.ChunkCount)
	}
	return nil
}

func prismModules(f flags) error {
	mods, err := prism.NewStore(f.repo).Modules()
	if err != nil {
		return err
	}
	if len(mods) == 0 {
		fmt.Println("no modules — `kaioken prism new \"<name>\"` to make one")
		return nil
	}
	for _, m := range mods {
		fmt.Printf("%-24s %-30s %d doc(s), %d chunk(s)\n", m.Slug, m.Name, m.DocumentCount, m.ChunkCount)
		if m.Description != "" {
			fmt.Printf("%-24s %s\n", "", m.Description)
		}
	}
	return nil
}

func prismNew(f flags, args []string) error {
	name := strings.TrimSpace(strings.Join(args, " "))
	if name == "" {
		return errors.New(`usage: kaioken prism new "<name>"`)
	}
	m, err := prism.NewStore(f.repo).CreateModule(name, f.module, "")
	if err != nil {
		return err
	}
	fmt.Printf("created module %s (%s)\n", m.Slug, m.Name)
	fmt.Printf("  import documents:  kaioken prism import <file> -module %s\n", m.Slug)
	return nil
}

func prismRemove(f flags, args []string) error {
	slug := firstArg(args, f.module)
	if slug == "" {
		return errors.New("usage: kaioken prism rm <slug>")
	}
	store := prism.NewStore(f.repo)
	m, err := store.Module(slug)
	if err != nil {
		return err
	}
	// Deleting a module throws away every embedding in it, which costs real
	// money to rebuild. Naming what is about to go is the least this can do.
	if !f.force {
		return fmt.Errorf("module %s holds %d document(s) and %d chunk(s) — "+
			"re-run with -force to delete it and every embedding in it",
			m.Slug, m.DocumentCount, m.ChunkCount)
	}
	if err := store.DeleteModule(slug); err != nil {
		return err
	}
	fmt.Printf("deleted module %s\n", slug)
	return nil
}

func prismImport(ctx context.Context, f flags, args []string) error {
	if f.module == "" {
		return errors.New("usage: kaioken prism import <path…> -module <slug>")
	}
	paths, err := expandImportPaths(args)
	if err != nil {
		return err
	}
	if len(paths) == 0 {
		return errors.New("nothing to import — no supported files in those paths")
	}

	e, err := prism.Open(ctx, f.repo)
	if err != nil {
		return err
	}
	if _, err := e.Store.Module(f.module); err != nil {
		return err
	}
	fmt.Println(e.Status())
	if !e.Embed.Enabled() {
		// Worth saying up front: text imported without vectors is searchable
		// but only lexically, and fixing it later means re-importing.
		fmt.Println("  ! importing without embeddings — retrieval will be lexical until you re-import")
	}
	fmt.Println()

	var failed int
	for _, p := range paths {
		started := time.Now()
		doc, err := e.Ingestor().ImportFile(ctx, f.module, p, importProgress(filepath.Base(p)))
		if err != nil {
			failed++
			fmt.Printf("  ! %-40s %v\n", filepath.Base(p), err)
			continue
		}
		fmt.Printf("  + %-40s %d child / %d parent chunk(s) in %s\n",
			doc.Filename, doc.ChildCount, doc.ParentCount, took(started))
	}

	m, err := e.Store.Module(f.module)
	if err != nil {
		return err
	}
	fmt.Printf("\nmodule %s now holds %d document(s), %d chunk(s)\n", m.Slug, m.DocumentCount, m.ChunkCount)
	if failed > 0 {
		return fmt.Errorf("%d of %d file(s) failed to import", failed, len(paths))
	}
	return nil
}

// importProgress prints embedding progress on one rewritten line, at ten
// percent granularity so a large document does not scroll the terminal.
func importProgress(name string) prism.Progress {
	last := -1
	return func(stage prism.Stage, done, total int) {
		if stage != prism.StageEmbed || total == 0 {
			return
		}
		pct := done * 100 / total
		if pct/10 == last/10 {
			return
		}
		last = pct
		fmt.Printf("\r    %-40s embedding %d/%d (%d%%)", name, done, total, pct)
		if done == total {
			fmt.Printf("\r%s\r", strings.Repeat(" ", 78))
		}
	}
}

func prismDocs(f flags) error {
	if f.module == "" {
		return errors.New("usage: kaioken prism docs -module <slug>")
	}
	docs, err := prism.NewStore(f.repo).Documents(f.module)
	if err != nil {
		return err
	}
	if len(docs) == 0 {
		fmt.Printf("module %s holds no documents\n", f.module)
		return nil
	}
	for _, d := range docs {
		fmt.Printf("%-8s %-40s %d child / %d parent\n", d.Status, d.Filename, d.ChildCount, d.ParentCount)
		if d.Error != "" {
			fmt.Printf("%-8s   %s\n", "", d.Error)
		}
	}
	return nil
}

func prismAsk(ctx context.Context, f flags, args []string) error {
	query := strings.TrimSpace(strings.Join(args, " "))
	if query == "" {
		query = f.prompt
	}
	if query == "" {
		return errors.New(`usage: kaioken prism ask "<question>" -module <slug>`)
	}
	if f.module == "" {
		return errors.New("prism ask needs -module <slug>")
	}

	e, err := prism.Open(ctx, f.repo)
	if err != nil {
		return err
	}
	opt := e.Options
	opt.Module = f.module

	started := time.Now()
	res, err := e.Retrieve(ctx, query, opt)
	if err != nil {
		return err
	}

	// The diagnostics print by default rather than behind a verbose flag. An
	// answer built on ungraded context looks identical to a good one, which is
	// the confusion this whole pipeline exists to prevent.
	fmt.Printf("%s  ·  %s  ·  %d chunk(s)  ·  %s\n\n",
		flagLine(res.Result), string(res.Route), len(res.Chunks), took(started))

	if res.Route == prism.RouteComplex {
		for _, s := range res.Steps {
			mark := "miss"
			if s.SourceFound {
				mark = "hit "
			}
			fmt.Printf("  %s  %s\n", mark, s.Query)
		}
		fmt.Println()
	}

	if len(res.Chunks) == 0 {
		fmt.Println("no source in this module answers that.")
		return nil
	}
	for i, c := range res.Chunks {
		fmt.Printf("── %d ──\n%s\n\n", i+1, c)
	}
	if len(res.Unresolved) > 0 {
		fmt.Println("unresolved:")
		for _, u := range res.Unresolved {
			fmt.Printf("  · %s\n", u)
		}
	}
	return nil
}

// prismEval scores a golden set against several configurations and prints
// them side by side, so a retrieval change is decided by measurement rather
// than by which option sounds better.
func prismEval(ctx context.Context, f flags, args []string) error {
	golden := firstArg(args, f.out)
	if golden == "" {
		return errors.New(`usage: kaioken prism eval <goldens.json> -module <slug>`)
	}
	set, err := prism.LoadGoldenSet(golden)
	if err != nil {
		return err
	}
	if len(set.Cases) == 0 {
		return fmt.Errorf("%s holds no cases", golden)
	}

	e, err := prism.Open(ctx, f.repo)
	if err != nil {
		return err
	}
	fmt.Println(e.Status())
	fmt.Printf("\n%d case(s) from %s\n\n", len(set.Cases), filepath.Base(golden))

	base := e.Options
	base.Module = f.module

	// Three configurations worth separating: the plain path, the same with
	// fusion, and the decomposed one. Each costs more than the last, so the
	// question is always whether the extra spend bought anything.
	configs := []prism.EvalConfig{
		{Name: "baseline", Options: base},
		{Name: "fusion", Options: withVariants(base, 3)},
		{Name: "agent", Options: base, Agent: true, ForceRoute: prism.RouteComplex},
	}

	var reports []*prism.EvalReport
	for _, cfg := range configs {
		rep, err := e.Evaluate(ctx, set, cfg)
		if err != nil {
			return err
		}
		reports = append(reports, rep)
	}
	fmt.Print(prism.CompareReports(reports))

	// A fabricated answer to an unanswerable question is the failure this
	// engine exists to prevent, so it is named case by case rather than left
	// as a count.
	for _, rep := range reports {
		for _, c := range rep.Cases {
			if c.Case.Unanswerable && !c.Correct {
				fmt.Printf("\n  ! %s answered an unanswerable case: %q\n", rep.Config, c.Case.Question)
			}
		}
	}
	return nil
}

func withVariants(o prism.Options, n int) prism.Options {
	o.Variants = n
	return o
}

// flagLine renders the three honesty flags as words rather than booleans, so
// the degraded states read as warnings instead of as data.
func flagLine(r prism.Result) string {
	var parts []string
	if r.SourceFound {
		parts = append(parts, "sourced")
	} else {
		parts = append(parts, "NO SOURCE")
	}
	if r.Graded {
		parts = append(parts, "graded")
	} else {
		parts = append(parts, "UNGRADED")
	}
	if r.Degraded {
		parts = append(parts, "DEGRADED")
	}
	return strings.Join(parts, " · ")
}

// expandImportPaths turns file and directory arguments into a sorted list of
// importable files, skipping unsupported ones inside a directory but reporting
// an unsupported file named explicitly — asking for one file by name and
// having it silently skipped is worse than an error.
func expandImportPaths(args []string) ([]string, error) {
	var out []string
	for _, arg := range args {
		info, err := os.Stat(arg)
		if err != nil {
			return nil, err
		}
		if !info.IsDir() {
			if !prism.Supported(arg) {
				return nil, fmt.Errorf("%s: unsupported file type", filepath.Base(arg))
			}
			out = append(out, arg)
			continue
		}
		err = filepath.WalkDir(arg, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				if skipImportDir(d.Name()) {
					return filepath.SkipDir
				}
				return nil
			}
			if !prism.Supported(path) {
				return nil
			}
			out = append(out, path)
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	sort.Strings(out)
	return out, nil
}

// skipImportDir keeps a directory import to the user's documents.
//
// Dot-directories are skipped because .kaioken holds PRISM's own state, and
// importing a module's chunk store back into itself is both absurd and the
// first thing a recursive import does. The rest are the usual dependency and
// build trees: nobody means to embed node_modules, and doing so would cost
// more than every real document combined.
func skipImportDir(name string) bool {
	if strings.HasPrefix(name, ".") && name != "." {
		return true
	}
	switch name {
	case "node_modules", "vendor", "target", "dist", "build", "__pycache__":
		return true
	}
	return false
}

func firstArg(args []string, fallback string) string {
	if len(args) > 0 {
		return args[0]
	}
	return fallback
}

func took(since time.Time) string {
	d := time.Since(since)
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	return fmt.Sprintf("%.1fs", d.Seconds())
}
