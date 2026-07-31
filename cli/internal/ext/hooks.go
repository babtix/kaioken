package ext

// Extension hooks and commands.
//
// A tool lets the model call into an extension; a hook is the reverse — the
// extension watches the agent live. A wasm extension declares the event
// types it wants in its manifest, and the host forwards each matching event
// as a one-shot sandboxed call. For the two interceptable types the plugin's
// answer matters: tool_call may be blocked or its arguments rewritten,
// tool_result may be rewritten. Everything else is observation.
//
// Commands are the user-facing half: an extension declares named commands
// the TUI exposes (via /x), each again one sandboxed call.
//
// Both are wasm-only. An MCP server is a long-lived subprocess with its own
// protocol; teaching it hooks means a notification convention nothing
// implements yet. Refusing the manifest is honest; silently not calling the
// hook is not.

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"kaioken/internal/agent/events"
)

// hookTimeout bounds one hook dispatch. Hooks run inline on the agent's
// goroutine; a plugin that hangs must cost seconds, not the session.
const hookTimeout = 5 * time.Second

// allowedHooks is the set of event types a manifest may subscribe to.
var allowedHooks = map[string]bool{
	string(events.AgentStart):          true,
	string(events.AgentEnd):            true,
	string(events.TurnStart):           true,
	string(events.TurnEnd):             true,
	string(events.MessageEnd):          true,
	string(events.ToolExecutionStart):  true,
	string(events.ToolExecutionEnd):    true,
	string(events.ToolCall):            true,
	string(events.ToolResult):          true,
	string(events.CompactionStart):     true,
	string(events.CompactionEnd):       true,
	string(events.RetryStart):          true,
	string(events.RetryEnd):            true,
	string(events.SessionBeforeSwitch): true,
	string(events.SessionBeforeFork):   true,
}

// validHookName reports whether extensions may subscribe to this event.
// message_update and tool_execution_update are deliberately absent: they
// fire per token/chunk, and a sandbox instantiation per delta would turn
// streaming into a slideshow.
func validHookName(name string) bool { return allowedHooks[name] }

// hookEvent is the flat JSON payload a plugin receives.
type hookEvent struct {
	Type       string `json:"type"`
	Step       int    `json:"step,omitempty"`
	Depth      int    `json:"depth,omitempty"`
	ToolName   string `json:"tool_name,omitempty"`
	ToolCallID string `json:"tool_call_id,omitempty"`
	ToolArgs   string `json:"tool_args,omitempty"`
	Result     string `json:"result,omitempty"`
	Text       string `json:"text,omitempty"`
	IsError    bool   `json:"is_error,omitempty"`
	Error      string `json:"error,omitempty"`
	SessionID  string `json:"session_id,omitempty"`
}

// hookResponse is what a plugin may answer. Empty fields mean "no opinion";
// only the interceptable event types read them at all.
type hookResponse struct {
	Block  bool   `json:"block,omitempty"`
	Reason string `json:"reason,omitempty"`
	Args   string `json:"args,omitempty"`
	Result string `json:"result,omitempty"`
}

var activateOnce sync.Once

// ActivateHooks subscribes every enabled, trusted wasm extension that
// declares hooks to the process-wide event bus. It is idempotent — the TUI,
// headless run and RPC server may all call it — and failures are reported
// through warn and otherwise swallowed: a broken plugin loses its vote, the
// turn goes on. Only an explicit block from a healthy plugin is honored.
func ActivateHooks(root string, warn func(string)) {
	if warn == nil {
		warn = func(string) {}
	}
	activateOnce.Do(func() {
		lock, err := LoadLock()
		if err != nil {
			return
		}
		for i := range lock.Extensions {
			e := lock.Extensions[i]
			if !e.Enabled || !e.Trusted() {
				continue
			}
			man, err := LoadManifest(InstallDir(e.ID, e.Version))
			if err != nil || man.Type != TypeWasm || len(man.Hooks) == 0 {
				continue
			}
			subscribeHooks(e, man, root, warn)
		}
	})
}

// resetHooksForTest re-arms the activation guard.
func resetHooksForTest() { activateOnce = sync.Once{} }

func subscribeHooks(entry Installed, man *Manifest, root string, warn func(string)) {
	for _, name := range man.Hooks {
		if !validHookName(name) {
			continue // Validate refuses these at install; belt and braces
		}
		e, m := entry, man // capture per subscription
		events.Default.Subscribe(events.Type(name), func(ev *events.Event) {
			dispatchHook(&e, m, root, ev, warn)
		})
	}
}

