package ext

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kaioken/internal/version"
)

// maxArchiveBytes caps a release download. Declarative extensions are
// markdown and yaml; 20 MB of it is already suspicious.
const maxArchiveBytes = 20 << 20

// InstallResult reports what an install produced, for display.
type InstallResult struct {
	Manifest *Manifest
	Entry    Installed
	// Skills are the contributions the extension just added, so the caller
	// can show the user exactly what the agent gained.
	Skills   []ContributedSkill
	Warnings []string
	// NeedsTrust is set for mcp extensions: they install inert, and the
	// caller must tell the user how to trust (and thereby launch) them.
	NeedsTrust bool
}

// Install downloads owner/repo[@version] from its GitHub release, validates
// the manifest, and installs it under the per-user extensions directory.
// The previous version, if any, stays on disk until the new one is fully in
// place and recorded — a failed install leaves the old one usable.
func Install(ctx context.Context, source string) (*InstallResult, error) {
	spec, err := ParseSpec(source)
	if err != nil {
		return nil, err
	}

	// The registry's flags are the community kill switch: a listing marked
	// malicious must not install even directly. Best-effort — an unreachable
	// registry must never break installs.
	regEntries, _ := Registry(ctx, false)
	if err := flagged(regEntries, "", spec.Slug()); err != nil {
		return nil, err
	}

	rel, err := resolveRelease(ctx, spec)
	if err != nil {
		return nil, fmt.Errorf("resolving release for %s: %w", spec.Slug(), err)
	}

	data, err := download(ctx, rel.ZipballURL)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(data)

	// Extract next to the final location so the rename cannot cross volumes.
	if err := os.MkdirAll(Root(), 0o755); err != nil {
		return nil, err
	}
	tmp, err := os.MkdirTemp(Root(), ".install-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	if err := extractZip(data, tmp); err != nil {
		return nil, err
	}

	man, err := LoadManifest(tmp)
	if err != nil {
		return nil, err
	}
	if err := minVersionSatisfied(version.Version, man.MinKaiokenVersion); err != nil {
		return nil, fmt.Errorf("%s %s: %w", man.ID, man.Version, err)
	}
	if err := flagged(regEntries, man.ID, spec.Slug()); err != nil {
		return nil, err
	}

	res := &InstallResult{Manifest: man, NeedsTrust: man.Type == TypeMCP}
	if tagVer := strings.TrimPrefix(rel.TagName, "v"); tagVer != man.Version {
		res.Warnings = append(res.Warnings,
			fmt.Sprintf("manifest version %s does not match release tag %s", man.Version, rel.TagName))
	}

	lock, err := LoadLock()
	if err != nil {
		return nil, err
	}
	enabled, priorVersion := true, ""
	if prior := lock.Find(man.ID); prior != nil {
		enabled, priorVersion = prior.Enabled, prior.Version
	}

	dest := InstallDir(man.ID, man.Version)
	if err := os.RemoveAll(dest); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return nil, err
	}
	if err := os.Rename(tmp, dest); err != nil {
		return nil, err
	}

	entry := Installed{
		ID:          man.ID,
		Version:     man.Version,
		Repo:        spec.Slug(),
		Tag:         rel.TagName,
		CommitSHA:   tagCommitSHA(ctx, spec, rel.TagName),
		SHA256:      hex.EncodeToString(sum[:]),
		InstalledAt: time.Now(),
		Enabled:     enabled,
		// TrustedVersion is never carried over: even a same-version reinstall
		// may have downloaded different bytes (tags are mutable), so trust
		// always restarts from zero.
	}
	lock.Upsert(entry)
	if err := lock.Save(); err != nil {
		return nil, err
	}

	// Only now that the new version is live and recorded: prune the old one.
	if priorVersion != "" && priorVersion != man.Version {
		_ = os.RemoveAll(InstallDir(man.ID, priorVersion))
	}

	res.Entry = entry
	res.Skills = skillsIn(dest, man.ID)
	return res, nil
}

// Remove uninstalls an extension: its directory and its lock entry.
func Remove(id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	lock, err := LoadLock()
	if err != nil {
		return err
	}
	if lock.Find(id) == nil {
		return fmt.Errorf("extension %s is not installed", id)
	}
	if err := os.RemoveAll(filepath.Join(Root(), id)); err != nil {
		return err
	}
	lock.Remove(id)
	return lock.Save()
}

// SetEnabled toggles an installed extension without uninstalling it.
func SetEnabled(id string, enabled bool) error {
	lock, err := LoadLock()
	if err != nil {
		return err
	}
	e := lock.Find(id)
	if e == nil {
		return fmt.Errorf("extension %s is not installed", id)
	}
	e.Enabled = enabled
	return lock.Save()
}

