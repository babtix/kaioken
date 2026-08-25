package daemon

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"kaioken/internal/ext"
)

// Extension management for the desktop app: the same operations `kaioken
// ext` exposes on the CLI, spoken over the loopback API. Extensions are
// per-user (not per-workspace), so these routes live beside /v1/settings.
//
// The trust flow keeps its shape: an executable extension installs inert,
// the list response carries exactly what trusting would allow to run (the
// command line, or the module and its permissions), and POST .../trust is
// the explicit consent the front-end must collect before calling.

type extSkillJSON struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type extToolJSON struct {
	Name        string `json:"name"`
	FullName    string `json:"full_name"`
	Description string `json:"description"`
	Kind        string `json:"kind"`
}

type extensionJSON struct {
	ID          string         `json:"id"`
	Version     string         `json:"version"`
	Type        string         `json:"type"`
	Repo        string         `json:"repo"`
	Tag         string         `json:"tag"`
	Local       bool           `json:"local"`
	Enabled     bool           `json:"enabled"`
	Trusted     bool           `json:"trusted"`
	NeedsTrust  bool           `json:"needs_trust"`
	Description string         `json:"description,omitempty"`
	Author      string         `json:"author,omitempty"`
	Permissions []string       `json:"permissions,omitempty"`
	Command     string         `json:"command,omitempty"`    // mcp: what trust would run
	WasmEntry   string         `json:"wasm_entry,omitempty"` // wasm: the module
	Skills      []extSkillJSON `json:"skills"`
	InstalledAt time.Time      `json:"installed_at"`
	Error       string         `json:"error,omitempty"` // manifest unreadable etc.
}

type extInstallReportJSON struct {
	Extension  extensionJSON `json:"extension"`
	NeedsTrust bool          `json:"needs_trust"`
	Warnings   []string      `json:"warnings"`
}

// extError maps ext package errors onto the API error vocabulary.
func extError(w http.ResponseWriter, err error) {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "is not installed"):
		writeError(w, http.StatusNotFound, codeNotFound, msg, "")
	case strings.Contains(msg, "invalid extension"),
		strings.Contains(msg, "not supported yet"),
		strings.Contains(msg, "nothing to trust"),
		strings.Contains(msg, "not an mcp"),
		strings.Contains(msg, "must declare"):
		writeError(w, http.StatusBadRequest, codeBadRequest, msg, "")
	case strings.Contains(msg, "registry"),
		strings.Contains(msg, "resolving release"),
		strings.Contains(msg, "downloading"):
		writeError(w, http.StatusBadGateway, codeProviderError, msg, "")
	default:
		writeError(w, http.StatusInternalServerError, codeEngineError, msg, "")
	}
}

func extensionToJSON(e ext.Installed) extensionJSON {
	out := extensionJSON{
		ID:          e.ID,
		Version:     e.Version,
		Repo:        e.Repo,
		Tag:         e.Tag,
		Local:       e.Repo == "local",
		Enabled:     e.Enabled,
		Trusted:     e.Trusted(),
		InstalledAt: e.InstalledAt,
		Skills:      []extSkillJSON{},
	}
	man, _, err := ext.InstalledManifest(e.ID)
	if err != nil {
		out.Error = err.Error()
		return out
	}
	out.Type = man.Type
	if out.Type == "" {
		out.Type = ext.TypeDeclarative
	}
	out.Description = man.Description
	out.Author = man.Author
	out.Permissions = man.Permissions
	out.NeedsTrust = ext.Executable(man.Type) && !e.Trusted()
	if man.Type == ext.TypeMCP && man.MCP != nil {
		parts := append([]string{man.MCP.Command}, man.MCP.Args...)
		out.Command = strings.Join(parts, " ")
	}
	if man.Type == ext.TypeWasm && man.Wasm != nil {
		out.WasmEntry = man.Wasm.Entry
	}
	for _, cs := range extSkills(e.ID) {
		out.Skills = append(out.Skills, extSkillJSON{Name: cs.Name, Description: cs.Description})
	}
	return out
}

// extSkills lists one extension's contributed skills regardless of its
// enabled state — the management screen wants to show what a disabled
// extension would contribute, which Contributions() rightly hides from the
// agent.
func extSkills(id string) []ext.ContributedSkill {
	_, entry, err := ext.InstalledManifest(id)
	if err != nil {
		return nil
	}
	rep, err := ext.ValidateDir(ext.InstallDir(entry.ID, entry.Version))
	if err != nil {
		return nil
	}
	return rep.Skills
}

func installReport(res *ext.InstallResult) extInstallReportJSON {
	rep := extInstallReportJSON{
		Extension:  extensionToJSON(res.Entry),
		NeedsTrust: res.NeedsTrust,
		Warnings:   res.Warnings,
	}
	if rep.Warnings == nil {
		rep.Warnings = []string{}
	}
	return rep
}

// GET /v1/extensions
func (s *Server) handleListExtensions(w http.ResponseWriter, r *http.Request) {
	lock, err := ext.LoadLock()
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	out := make([]extensionJSON, 0, len(lock.Extensions))
	for _, e := range lock.Extensions {
		out = append(out, extensionToJSON(e))
	}
	writeJSON(w, http.StatusOK, map[string]any{"extensions": out})
}

