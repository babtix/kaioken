// Package daemon exposes the Kaioken engine over a loopback HTTP API with a
// Server-Sent Events stream, so a desktop front-end can drive the same
// pipelines the TUI drives. It owns no generation logic: every handler is a
// thin adapter over internal/{agent,wiki,skills,plan,generate,scan,session}.
package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"kaioken/internal/prism"
	"kaioken/internal/version"
)

// Options configures a single daemon process.
type Options struct {
	Addr      string // "127.0.0.1:0" — always loopback
	Token     string // required; constant-time compared on every request
	ParentPID int    // 0 disables the stdin-EOF parent watchdog
	Quiet     bool   // suppress the stdout handshake and request log (tests)
}

// Server holds the daemon's process-lifetime state. Handlers close over
// *Server to reach the hub, workspace manager, and (later) run/approval
// registries.
type Server struct {
	opts      Options
	started   time.Time
	cancel    context.CancelFunc
	port      int
	hub       *Hub
	mgr       *Manager
	runs      *Runs
	approvals *Approvals

	// prisms holds one PRISM engine per workspace, built on first use.
	//
	// Not per request. An engine owns the store's lock, the tokenised view of
	// each module and the retrieval cache, so building a fresh one per request
	// throws all three away — and, worse, gives two concurrent requests two
	// different locks over the same files, which is not a lock at all.
	prismMu sync.Mutex
	prisms  map[string]*prism.Engine
}

// Run serves until ctx is cancelled, POST /v1/shutdown is called, or the
// parent process disappears (when opts.ParentPID != 0). The bootstrap order
// below is deliberate: the handshake line must be the first and only thing
// ever written to stdout, so a desktop shell parsing it byte-for-byte never
// races against anything else.
func Run(ctx context.Context, opts Options) error {
	if opts.Token == "" {
		return errors.New("daemon: a token is required — refusing to serve unauthenticated")
	}

	ln, err := net.Listen("tcp", opts.Addr)
	if err != nil {
		return fmt.Errorf("daemon: listen %s: %w", opts.Addr, err)
	}

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	port := ln.Addr().(*net.TCPAddr).Port
	srv := &Server{opts: opts, started: time.Now(), cancel: cancel, port: port, hub: NewHub(), mgr: NewManager()}
	srv.runs = NewRuns(srv.hub)
	srv.approvals = NewApprovals()
	handler := newMux(srv)

	if !opts.Quiet {
		line, err := json.Marshal(map[string]any{
			"kaioken_daemon": 1,
			"port":           port,
			"pid":            os.Getpid(),
			"version":        version.Version,
		})
		if err != nil {
			return fmt.Errorf("daemon: marshal handshake: %w", err)
		}
		// os.Stdout.Write is an unbuffered syscall — no explicit flush needed.
		// Nothing else may ever write to stdout after this; logs go to stderr.
		if _, err := os.Stdout.Write(append(line, '\n')); err != nil {
			return fmt.Errorf("daemon: write handshake: %w", err)
		}
	}

	if opts.ParentPID != 0 {
		go watchStdin(cancel)
	}

	httpSrv := &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancelTimeout := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancelTimeout()
		_ = httpSrv.Shutdown(shutdownCtx)
	}()

	if err := httpSrv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// watchStdin reads stdin until EOF, then cancels the daemon's root context.
// Rust holds the sidecar's stdin pipe open for exactly this purpose: when the
// parent process dies, the pipe closes and this read unblocks immediately.
// This is portable and dependency-free, unlike PID polling — os.FindProcess
// always succeeds on Windows, so it cannot detect a dead parent on its own.
func watchStdin(cancel context.CancelFunc) {
	buf := make([]byte, 4096)
	for {
		if _, err := os.Stdin.Read(buf); err != nil {
			cancel()
			return
		}
	}
}
