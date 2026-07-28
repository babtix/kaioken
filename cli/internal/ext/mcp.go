package ext

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"kaioken/internal/version"
)

// A minimal Model Context Protocol client over stdio: newline-delimited
// JSON-RPC 2.0 against a child process. Only what the extension host needs
// is implemented — initialize, tools/list and tools/call — pinned to one
// protocol revision. No SSE/HTTP transports.

// mcpProtocolVersion is the MCP revision this client speaks.
const mcpProtocolVersion = "2024-11-05"

// Timeouts are variables so tests can shrink them.
var (
	// mcpStartTimeout bounds process start plus the initialize handshake.
	mcpStartTimeout = 20 * time.Second
	// extCallTimeout bounds a single extension tool request (mcp or wasm)
	// when the caller's context has no earlier deadline.
	extCallTimeout = 60 * time.Second
)

// mcpMaxLine caps one JSON-RPC message from the server (10 MB).
const mcpMaxLine = 10 << 20

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// rpcMessage is a JSON-RPC 2.0 frame, loose enough to cover requests,
// responses and notifications in either direction.
type rpcMessage struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      *int64          `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

// mcpClient is one live server subprocess.
type mcpClient struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser

	mu      sync.Mutex
	nextID  int64
	pending map[int64]chan rpcMessage
	closed  bool

	stderr *tailBuffer
	// done closes when the read loop has drained stdout and reaped the
	// process; after that every pending and future call fails fast.
	done chan struct{}
}

// launchCommand resolves the manifest's command against the install dir:
// bare names use PATH, absolute paths pass through, and relative paths must
// stay inside the extension's own tree.
func launchCommand(dir string, mc *MCPConfig) (string, error) {
	command := strings.TrimSpace(mc.Command)
	if !strings.ContainsAny(command, `/\`) || filepath.IsAbs(command) {
		return command, nil
	}
	abs := filepath.Join(dir, filepath.FromSlash(command))
	if !within(dir, abs) {
		return "", fmt.Errorf("mcp command %q escapes the extension directory", mc.Command)
	}
	return abs, nil
}

// startMCP launches an extension's MCP server and completes the initialize
// handshake. The caller owns the returned client and must close() it.
func startMCP(ctx context.Context, entry *Installed, man *Manifest) (*mcpClient, error) {
	dir := InstallDir(entry.ID, entry.Version)
	command, err := launchCommand(dir, man.MCP)
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(command, man.MCP.Args...)
	cmd.Dir = dir
	cmd.Env = os.Environ()
	for k, v := range man.MCP.Env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	c := &mcpClient{
		cmd:     cmd,
		stdin:   stdin,
		pending: map[int64]chan rpcMessage{},
		stderr:  &tailBuffer{},
		done:    make(chan struct{}),
	}
	cmd.Stderr = c.stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("starting mcp server for %s: %w", entry.ID, err)
	}
	go c.readLoop(stdout)

	hctx, cancel := context.WithTimeout(ctx, mcpStartTimeout)
	defer cancel()
	_, err = c.call(hctx, "initialize", map[string]any{
		"protocolVersion": mcpProtocolVersion,
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "kaioken", "version": version.Version},
	})
	if err != nil {
		c.close()
		return nil, fmt.Errorf("mcp initialize failed for %s: %w", entry.ID, c.explain(err))
	}
	if err := c.notify("notifications/initialized", nil); err != nil {
		c.close()
		return nil, fmt.Errorf("mcp handshake failed for %s: %w", entry.ID, c.explain(err))
	}
	return c, nil
}

// readLoop routes server output: responses to their waiting callers,
// notifications to the floor, and server-initiated requests to a polite
// method-not-found. It ends by reaping the process and failing all pending.
func (c *mcpClient) readLoop(stdout io.Reader) {
	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 64*1024), mcpMaxLine)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var msg rpcMessage
		if json.Unmarshal([]byte(line), &msg) != nil {
			continue // not JSON-RPC; some servers leak logs onto stdout
		}
		switch {
		case msg.Method != "" && msg.ID != nil:
			// A server-initiated request (sampling etc.) — unsupported.
			c.send(rpcMessage{JSONRPC: "2.0", ID: msg.ID,
				Error: &rpcError{Code: -32601, Message: "method not supported by kaioken"}})
		case msg.Method != "":
			// Notification — ignored.
		case msg.ID != nil:
			c.mu.Lock()
			ch := c.pending[*msg.ID]
			delete(c.pending, *msg.ID)
			c.mu.Unlock()
			if ch != nil {
				ch <- msg
			}
		}
	}
	_ = c.cmd.Wait()
	c.mu.Lock()
	for id, ch := range c.pending {
		delete(c.pending, id)
		close(ch)
	}
	c.closed = true
	c.mu.Unlock()
	close(c.done)
}

// send writes one frame; the mutex keeps concurrent writers line-atomic.
func (c *mcpClient) send(msg rpcMessage) error {
	raw, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return fmt.Errorf("mcp server has exited")
	}
	_, err = c.stdin.Write(append(raw, '\n'))
	return err
}

func (c *mcpClient) notify(method string, params any) error {
	var raw json.RawMessage
	if params != nil {
		b, err := json.Marshal(params)
		if err != nil {
			return err
		}
		raw = b
	}
	return c.send(rpcMessage{JSONRPC: "2.0", Method: method, Params: raw})
}

// call issues a request and waits for its response, the context, or the
// server dying — whichever comes first.
func (c *mcpClient) call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, extCallTimeout)
		defer cancel()
	}
	b, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.nextID++
	id := c.nextID
	ch := make(chan rpcMessage, 1)
	c.pending[id] = ch
	c.mu.Unlock()

	if err := c.send(rpcMessage{JSONRPC: "2.0", ID: &id, Method: method, Params: b}); err != nil {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, err
	}

	select {
	case msg, ok := <-ch:
		if !ok {
			return nil, fmt.Errorf("mcp server exited during %s", method)
		}
		if msg.Error != nil {
			return nil, fmt.Errorf("mcp %s: %s (code %d)", method, msg.Error.Message, msg.Error.Code)
		}
		return msg.Result, nil
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, fmt.Errorf("mcp %s timed out: %w", method, ctx.Err())
	case <-c.done:
		return nil, fmt.Errorf("mcp server exited during %s", method)
	}
}

// mcpToolInfo is one entry from tools/list.
type mcpToolInfo struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

// listTools fetches the server's tool catalog, following pagination.
func (c *mcpClient) listTools(ctx context.Context) ([]mcpToolInfo, error) {
	var out []mcpToolInfo
	cursor := ""
	for {
		params := map[string]any{}
		if cursor != "" {
			params["cursor"] = cursor
		}
		raw, err := c.call(ctx, "tools/list", params)
		if err != nil {
			return nil, c.explain(err)
		}
		var res struct {
			Tools      []mcpToolInfo `json:"tools"`
			NextCursor string        `json:"nextCursor"`
		}
		if err := json.Unmarshal(raw, &res); err != nil {
			return nil, fmt.Errorf("parsing tools/list result: %w", err)
		}
		out = append(out, res.Tools...)
		if res.NextCursor == "" {
			return out, nil
		}
		cursor = res.NextCursor
	}
}

// callTool invokes one tool. argsJSON must be a JSON object (or empty).
func (c *mcpClient) callTool(ctx context.Context, name, argsJSON string) (string, error) {
	args := map[string]any{}
	if strings.TrimSpace(argsJSON) != "" {
		if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
			return "", fmt.Errorf("tool arguments must be a JSON object: %w", err)
		}
	}
	raw, err := c.call(ctx, "tools/call", map[string]any{"name": name, "arguments": args})
	if err != nil {
		return "", c.explain(err)
	}
	var res struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return "", fmt.Errorf("parsing tools/call result: %w", err)
	}
	var b strings.Builder
	for _, part := range res.Content {
		if part.Type == "text" {
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(part.Text)
		}
	}
	if res.IsError {
		return "", fmt.Errorf("tool %s reported an error: %s", name, b.String())
	}
	return b.String(), nil
}

// close shuts the server down: stdin close first (the polite signal), then a
// kill after a short grace period. It always waits for the read loop so the
// process is reaped.
func (c *mcpClient) close() {
	c.mu.Lock()
	stdinClosed := c.closed
	c.mu.Unlock()
	if !stdinClosed {
		_ = c.stdin.Close()
	}
	select {
	case <-c.done:
		return
	case <-time.After(3 * time.Second):
	}
	if c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
	}
	<-c.done
}

// explain augments an error with the server's recent stderr, which is where
// the actual reason ("node: command not found", a stack trace) usually is.
func (c *mcpClient) explain(err error) error {
	tail := c.stderr.String()
	if tail == "" {
		return err
	}
	return fmt.Errorf("%w\nserver stderr:\n%s", err, tail)
}

// tailBuffer keeps the last few KB written to it — enough stderr to explain
// a failure without holding a chatty server's whole log.
type tailBuffer struct {
	mu  sync.Mutex
	buf []byte
}

const tailBufferMax = 4096

func (t *tailBuffer) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.buf = append(t.buf, p...)
	if len(t.buf) > tailBufferMax {
		t.buf = t.buf[len(t.buf)-tailBufferMax:]
	}
	return len(p), nil
}

func (t *tailBuffer) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return strings.TrimSpace(string(t.buf))
}
