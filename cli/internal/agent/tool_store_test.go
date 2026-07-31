package agent

import (
	"fmt"
	"os"
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

	if !strings.Contains(res.BoundedText, "[Tool Output Truncated:") {
		t.Errorf("expected truncation notice in bounded text")
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

