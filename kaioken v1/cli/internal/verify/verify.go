// Package verify is the trust layer under the agent's "I fixed it" claim: it
// detects the repo's own build/test commands, and re-runs them in plain Go
// after the agent is done. The model's word is never taken at face value —
// the gate's exit is what counts.
package verify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

// checkTargetRe finds a `check:` rule in a Makefile — Kaioken's own repos use
// it as the canonical "build + vet + test" entry point.
var checkTargetRe = regexp.MustCompile(`(?m)^check:`)

// Detect returns the build/test commands a repo verifies itself with, in run
// order. A Makefile `check` target wins outright when present: a repo that
// defined one has told us how it wants to be checked. Otherwise the markers
// combine — a Go module with a package.json gets both sets. No markers at
// all is an error, not an empty list.
func Detect(repo string) ([]string, error) {
	if raw, err := os.ReadFile(filepath.Join(repo, "Makefile")); err == nil {
		if checkTargetRe.Match(raw) {
			return []string{"make check"}, nil
		}
	}

	var cmds []string
	if _, err := os.Stat(filepath.Join(repo, "go.mod")); err == nil {
		cmds = append(cmds, "go build ./...", "go test ./... -count=1")
	}
	if raw, err := os.ReadFile(filepath.Join(repo, "package.json")); err == nil {
		var pj struct {
			Scripts map[string]string `json:"scripts"`
		}
		if json.Unmarshal(raw, &pj) == nil && strings.TrimSpace(pj.Scripts["test"]) != "" {
			cmds = append(cmds, "npm test")
		}
	}
	if len(cmds) == 0 {
		return nil, fmt.Errorf("no verifiable build system found (go.mod, package.json test script, or Makefile check target)")
	}
	return cmds, nil
}

// Prompt assembles the instruction the fix-loop agent gets: the commands it
// must make pass, and the discipline for doing so.
func Prompt(cmds []string) string {
	var b strings.Builder
	b.WriteString("Verification loop. Run these commands in order at the repository root:\n\n")
	for _, c := range cmds {
		b.WriteString("  " + c + "\n")
	}
	b.WriteString("\nIf any fails, diagnose the failure and fix the code, then re-run from the " +
		"top. Repeat until everything passes or you have made 3 full attempts. Only change " +
		"what the failures implicate; do not refactor on the side. When done, say which " +
		"commands now pass.")
	return b.String()
}

// StepResult is one gate command's verdict.
type StepResult struct {
	Command string
	OK      bool
	Output  string // the tail of combined output, for reporting
}

// outputTail caps how much of a command's output survives into the report.
const outputTail = 2000

// Gate re-runs the commands in plain Go and reports each verdict. The
// returned error is non-nil when any command failed — that is the exit-code
// contract of `kaioken verify`.
func Gate(ctx context.Context, repo string, cmds []string) ([]StepResult, error) {
	var results []StepResult
	failed := 0
	for _, c := range cmds {
		out, err := shellRun(ctx, repo, c)
		step := StepResult{Command: c, OK: err == nil, Output: tail(out, outputTail)}
		if err != nil {
			failed++
		}
		results = append(results, step)
	}
	if failed > 0 {
		return results, fmt.Errorf("%d of %d command(s) failed", failed, len(cmds))
	}
	return results, nil
}

// shellRun runs one command line through the platform's shell so pipes,
// globs and `./...` expansions behave the way the user expects.
func shellRun(ctx context.Context, dir, command string) (string, error) {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/c", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}
	cmd.Dir = dir
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	return buf.String(), err
}

func tail(s string, n int) string {
	s = strings.TrimRight(s, "\r\n")
	if len(s) <= n {
		return s
	}
	return "…" + s[len(s)-n:]
}