// UpdateResult is one extension's outcome from an update run.
type UpdateResult struct {
	ID      string
	From    string
	To      string
	Updated bool
	// Local marks a development install (kaioken ext dev): there is no
	// upstream to check, so update leaves it alone.
	Local bool
	Err   error
}

// Update checks installed extensions (all of them, or just ids) against
// their latest GitHub release and reinstalls the ones with a newer version.
// Nothing updates silently at load time — this is the only update path, so
// a compromised repo cannot push code onto a machine without the user
// running an update and seeing the version change.
func Update(ctx context.Context, ids ...string) ([]UpdateResult, error) {
	lock, err := LoadLock()
	if err != nil {
		return nil, err
	}
	targets := lock.Extensions
	if len(ids) > 0 {
		targets = nil
		for _, id := range ids {
			e := lock.Find(id)
			if e == nil {
				return nil, fmt.Errorf("extension %s is not installed", id)
			}
			targets = append(targets, *e)
		}
	}
	var out []UpdateResult
	for _, e := range targets {
		r := UpdateResult{ID: e.ID, From: e.Version}
		if e.Repo == devRepo {
			r.Local = true
			out = append(out, r)
			continue
		}
		spec, err := ParseSpec(e.Repo)
		if err != nil {
			r.Err = err
			out = append(out, r)
			continue
		}
		rel, err := resolveRelease(ctx, spec)
		if err != nil {
			r.Err = err
			out = append(out, r)
			continue
		}
		r.To = strings.TrimPrefix(rel.TagName, "v")
		if !newerVersion(r.To, e.Version) {
			out = append(out, r)
			continue
		}
		if _, err := Install(ctx, e.Repo+"@"+r.To); err != nil {
			r.Err = err
		} else {
			r.Updated = true
		}
		out = append(out, r)
	}
	return out, nil
}

// flagged returns an error when the registry marks an extension malicious.
// Matching is by id and by repo slug, so a flag works both before the
// manifest is known and after.
func flagged(entries []RegistryEntry, id, slug string) error {
	for _, e := range entries {
		if (id == "" || e.ID != id) && (slug == "" || !strings.EqualFold(e.Repo, slug)) {
			continue
		}
		for _, f := range e.Flags {
			if strings.EqualFold(f, "malicious") {
				return fmt.Errorf("%s is flagged as malicious in the community registry — refusing to install", e.ID)
			}
		}
	}
	return nil
}

// download fetches a release archive, refusing oversized ones before they
// are ever unpacked.
func download(ctx context.Context, url string) ([]byte, error) {
	resp, err := ghGet(ctx, url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("downloading %s: %s", url, resp.Status)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxArchiveBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxArchiveBytes {
		return nil, fmt.Errorf("release archive exceeds the %d MB limit", maxArchiveBytes>>20)
	}
	return data, nil
}

// extractZip unpacks a GitHub zipball into dest. GitHub wraps the tree in a
// single "owner-repo-sha/" folder, which is stripped. Every entry path is
// validated after cleaning: an archive must not be able to write outside
// dest (zip-slip), whatever it claims its entry names are.
func extractZip(data []byte, dest string) error {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return fmt.Errorf("reading release archive: %w", err)
	}
	for _, f := range zr.File {
		name := f.Name
		i := strings.Index(name, "/")
		if i < 0 {
			if f.FileInfo().IsDir() {
				continue // the wrapper directory itself
			}
			return fmt.Errorf("unexpected archive layout: %q at the root", f.Name)
		}
		name = name[i+1:] // strip the top-level wrapper directory
		if name == "" {
			continue
		}
		if err := safeRel(name); err != nil {
			return err
		}
		target := filepath.Join(dest, filepath.FromSlash(name))
		// Belt and braces after safeRel: the resolved path must stay inside.
		if !within(dest, target) {
			return fmt.Errorf("unsafe archive path %q", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := writeZipEntry(f, target); err != nil {
			return err
		}
	}
	return nil
}

func writeZipEntry(f *zip.File, target string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	// The decompressed size is capped too: a zip bomb must not get past the
	// download cap by compressing well.
	_, err = io.Copy(out, io.LimitReader(rc, maxArchiveBytes))
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	return err
}

// safeRel rejects slash-separated relative paths that could escape their
// base: absolute paths, backslashes (a Windows traversal smuggle), and any
// ".." segment.
func safeRel(name string) error {
	if strings.HasPrefix(name, "/") || strings.Contains(name, "\\") {
		return fmt.Errorf("unsafe archive path %q", name)
	}
	for _, part := range strings.Split(name, "/") {
		if part == ".." {
			return fmt.Errorf("unsafe archive path %q", name)
		}
	}
	return nil
}

// within reports whether target, once cleaned, is inside base.
func within(base, target string) bool {
	rel, err := filepath.Rel(base, target)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