// POST /v1/extensions  {source}
func (s *Server) handleInstallExtension(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Source string `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Source) == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "source is required (owner/repo[@version])", "")
		return
	}
	res, err := ext.Install(r.Context(), body.Source)
	if err != nil {
		extError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, installReport(res))
}

// POST /v1/extensions/dev  {path}
func (s *Server) handleDevExtension(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Path) == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "path is required", "")
		return
	}
	res, err := ext.InstallDev(body.Path)
	if err != nil {
		extError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, installReport(res))
}

// POST /v1/extensions/validate  {path}
func (s *Server) handleValidateExtension(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Path) == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "path is required", "")
		return
	}
	rep, err := ext.ValidateDir(body.Path)
	if err != nil {
		extError(w, err)
		return
	}
	skills := make([]extSkillJSON, 0, len(rep.Skills))
	for _, cs := range rep.Skills {
		skills = append(skills, extSkillJSON{Name: cs.Name, Description: cs.Description})
	}
	warnings := rep.Warnings
	if warnings == nil {
		warnings = []string{}
	}
	typ := rep.Manifest.Type
	if typ == "" {
		typ = ext.TypeDeclarative
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": rep.Manifest.ID, "version": rep.Manifest.Version, "type": typ,
		"permissions": rep.Manifest.Permissions, "skills": skills, "warnings": warnings,
	})
}

// DELETE /v1/extensions/{eid}
func (s *Server) handleRemoveExtension(w http.ResponseWriter, r *http.Request) {
	if err := ext.Remove(r.PathValue("eid")); err != nil {
		extError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /v1/extensions/{eid}/enable  {enabled}
func (s *Server) handleEnableExtension(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "invalid JSON", "")
		return
	}
	if err := ext.SetEnabled(r.PathValue("eid"), body.Enabled); err != nil {
		extError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /v1/extensions/{eid}/trust — the explicit consent step. The
// front-end must have shown the user what will run (the list response
// carries command/permissions) before calling this.
func (s *Server) handleTrustExtension(w http.ResponseWriter, r *http.Request) {
	tools, err := ext.Trust(r.Context(), r.PathValue("eid"))
	if err != nil {
		extError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": extToolsToJSON(tools)})
}

// POST /v1/extensions/{eid}/untrust
func (s *Server) handleUntrustExtension(w http.ResponseWriter, r *http.Request) {
	if err := ext.Untrust(r.PathValue("eid")); err != nil {
		extError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /v1/extensions/{eid}/tools[?refresh=true]
func (s *Server) handleExtensionTools(w http.ResponseWriter, r *http.Request) {
	eid := r.PathValue("eid")
	var tools []ext.Tool
	var err error
	if r.URL.Query().Get("refresh") == "true" {
		tools, err = ext.RefreshTools(r.Context(), eid)
	} else {
		tools, err = ext.CachedTools(eid)
	}
	if err != nil {
		extError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": extToolsToJSON(tools)})
}

func extToolsToJSON(tools []ext.Tool) []extToolJSON {
	out := make([]extToolJSON, 0, len(tools))
	for _, t := range tools {
		out = append(out, extToolJSON{Name: t.Name, FullName: t.FullName, Description: t.Description, Kind: t.Kind})
	}
	return out
}

// POST /v1/extensions/update  {id?}
func (s *Server) handleUpdateExtensions(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body) // an empty body means "all"
	var results []ext.UpdateResult
	var err error
	if body.ID != "" {
		results, err = ext.Update(r.Context(), body.ID)
	} else {
		results, err = ext.Update(r.Context())
	}
	if err != nil {
		extError(w, err)
		return
	}
	type resultJSON struct {
		ID      string `json:"id"`
		From    string `json:"from"`
		To      string `json:"to,omitempty"`
		Updated bool   `json:"updated"`
		Local   bool   `json:"local"`
		Error   string `json:"error,omitempty"`
	}
	out := make([]resultJSON, 0, len(results))
	for _, res := range results {
		rj := resultJSON{ID: res.ID, From: res.From, To: res.To, Updated: res.Updated, Local: res.Local}
		if res.Err != nil {
			rj.Error = res.Err.Error()
		}
		out = append(out, rj)
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": out})
}

// GET /v1/extensions/registry[?q=]
func (s *Server) handleExtensionRegistry(w http.ResponseWriter, r *http.Request) {
	entries, err := ext.Registry(r.Context(), r.URL.Query().Get("refresh") == "true")
	if err != nil {
		writeError(w, http.StatusBadGateway, codeProviderError, err.Error(), "")
		return
	}
	hits := ext.SearchRegistry(entries, r.URL.Query().Get("q"))
	type entryJSON struct {
		ID          string   `json:"id"`
		Repo        string   `json:"repo"`
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Author      string   `json:"author"`
		// Schema v2 pass-through — additive, so the contract stays v4. Type
		// is always the normalized tier: the browse UI shows the trust tier
		// before install.
		Type        string   `json:"type"`
		Tags        []string `json:"tags,omitempty"`
		Homepage    string   `json:"homepage,omitempty"`
		Permissions []string `json:"permissions,omitempty"`
	}
	out := make([]entryJSON, 0, len(hits))
	for _, e := range hits {
		// The kill switch reaches the browse UI: flagged entries are not
		// offered at all.
		flagged := false
		for _, f := range e.Flags {
			if strings.EqualFold(f, "malicious") {
				flagged = true
				break
			}
		}
		if flagged {
			continue
		}
		out = append(out, entryJSON{
			ID: e.ID, Repo: e.Repo, Name: e.Name, Description: e.Description, Author: e.Author,
			Type: e.TierLabel(), Tags: e.Tags, Homepage: e.Homepage, Permissions: e.Permissions,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": out})
}
