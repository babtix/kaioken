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
	"strings"

	"kaioken/internal/llm"
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
}

// Tools returns the tool schemas offered to the model.
func (a *Agent) Tools() []llm.Tool {
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
		{Type: "function", Function: llm.FunctionDef{
			Name:        "write_file",
			Description: "Create or overwrite a file with the given content. Requires user approval.",
			Parameters: raw(`{"type":"object","properties":{
				"path":{"type":"string"},
				"content":{"type":"string"}},
				"required":["path","content"]}`),
		}},
		{Type: "function", Function: llm.FunctionDef{
			Name: "edit_file",
			Description: "Replace the first exact occurrence of old_string with new_string in a file. " +
				"old_string must match uniquely. Requires user approval.",
			Parameters: raw(`{"type":"object","properties":{
				"path":{"type":"string"},
				"old_string":{"type":"string"},
				"new_string":{"type":"string"}},
				"required":["path","old_string","new_string"]}`),
		}},
	}
	if a.AllowRun {
		tools = append(tools, llm.Tool{Type: "function", Function: llm.FunctionDef{
			Name:        "run_command",
			Description: "Run a shell command in the repo root and return its output. Requires user approval.",
			Parameters: raw(`{"type":"object","properties":{
				"command":{"type":"string","description":"the command line to execute"}},
				"required":["command"]}`),
		}})
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

	switch tc.Function.Name {
	case "read_file":
		return a.readFile(getStr("path"))
	case "list_files":
		p := getStr("path")
		if p == "" {
			p = "."
		}
		return a.listFiles(p)
	case "search":
		return a.search(getStr("query"))
	case "read_knowledge":
		return a.readKnowledge(getStr("doc"))
	case "write_file":
		return a.writeFile(getStr("path"), getStr("content"))
	case "edit_file":
		return a.editFile(getStr("path"), getStr("old_string"), getStr("new_string"))
	case "run_command":
		return a.runCommand(ctx, getStr("command"))
	default:
		return "error: unknown tool " + tc.Function.Name
	}
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

func (a *Agent) editFile(path, oldStr, newStr string) string {
	abs, err := a.resolve(path)
	if err != nil {
		return "error: " + err.Error()
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return "error: " + err.Error()
	}
	content := string(data)
	n := strings.Count(content, oldStr)
	if n == 0 {
		return "error: old_string not found in " + path
	}
	if n > 1 {
		return fmt.Sprintf("error: old_string matches %d times in %s; make it unique", n, path)
	}
	preview := hunkPreview(oldStr, newStr)
	if !a.approve("edit", path, preview) {
		return "user declined to edit " + path
	}
	updated := strings.Replace(content, oldStr, newStr, 1)
	if err := os.WriteFile(abs, []byte(updated), 0o644); err != nil {
		return "error: " + err.Error()
	}
	a.UI.RecordUndo(UndoEntry{Path: path, HadPrevious: true, PreviousContent: content})
	return "edited " + path
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

func (a *Agent) runCommand(ctx context.Context, command string) string {
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
	out, err := cmd.CombinedOutput()
	result := string(out)
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

// approve consults the UI (unless AutoApprove is set).
func (a *Agent) approve(action, target, preview string) bool {
	if a.AutoApprove {
		return true
	}
	return a.UI.Approve(ApprovalRequest{Action: action, Target: target, Preview: preview})
}
