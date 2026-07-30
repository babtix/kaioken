package mcp

import (
	"crypto/subtle"
	"encoding/json"
	"io"
	"os"
	"strings"
	"sync"
	"time"
)

// Logging goes to stderr as JSONL, never stdout — on the STDIO transport
// stdout is the protocol channel and one stray line corrupts the session.

// Level orders the log thresholds.
type Level int

const (
	LevelDebug Level = iota
	LevelInfo
	LevelWarn
	LevelError
	// LevelOff silences everything, for a client that treats any stderr output
	// as a failure.
	LevelOff
)

// ParseLevel maps a flag value onto a Level, defaulting to info.
func ParseLevel(s string) Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return LevelDebug
	case "warn", "warning":
		return LevelWarn
	case "error":
		return LevelError
	case "off", "none", "silent":
		return LevelOff
	default:
		return LevelInfo
	}
}

// Logger writes structured JSONL events. The nil Logger is valid and discards
// everything, so handlers can log unconditionally.
type Logger struct {
	mu    sync.Mutex
	w     io.Writer
	level Level
	// closer is set when the logger owns a file it must close.
	closer io.Closer
}

// NewLogger writes to path, or to stderr when path is empty.
func NewLogger(path string, level Level) (*Logger, error) {
	if level == LevelOff {
		return nil, nil
	}
	if path == "" {
		return &Logger{w: os.Stderr, level: level}, nil
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, err
	}
	return &Logger{w: f, level: level, closer: f}, nil
}

// Close releases an owned log file. Safe on a nil Logger.
func (l *Logger) Close() error {
	if l == nil || l.closer == nil {
		return nil
	}
	return l.closer.Close()
}

func (l *Logger) log(level Level, msg string, kv ...string) {
	if l == nil || level < l.level {
		return
	}
	rec := map[string]any{
		"ts":    time.Now().UTC().Format(time.RFC3339Nano),
		"level": levelName(level),
		"msg":   msg,
	}
	for i := 0; i+1 < len(kv); i += 2 {
		rec[kv[i]] = kv[i+1]
	}
	raw, err := json.Marshal(rec)
	if err != nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.w.Write(append(raw, '\n'))
}

func (l *Logger) debug(msg string, kv ...string) { l.log(LevelDebug, msg, kv...) }
func (l *Logger) info(msg string, kv ...string)  { l.log(LevelInfo, msg, kv...) }
func (l *Logger) warn(msg string, kv ...string)  { l.log(LevelWarn, msg, kv...) }

func levelName(l Level) string {
	switch l {
	case LevelDebug:
		return "debug"
	case LevelWarn:
		return "warn"
	case LevelError:
		return "error"
	default:
		return "info"
	}
}

// constantTimeEqual compares credentials without leaking length-independent
// timing, matching how the daemon checks its own token.
func constantTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// envOr reads an environment variable, tolerating an empty name.
func envOr(name string) string {
	if name == "" {
		return ""
	}
	return os.Getenv(name)
}
