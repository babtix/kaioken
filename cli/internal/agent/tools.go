// Package agent implements a tool-using coding assistant loop over an
// OpenAI-compatible chat model: the model requests tools (read/list/search/
// write/edit/run), the agent executes them (with approval for anything that
// changes the repo), and feeds results back until the model produces a final
// answer.
package agent

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"

	"kaioken/internal/agent/events"
	"kaioken/internal/ext"
	"kaioken/internal/llm"
	"kaioken/internal/memory"
)

// maxReadBytes caps a single read_file / write preview.
const maxReadBytes = 100_000

// ApprovalRequest is shown to the user before a repo-changing action.
type ApprovalRequest struct {
	Action  string // "write", "edit", "run"
	Target  string // path or command
	Preview string // diff or command text
}

// UndoEntry captures a file's state just before a write_file/edit_file
// applied, so the front-end can offer /undo.
type UndoEntry struct {
	Path            string
	HadPrevious     bool // false means the file did not exist before (new file)
	PreviousContent string
}

// UI is how the agent talks to the front-end. All methods are called from the
// agent's goroutine.
type UI interface {
	// AssistantDelta receives assistant prose as it streams in. It is called
	// from the network goroutine and must not block. Assistant is still called
	// with the complete text afterwards, so a front-end may render deltas as a
	// provisional live region and replace it on completion.
	AssistantDelta(text string)
	Assistant(text string)                      // the complete model prose
	Tool(name, args string)                     // a tool is about to run
	ToolResult(name, result string, isErr bool) // tool finished
	Info(text string)                           // status/notes
	Approve(req ApprovalRequest) bool           // BLOCKS for user y/n
	RecordUndo(e UndoEntry)                     // a write/edit was applied
}

// Agent holds the configuration for a run.
type Agent struct {
	Client      *llm.Client
	Root        string // absolute repo root; all file ops are confined here
	UI          UI
	AutoApprove bool // when true, repo-changing actions skip the prompt
	MaxSteps    int
	AllowRun    bool // whether run_command is offered
	NoStream    bool // buffer the whole reply instead of streaming it
	Mode        Mode // permission preset; the zero value behaves as build
	// Depth is how many levels of delegation deep this agent is. Zero is the
	// agent the user talks to; a sub-agent spawned by the task tool is one.
	// It gates further delegation — see maxSubAgentDepth.
	Depth int
	// MemoryDisabled hides the remember/recall tools and the experience loop.
	// Project memory already on disk still reaches the prompt via the memory
	// context source; only the agent's ability to write more is removed.
	MemoryDisabled bool
	// Budget guards the session's spend. Nil means no guardrails. It must be
	// shared with sub-agents (they bill the same client) and outlive the
	// per-turn Agent value — see BudgetGuard.
	Budget *BudgetGuard
	// Events receives the run's lifecycle events. Nil means the process-wide
	// events.Default bus; tests and sub-agents set their own for isolation.
	Events *events.Bus

	// qmu guards the steering and follow-up queues, which the front-end
	// goroutine fills via Steer/FollowUp while Run drains them between turns.
	qmu       sync.Mutex
	steering  []string
	followUps []string
}