// dispatchHook forwards one event to one plugin and applies its verdict.
func dispatchHook(entry *Installed, man *Manifest, root string, ev *events.Event, warn func(string)) {
	payload := hookEvent{
		Type: string(ev.Type), Step: ev.Step, Depth: ev.Depth,
		ToolName: ev.ToolName, ToolCallID: ev.ToolCallID, ToolArgs: ev.ToolArgs,
		Result: ev.Result, Text: ev.Text, IsError: ev.IsError, SessionID: ev.SessionID,
	}
	if ev.Err != nil {
		payload.Error = ev.Err.Error()
	}
	req, err := json.Marshal(map[string]any{"method": "hook", "event": payload})
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), hookTimeout)
	defer cancel()
	out, err := runWasm(ctx, entry, man, root, req)
	if err != nil {
		warn(fmt.Sprintf("extension %s: %s hook failed: %v", entry.ID, ev.Type, err))
		return
	}
	var res hookResponse
	if len(out) == 0 || json.Unmarshal(out, &res) != nil {
		return // an empty or malformed answer is "no opinion"
	}
	switch ev.Type {
	case events.ToolCall:
		if res.Block {
			ev.Block = true
			ev.BlockReason = blockReason(entry.ID, res.Reason)
		} else if strings.TrimSpace(res.Args) != "" && json.Valid([]byte(res.Args)) {
			ev.ToolArgs = res.Args
		}
	case events.ToolResult:
		if res.Result != "" {
			ev.Result = res.Result
		}
	case events.SessionBeforeSwitch, events.SessionBeforeFork:
		if res.Block {
			ev.Block = true
			ev.BlockReason = blockReason(entry.ID, res.Reason)
		}
	}
}

// blockReason names the extension in the reason the model/user sees, so a
// surprising veto is attributable.
func blockReason(id, reason string) string {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "blocked by extension"
	}
	return reason + " [extension " + id + "]"
}

// ExtCommand is one user-invokable command an extension contributes.
type ExtCommand struct {
	ExtID       string
	Name        string
	Description string
}

// Commands lists the commands of enabled, trusted wasm extensions.
func Commands() []ExtCommand {
	lock, err := LoadLock()
	if err != nil {
		return nil
	}
	var out []ExtCommand
	for _, e := range lock.Extensions {
		if !e.Enabled || !e.Trusted() {
			continue
		}
		man, err := LoadManifest(InstallDir(e.ID, e.Version))
		if err != nil || man.Type != TypeWasm {
			continue
		}
		for _, c := range man.Commands {
			out = append(out, ExtCommand{ExtID: e.ID, Name: c.Name, Description: c.Description})
		}
	}
	return out
}

// CommandResult is what an extension command returns to the front-end.
type CommandResult struct {
	// Text is displayed to the user.
	Text string `json:"text,omitempty"`
	// Steer, when non-empty, is offered to the running agent as a steering
	// message — the extension's way to talk to the model mid-run.
	Steer string `json:"steer,omitempty"`
	// IsError marks Text as a failure report.
	IsError bool `json:"isError,omitempty"`
}

// CallCommand runs one extension command in the sandbox.
func CallCommand(ctx context.Context, root, extID, name, args string) (CommandResult, error) {
	man, entry, err := InstalledManifest(extID)
	if err != nil {
		return CommandResult{}, err
	}
	if man.Type != TypeWasm {
		return CommandResult{}, fmt.Errorf("extension %s has no runnable commands", extID)
	}
	if !entry.Trusted() {
		return CommandResult{}, fmt.Errorf("extension %s is not trusted — /ext trust %s first", extID, extID)
	}
	declared := false
	for _, c := range man.Commands {
		if c.Name == name {
			declared = true
			break
		}
	}
	if !declared {
		return CommandResult{}, fmt.Errorf("extension %s declares no command %q", extID, name)
	}
	req, err := json.Marshal(map[string]any{"method": "command", "name": name, "args": args})
	if err != nil {
		return CommandResult{}, err
	}
	out, err := runWasm(ctx, entry, man, root, req)
	if err != nil {
		return CommandResult{}, err
	}
	var res CommandResult
	if err := json.Unmarshal(out, &res); err != nil {
		return CommandResult{}, fmt.Errorf("parsing command response from %s: %w", extID, err)
	}
	return res, nil
}
