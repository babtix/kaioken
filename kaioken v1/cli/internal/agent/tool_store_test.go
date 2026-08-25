package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)


func TestBoundOutputSmall(t *testing.T) {
	input := "line 1\nline 2\nline 3"
	res, err := BoundOutput("", "call1", "test_tool", input, &BoundOptions{MaxLines: 10, MaxBytes: 100})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.WasTruncated {
		t.Errorf("expected output not to be truncated")
	}
	if res.BoundedText != input {
		t.Errorf("expected bounded text to match input")
	}
}

func TestBoundOutputLargeTruncation(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "kaioken_tool_store_test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	var lines []string
	for i := 1; i <= 100; i++ {
		lines = append(lines, fmt.Sprintf("Line %d content", i))
	}
	largeInput := strings.Join(lines, "\n")

	res, err := BoundOutput(tempDir, "call_123", "run_command", largeInput, &BoundOptions{MaxLines: 20, MaxBytes: 10000})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !res.WasTruncated {
		t.Errorf("expected output to be truncated")
	}

	if !strings.Contains(res.BoundedText, "truncated:") {
		t.Errorf("expected truncation notice in bounded text, got %q", res.BoundedText)
	}
	if !strings.Contains(res.BoundedText, "Full output saved to") {
		t.Errorf("expected the notice to point at the spill file, got %q", res.BoundedText)
	}

	if res.SpilledPath == "" {
		t.Errorf("expected spilled path to be set")
	}

	content, err := os.ReadFile(res.SpilledPath)
	if err != nil {
		t.Fatalf("failed to read spilled file: %v", err)
	}
	if string(content) != largeInput {
		t.Errorf("spilled content does not match original raw output")
	}
}

// The byte cap used to be unenforceable: the head/tail split was derived from
// the line count alone, so output that was under the line limit but far over
// the byte limit came back whole — plus a notice claiming it had been
// truncated. A 500 KB command result reached the model in full.
func TestBoundOutputEnforcesByteCap(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"few huge lines", strings.Repeat(strings.Repeat("x", 20_000)+"\n", 10)},
		{"one huge line", strings.Repeat("y", 500_000)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res, err := BoundOutput(t.TempDir(), "call_1", "run_command", tc.raw, nil)
			if err != nil {
				t.Fatal(err)
			}
			if !res.WasTruncated {
				t.Fatal("expected truncation")
			}
			if res.KeptBytes > DefaultMaxBytes {
				t.Errorf("kept %d bytes, over the %d cap", res.KeptBytes, DefaultMaxBytes)
			}
			if len(res.BoundedText) >= len(tc.raw) {
				t.Errorf("bounded text (%d bytes) is not smaller than the raw output (%d)",
					len(res.BoundedText), len(tc.raw))
			}
		})
	}
}

// Command output is bounded from the tail: a build that printed ten thousand
// lines and then failed put the reason in the last few.
func TestBoundOutputDirectionByTool(t *testing.T) {
	raw := "FIRST\n" + strings.Repeat("filler\n", 5000) + "LAST"

	cmdRes, err := BoundOutput(t.TempDir(), "c1", "run_command", raw, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmdRes.BoundedText, "LAST") || strings.Contains(cmdRes.BoundedText, "FIRST") {
		t.Error("run_command output should keep its tail, not its head")
	}

	readRes, err := BoundOutput(t.TempDir(), "c2", "read_file", raw, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(readRes.BoundedText, "FIRST") || strings.Contains(readRes.BoundedText, "LAST") {
		t.Error("read_file output should keep its head, not its tail")
	}
}

// The spill filename is built from a provider-supplied call ID. Treating that
// as a path component would let a crafted id write outside the spill dir.
func TestSpillPathIgnoresTraversalInCallID(t *testing.T) {
	root := t.TempDir()
	res, err := BoundOutput(root, "../../escaped", "run_command",
		strings.Repeat("z", DefaultMaxBytes*2), nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.SpilledPath == "" {
		t.Fatal("expected a spill file")
	}
	want := filepath.Join(root, ".kaioken", "tool-output")
	if !strings.HasPrefix(res.SpilledPath, want) {
		t.Errorf("spilled to %q, outside %q", res.SpilledPath, want)
	}
}