// Tools returns the tool schemas offered to the model.
func (a *Agent) Tools() []llm.Tool {
	perms := PermissionsFor(a.Mode)
	tools := []llm.Tool{
		{Type: "function", Function: llm.FunctionDef{
			Name:        "read_file",
			Description: "Read a UTF-8 text file from the repository. Returns its contents.",
			Parameters: raw(`{"type":"object","properties":{
				"path":{"type":"string","description":"repo-relative file path"}},
				"required":["path"]}`),
		}},
		{Type: "function", Function: llm.FunctionDef{
			Name:        "list_files",
			Description: "List the immediate entries of a directory in the repository.",
			Parameters: raw(`{"type":"object","properties":{
				"path":{"type":"string","description":"repo-relative directory path, default '.'"}}}`),
		}},
		{Type: "function", Function: llm.FunctionDef{
			Name:        "search",
			Description: "Case-insensitive substring search across text files. Returns path:line matches.",
			Parameters: raw(`{"type":"object","properties":{
				"query":{"type":"string","description":"text to search for"}},
				"required":["query"]}`),
		}},
		{Type: "function", Function: llm.FunctionDef{
			Name: "read_knowledge",
			Description: "Read Kaioken's generated documentation for this repo (knowledge cards " +
				"and wiki chapters). Call with no argument to list what exists. Faster than " +
				"reading source when you need orientation on a subsystem.",
			Parameters: raw(`{"type":"object","properties":{
				"doc":{"type":"string","description":"a path from the catalog, e.g. '.kaioken/wiki/Architecture'; omit to list everything"}}}`),
		}},
	}
	// recall is read-only — it scans past-session digests, never touching disk —
	// so it is offered in every mode. It is the L2 session-recall layer.
	if !a.MemoryDisabled {
		tools = append(tools, llm.Tool{Type: "function", Function: llm.FunctionDef{
			Name: "recall",
			Description: "Search past sessions in this repo for ones matching a query, returning a " +
				"short digest (goal, files touched, outcome, gotchas) of each match. Use it when " +
				"the current task resembles something done before and you want to learn what " +
				"worked. Omit the query to list the most recent sessions.",
			Parameters: raw(`{"type":"object","properties":{
				"query":{"type":"string","description":"free-text to match against past session digests; omit for the most recent"}}}`),
		}})
	}
	if perms.CanWrite {
		tools = append(tools, llm.Tool{Type: "function", Function: llm.FunctionDef{
			Name:        "write_file",
			Description: "Create or overwrite a file with the given content. Requires user approval.",
			Parameters: raw(`{"type":"object","properties":{
				"path":{"type":"string"},
				"content":{"type":"string"}},
				"required":["path","content"]}`),
		}}, llm.Tool{Type: "function", Function: llm.FunctionDef{
			Name: "edit_file",
			Description: "Replace old_string with new_string in a file. old_string must match uniquely; " +
				"minor differences in smart quotes, dashes, and trailing whitespace are tolerated. " +
				"Batch several replacements to the same file with edits. Requires user approval.",
			Parameters: raw(`{"type":"object","properties":{
				"path":{"type":"string"},
				"old_string":{"type":"string"},
				"new_string":{"type":"string"},
				"edits":{"type":"array","description":"batch of replacements applied together; use instead of old_string/new_string",
					"items":{"type":"object","properties":{
						"old_string":{"type":"string"},
						"new_string":{"type":"string"}},
						"required":["old_string","new_string"]}}},
				"required":["path"]}`),
		}})
		if !a.MemoryDisabled {
			tools = append(tools, llm.Tool{Type: "function", Function: llm.FunctionDef{
				Name: "remember",
				Description: "Record a durable fact the agent should keep for future sessions in this " +
					"repo. Use it for tribal knowledge the code does not state and the agent learned " +
					"by doing: a registry that must be updated in lockstep, a test that flakes when " +
					"run a certain way, a command that works where the documented one does not. " +
					"With rewrite=true, replace the whole memory (use to consolidate when near the " +
					"cap). Requires user approval. scope=user records a personal, cross-repo note.",
				Parameters: raw(`{"type":"object","properties":{
					"content":{"type":"string","description":"the concise fact to remember"},
					"rewrite":{"type":"boolean","description":"replace the whole memory file instead of appending; default false"},
					"scope":{"type":"string","enum":["project","user"],"description":"project (default) writes .kaioken/MEMORY.md; user writes ~/.kaioken/USER.md"}},
					"required":["content"]}`),
			}})
		}
	}
	if a.AllowRun && perms.CanRun {
		tools = append(tools, llm.Tool{Type: "function", Function: llm.FunctionDef{
			Name:        "run_command",
			Description: "Run a shell command in the repo root and return its output. Requires user approval.",
			Parameters: raw(`{"type":"object","properties":{
				"command":{"type":"string","description":"the command line to execute"}},
				"required":["command"]}`),
		}})
	}
	// Extension tools are classed with run_command: their effects live in
	// plugin code, so read-only modes never see them, and only the top-level
	// agent gets them — a delegate should not gain tools the conversation
	// never showed the user.
	if a.AllowRun && perms.CanRun && a.Depth == 0 {
		for _, mt := range ext.ToolSchemas() {
			params := raw(`{"type":"object"}`)
			if len(mt.InputSchema) > 0 {
				params = json.RawMessage(mt.InputSchema)
			}
			desc := strings.TrimSpace(mt.Description)
			if desc != "" {
				desc += " "
			}
			if mt.Kind == ext.TypeWasm {
				desc += "[extension " + mt.ExtID + " — sandboxed wasm plugin; requires user approval]"
			} else {
				desc += "[extension " + mt.ExtID + " — external MCP server, runs outside the sandbox; requires user approval]"
			}
			tools = append(tools, llm.Tool{Type: "function", Function: llm.FunctionDef{
				Name:        mt.FullName,
				Description: desc,
				Parameters:  params,
			}})
		}
	}
	// Delegation and the checklist are both offered in every mode — a
	// read-only sub-agent adds no permission the parent does not already have,
	// and a checklist changes nothing on disk — but only to the agent the user
	// is actually talking to. A delegate has one job and no standing to rewrite
	// the plan it was called from.
	if a.Depth < maxSubAgentDepth {
		tools = append(tools, taskTool(), todoTool())
	}
	// Runtime-registered tools follow extension rules: only the top-level
	// agent sees them, filtered by the current mode's permissions.
	if a.Depth == 0 {
		tools = append(tools, registeredSchemas(a.Mode)...)
	}
	return tools
}

