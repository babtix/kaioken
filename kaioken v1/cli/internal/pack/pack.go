// Package pack bundles a repository's generated knowledge into a single
// portable archive and unpacks it elsewhere. The use case is moving Kaioken's
// understanding of a repo — wiki, cards, skills, search index — to a machine
// that has no API key, no network, or no Kaioken at all: pack it here, copy
// the file over, extract it there, and `kaioken serve` works immediately.
package pack

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/version"
)

// Manifest is the metadata record written at the head of every bundle.
type Manifest struct {
	KaiokenVersion string    `json:"kaioken_version"`
	PackedAt       time.Time `json:"packed_at"`
	Repo           string    `json:"repo"`
}

// skipDirs are knowledge subdirectories that never travel: sessions are the
// user's private chat history, and impact reports are run-specific history.
// Both are regenerable or personal, so leaving them out is strictly safer.
var skipDirs = map[string]bool{
	"sessions": true,
	"impact":   true,
}

// prefix is the top-level directory every archive entry lives under. Keeping
// a single prefix means extraction is one strip + one safe-join per entry.
const prefix = config.Dir + "/"

// Create bundles repo's .kaioken directory into a gzipped tar at out and
// returns the written path. An empty out defaults to <repo-name>-knowledge.tar.gz
// beside the repository.
func Create(repo, out string) (string, error) {
	src := filepath.Join(repo, config.Dir)
	info, err := os.Stat(src)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("no %s directory in %s — run kaioken init first", config.Dir, repo)
	}
	if out == "" {
		base := filepath.Base(repo)
		if base == "." || base == string(os.PathSeparator) {
			base = "repo"
		}
		out = base + "-knowledge.tar.gz"
	}

	f, err := os.Create(out)
	if err != nil {
		return "", err
	}
	defer f.Close()

	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)

	manifest := Manifest{
		KaiokenVersion: version.Version,
		PackedAt:       time.Now().UTC(),
		Repo:           filepath.Base(repo),
	}
	if err := writeManifest(tw, manifest); err != nil {
		return "", err
	}

	err = filepath.WalkDir(src, func(path string, d os.DirEntry, werr error) error {
		if werr != nil {
			return nil // unreadable entries are skipped, not fatal
		}
		rel, rerr := filepath.Rel(src, path)
		if rerr != nil || rel == "." {
			return nil
		}
		rel = filepath.ToSlash(rel)
		parts := strings.Split(rel, "/")
		if skipDirs[parts[0]] {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		hdr := &tar.Header{Name: prefix + rel, Mode: 0o644}
		if d.IsDir() {
			hdr.Typeflag = tar.TypeDir
			hdr.Mode = 0o755
			hdr.Name += "/"
			if err := tw.WriteHeader(hdr); err != nil {
				return err
			}
			return nil
		}
		if !d.Type().IsRegular() {
			return nil // symlinks and devices do not travel
		}
		fi, ierr := d.Info()
		if ierr != nil {
			return nil
		}
		hdr.Typeflag = tar.TypeReg
		hdr.Size = fi.Size()
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		body, oerr := os.Open(path)
		if oerr != nil {
			return nil
		}
		defer body.Close()
		_, err := io.Copy(tw, body)
		return err
	})
	if err != nil {
		return "", err
	}
	if err := tw.Close(); err != nil {
		return "", err
	}
	if err := gz.Close(); err != nil {
		return "", err
	}
	return out, nil
}

// Extract unpacks bundle into targetRepo's .kaioken directory, creating it if
// needed. It refuses path traversal — an archive entry may only land inside
// the knowledge directory, never escape it.
func Extract(bundle, targetRepo string) error {
	f, err := os.Open(bundle)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("not a gzip bundle: %w", err)
	}
	defer gz.Close()

	dest := filepath.Join(targetRepo, config.Dir)
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return fmt.Errorf("reading bundle: %w", err)
		}
		rel := strings.TrimPrefix(filepath.ToSlash(hdr.Name), prefix)
		if rel == "" {
			continue
		}
		target, ok := safeJoin(dest, rel)
		if !ok {
			return fmt.Errorf("bundle entry escapes the knowledge dir: %q", hdr.Name)
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			out, oerr := os.Create(target)
			if oerr != nil {
				return oerr
			}
			if _, err := io.Copy(out, tr); err != nil {
				out.Close()
				return err
			}
			out.Close()
		}
	}
}

// safeJoin joins rel onto base, reporting false when the entry is absolute or
// would escape base — the guard against ../ and absolute paths in an
// untrusted archive.
func safeJoin(base, rel string) (string, bool) {
	slashed := filepath.ToSlash(rel)
	if filepath.IsAbs(rel) || strings.HasPrefix(slashed, "/") {
		return "", false
	}
	cleaned := filepath.ToSlash(filepath.Clean(slashed))
	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", false
	}
	target := filepath.Join(base, filepath.FromSlash(cleaned))
	if target != base && !strings.HasPrefix(target, base+string(os.PathSeparator)) {
		return "", false
	}
	return target, true
}

func writeManifest(tw *tar.Writer, m Manifest) error {
	raw, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	hdr := &tar.Header{
		Name:     prefix + "manifest.json",
		Mode:     0o644,
		Size:     int64(len(raw)),
		Typeflag: tar.TypeReg,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		return err
	}
	_, err = tw.Write(raw)
	return err
}