func raw(s string) json.RawMessage { return json.RawMessage(s) }

// exec dispatches one tool call and returns a result string (errors are
// returned as text so the model can recover, not as Go errors).
func (a *Agent) execTool(ctx context.Context, tc llm.ToolCall) string {
	var args map[string]any
	if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
		return "error: could not parse tool arguments: " + err.Error()
	}
	getStr := func(k string) string {
		if v, ok := args[k].(string); ok {
			return v
		}
		return ""
	}
	getBool := func(k string) bool {
		if v, ok := args[k].(bool); ok {
			return v
		}
		return false
	}

	var rawResult string
	switch tc.Function.Name {
	case "read_file":
		rawResult = a.readFile(getStr("path"))
	case "list_files":
		p := getStr("path")
		if p == "" {
			p = "."
		}
		rawResult = a.listFiles(p)
	case "search":
		rawResult = a.search(getStr("query"))
	case "read_knowledge":
		rawResult = a.readKnowledge(getStr("doc"))
	case "recall":
		rawResult = a.recall(getStr("query"))
	case "write_file":
		if !PermissionsFor(a.Mode).CanWrite {
			return a.modeDenied("write_file")
		}
		rawResult = a.writeFile(getStr("path"), getStr("content"))
	case "edit_file":
		if !PermissionsFor(a.Mode).CanWrite {
			return a.modeDenied("edit_file")
		}
		// Parsed from the raw arguments: the batch form is structured, and the
		// decoded map would lose the item types json.Unmarshal already checked.
		edits, perr := parseEditArgs(tc.Function.Arguments)
		if perr != nil {
			return "error: " + perr.Error()
		}
		rawResult = a.editFile(getStr("path"), edits)
	case "remember":
		if !PermissionsFor(a.Mode).CanWrite {
			return a.modeDenied("remember")
		}
		rawResult = a.remember(getStr("content"), getBool("rewrite"), getStr("scope"))
	case "run_command":
		if !PermissionsFor(a.Mode).CanRun {
			return a.modeDenied("run_command")
		}
		rawResult = a.runCommand(ctx, getStr("command"), tc.ID)
	case "task":
		rawResult = a.runTask(ctx, getStr("description"), getStr("prompt"), getStr("mode"))
	case "todo":
		// Parsed from the raw arguments rather than the decoded map: the items
		// are structured, and re-deriving them from map[string]any would mean
		// hand-rolling the type checks json.Unmarshal already does.
		rawResult = a.updateTodos(tc.Function.Arguments)
	default:
		if rt, ok := lookupRegistered(tc.Function.Name); ok {
			if !rt.ReadOnly && !PermissionsFor(a.Mode).CanRun {
				return a.modeDenied(tc.Function.Name)
			}
			rawResult = rt.Run(ctx, a, tc.Function.Arguments)
		} else if mt, ok := ext.LookupTool(tc.Function.Name); ok {
			rawResult = a.callExtTool(ctx, mt, tc.Function.Arguments)
		} else {
			return "error: unknown tool " + tc.Function.Name
		}
	}

	boundRes, err := BoundOutput(a.Root, tc.ID, tc.Function.Name, rawResult, nil)
	if err != nil || !boundRes.WasTruncated {
		return rawResult
	}
	return boundRes.BoundedText
}


// extInvoke is the extension-tool dispatch, a variable so tests can stub the
// plugin machinery away.
var extInvoke = ext.CallTool

// callExtTool routes an extension tool call through the same gates as
// run_command: mode permissions first, then explicit approval naming the
// extension — the user must always see who is asking to run code.
func (a *Agent) callExtTool(ctx context.Context, mt ext.Tool, argsJSON string) string {
	if !PermissionsFor(a.Mode).CanRun {
		return a.modeDenied(mt.FullName)
	}
	preview := strings.TrimSpace(argsJSON)
	if preview == "" {
		preview = "(no arguments)"
	} else if pretty := prettyJSON(preview); pretty != "" {
		preview = pretty
	}
	if !a.approve("extension", mt.ExtID+" → "+mt.Name, preview) {
		return "user declined to run the extension tool"
	}
	out, err := extInvoke(ctx, a.Root, mt.ExtID, mt.Name, argsJSON)
	if err != nil {
		return "error: " + err.Error()
	}
	if len(out) > maxReadBytes {
		out = out[:maxReadBytes] + "\n… [output truncated]"
	}
	if strings.TrimSpace(out) == "" {
		return "(tool produced no output)"
	}
	return out
}

// prettyJSON re-indents a JSON document for the approval preview, or returns
// "" when the input is not valid JSON.
func prettyJSON(s string) string {
	var v any
	if json.Unmarshal([]byte(s), &v) != nil {
		return ""
	}
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return ""
	}
	return string(out)
}

// resolve maps a repo-relative path to an absolute path, refusing escapes.
func (a *Agent) resolve(rel string) (string, error) {
	rel = filepath.FromSlash(strings.TrimSpace(rel))
	abs := filepath.Join(a.Root, rel)
	absClean, err := filepath.Abs(abs)
	if err != nil {
		return "", err
	}
	rootClean, _ := filepath.Abs(a.Root)
	if absClean != rootClean && !strings.HasPrefix(absClean, rootClean+string(os.PathSeparator)) {
		return "", fmt.Errorf("path %q is outside the repository", rel)
	}
	return absClean, nil
}

func (a *Agent) readFile(path string) string {
	abs, err := a.resolve(path)
	if err != nil {
		return "error: " + err.Error()
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return "error: " + err.Error()
	}
	if len(data) > maxReadBytes {
		return string(data[:maxReadBytes]) + "\n… [truncated at 100KB]"
	}
	return string(data)
}

func (a *Agent) listFiles(path string) string {
	abs, err := a.resolve(path)
	if err != nil {
		return "error: " + err.Error()
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		return "error: " + err.Error()
	}
	var b strings.Builder
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() {
			name += "/"
		}
		b.WriteString(name)
		b.WriteString("\n")
	}
	if b.Len() == 0 {
		return "(empty directory)"
	}
	return b.String()
}

func (a *Agent) search(query string) string {
	if strings.TrimSpace(query) == "" {
		return "error: empty query"
	}
	needle := strings.ToLower(query)
	var b strings.Builder
	matches := 0
	err := filepath.WalkDir(a.Root, func(p string, d os.DirEntry, err error) error {
		if err != nil || matches >= 100 {
			if matches >= 100 {
				return filepath.SkipAll
			}
			return nil
		}
		if d.IsDir() {
			switch d.Name() {
			case ".git", "node_modules", ".venv", "__pycache__", "dist", "build", ".ainow", "vendor":
				return filepath.SkipDir
			}
			return nil
		}
		data, rerr := os.ReadFile(p)
		if rerr != nil || len(data) > maxReadBytes {
			return nil
		}
		rel, _ := filepath.Rel(a.Root, p)
		rel = filepath.ToSlash(rel)
		sc := bufio.NewScanner(strings.NewReader(string(data)))
		line := 0
		for sc.Scan() {
			line++
			if strings.Contains(strings.ToLower(sc.Text()), needle) {
				fmt.Fprintf(&b, "%s:%d: %s\n", rel, line, strings.TrimSpace(sc.Text()))
				matches++
				if matches >= 100 {
					return filepath.SkipAll
				}
			}
		}
		return nil
	})
	if err != nil && err != filepath.SkipAll {
		return "error: " + err.Error()
	}
	if matches == 0 {
		return "no matches"
	}
	return b.String()
}

func (a *Agent) writeFile(path, content string) string {
	abs, err := a.resolve(path)
	if err != nil {
		return "error: " + err.Error()
	}
	existingBytes, statErr := os.ReadFile(abs)
	existed := statErr == nil
	preview := diffPreview(string(existingBytes), content)
	if !a.approve("write", path, preview) {
		return "user declined to write " + path
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return "error: " + err.Error()
	}
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		return "error: " + err.Error()
	}
	a.UI.RecordUndo(UndoEntry{Path: path, HadPrevious: existed, PreviousContent: string(existingBytes)})
	return "wrote " + path + fmt.Sprintf(" (%d bytes)", len(content))
}

// parseEditArgs accepts either the single old_string/new_string pair or the
// batched edits array, normalizing both to []Edit.
func parseEditArgs(argsJSON string) ([]Edit, error) {
	var p struct {
		Old   string `json:"old_string"`
		New   string `json:"new_string"`
		Edits []struct {
			Old string `json:"old_string"`
			New string `json:"new_string"`
		} `json:"edits"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &p); err != nil {
		return nil, fmt.Errorf("could not parse tool arguments: %w", err)
	}
	if len(p.Edits) > 0 {
		out := make([]Edit, len(p.Edits))
		for i, e := range p.Edits {
			out[i] = Edit{Old: e.Old, New: e.New}
		}
		return out, nil
	}
	if p.Old == "" {
		return nil, fmt.Errorf("edit_file needs old_string/new_string or a non-empty edits array")
	}
	return []Edit{{Old: p.Old, New: p.New}}, nil
}

func (a *Agent) editFile(path string, edits []Edit) string {
	abs, err := a.resolve(path)
	if err != nil {
		return "error: " + err.Error()
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return "error: " + err.Error()
	}
	// Match in a BOM-free, LF-only view; restore both on write so the file
	// keeps its original encoding details.
	original := string(data)
	bom, text := stripBOM(original)
	ending := detectLineEnding(text)
	updated, usedFuzzy, applyErr := applyEdits(normalizeToLF(text), edits, path)
	if applyErr != nil {
		return "error: " + applyErr.Error()
	}
	preview := editsPreview(edits)
	if usedFuzzy {
		preview += "(fuzzy-matched: quote/dash/trailing-whitespace differences were tolerated)\n"
	}
	if !a.approve("edit", path, preview) {
		return "user declined to edit " + path
	}
	if err := os.WriteFile(abs, []byte(bom+restoreLineEndings(updated, ending)), 0o644); err != nil {
		return "error: " + err.Error()
	}
	a.UI.RecordUndo(UndoEntry{Path: path, HadPrevious: true, PreviousContent: original})
	if len(edits) > 1 {
		return fmt.Sprintf("edited %s (%d replacements)", path, len(edits))
	}
	return "edited " + path
}

// editsPreview renders the approval preview for an edit batch: one hunk per
// replacement, numbered when there is more than one.
func editsPreview(edits []Edit) string {
	var b strings.Builder
	for i, e := range edits {
		if len(edits) > 1 {
			fmt.Fprintf(&b, "edit %d of %d:\n", i+1, len(edits))
		}
		b.WriteString(hunkPreview(e.Old, e.New))
	}
	return b.String()
}

// Restore reverts a file to the state captured in an UndoEntry: the previous
// content, or deletion if the entry marks the file as newly created. It is
// exported so a front-end can implement /undo without instantiating an Agent.
func Restore(root string, e UndoEntry) error {
	abs := filepath.Join(root, filepath.FromSlash(e.Path))
	if e.HadPrevious {
		return os.WriteFile(abs, []byte(e.PreviousContent), 0o644)
	}
	return os.Remove(abs)
}

func (a *Agent) runCommand(ctx context.Context, command, callID string) string {
	if strings.TrimSpace(command) == "" {
		return "error: empty command"
	}
	if !a.approve("run", command, command) {
		return "user declined to run the command"
	}
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}
	cmd.Dir = a.Root
	// Output streams to the bus as it arrives, so a front-end can show a
	// long build scrolling. Stdout and Stderr share the writer; os/exec
	// serializes Write calls when both are the same value.
	out := &liveWriter{}
	if bus := a.bus(); bus.HasHandlers(events.ToolExecutionUpdate) {
		out.emit = func(chunk string) {
			bus.Emit(&events.Event{Type: events.ToolExecutionUpdate, Depth: a.Depth,
				ToolName: "run_command", ToolCallID: callID, Partial: chunk})
		}
	}
	cmd.Stdout = out
	cmd.Stderr = out
	err := cmd.Run()
	result := out.String()
	if len(result) > maxReadBytes {
		result = result[:maxReadBytes] + "\n… [output truncated]"
	}
	if err != nil {
		return fmt.Sprintf("command exited with error: %v\n%s", err, result)
	}
	if strings.TrimSpace(result) == "" {
		return "(command produced no output)"
	}
	return result
}

// modeDenied explains that a tool is blocked by the current mode. It only
// fires for modes that withhold the tool, so a.Mode is never the zero value
// here.
func (a *Agent) modeDenied(tool string) string {
	return "error: " + tool + " is not available in " + string(a.Mode) + " mode — switch with /mode build"
}

// approve consults the UI (unless AutoApprove is set). Modes that force
// approval always prompt, even when AutoApprove is on.
func (a *Agent) approve(action, target, preview string) bool {
	if a.AutoApprove && !PermissionsFor(a.Mode).ForceApproval {
		return true
	}
	return a.UI.Approve(ApprovalRequest{Action: action, Target: target, Preview: preview})
}

// remember writes a durable fact to project (or personal) memory. It is the
// agent's L1 prompt-memory write channel, distinct from write_file: a memory
// write is metadata, hard-capped, and shown as a focused preview so a wrong
// lesson can be caught at the approval gate. A refused append past the cap
// surfaces as actionable guidance rather than a silent truncation.
func (a *Agent) remember(content string, rewrite bool, scope string) string {
	scope = strings.TrimSpace(strings.ToLower(scope))
	if scope == "" {
		scope = "project"
	}

	// Dry-run first to size the result for the approval preview without
	// touching disk if the user declines or the cap is hit.
	dry, err := a.rememberOnce(content, rewrite, scope, false)
	if err != nil {
		if err == memory.ErrMemoryFull {
			return "error: " + err.Error()
		}
		return "error: " + err.Error()
	}

	preview := "+ " + strings.TrimSpace(content)
	if rewrite {
		preview = "(rewrite) replacing memory with:\n" + capLines(prefixLines(preview, "+"), maxDiffLines)
	}
	if !a.approve("remember", dry.Path, preview) {
		return "user declined to update memory"
	}

	res, err := a.rememberOnce(content, rewrite, scope, true)
	if err != nil {
		if err == memory.ErrMemoryFull {
			return "error: " + err.Error()
		}
		return "error: " + err.Error()
	}
	return fmt.Sprintf("remembered in %s (%d bytes)", res.Path, res.Bytes)
}

// rememberOnce calls the memory package once for the chosen scope. It exists to
// keep the dry-run/apply pair in remember() tidy.
func (a *Agent) rememberOnce(content string, rewrite bool, scope string, allowWrite bool) (memory.RememberResult, error) {
	if scope == "user" {
		return memory.RememberUser(content, rewrite, allowWrite)
	}
	return memory.Remember(a.Root, content, rewrite, allowWrite)
}

// recall searches past-session digests. It is read-only and offered in every
// mode: a recall never changes the repo, and a session that taught something is
// exactly the context a planning turn wants before it writes anything.
func (a *Agent) recall(query string) string {
	digests, err := memory.Recall(a.Root, query, 10)
	if err != nil {
		return "error: " + err.Error()
	}
	if len(digests) == 0 {
		if strings.TrimSpace(query) == "" {
			return "no past sessions recorded yet"
		}
		return "no past sessions matched " + strconv.Quote(query)
	}
	var b strings.Builder
	for _, d := range digests {
		fmt.Fprintf(&b, "## %s\n", d.Title)
		fmt.Fprintf(&b, "session: %s  date: %s  outcome: %s\n", d.SessionID, d.Date, d.Outcome)
		if d.Goal != "" {
			fmt.Fprintf(&b, "goal: %s\n", d.Goal)
		}
		if len(d.Files) > 0 {
			fmt.Fprintf(&b, "files: %s\n", strings.Join(d.Files, ", "))
		}
		if len(d.Gotchas) > 0 {
			b.WriteString("gotchas:\n")
			for _, g := range d.Gotchas {
				fmt.Fprintf(&b, "  - %s\n", g)
			}
		}
		b.WriteString("\n")
	}
	return strings.TrimSpace(b.String())
}
