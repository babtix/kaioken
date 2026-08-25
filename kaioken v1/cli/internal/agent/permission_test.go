package agent

import (
	"testing"
)

func TestChainable(t *testing.T) {
	tests := []struct {
		name    string
		command string
		want    bool
	}{
		{name: "newline separator", command: "git status\nrm -rf /", want: true},
		{name: "crlf separator", command: "git status\r\nrm -rf /", want: true},
		{name: "cr separator", command: "git status\rrm -rf /", want: true},
		{name: "nul byte", command: "git status\x00rm -rf /", want: true},
		{name: "shell AND operator", command: "git status && rm -rf /", want: true},
		{name: "shell OR operator", command: "git status || echo fail", want: true},
		{name: "shell pipe", command: "git status | grep modified", want: true},
		{name: "shell semicolon", command: "git status ; rm -rf /", want: true},
		{name: "subshell substitution dollar", command: "echo $(whoami)", want: true},
		{name: "subshell substitution backtick", command: "echo `whoami`", want: true},
		{name: "simple command with args", command: "go test ./...", want: false},
		{name: "simple echo", command: "echo hi", want: false},
		{name: "single command", command: "git status", want: false},
		{name: "npm run", command: "npm run test", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Chainable(tt.command)
			if got != tt.want {
				t.Errorf("Chainable(%q) = %v, want %v", tt.command, got, tt.want)
			}
		})
	}
}

func TestCommandPrefix(t *testing.T) {
	tests := []struct {
		name    string
		command string
		want    string
	}{
		{name: "newline separated command", command: "git status\nrm -rf /", want: "git status"},
		{name: "crlf separated command", command: "git status\r\nrm -rf /", want: "git status"},
		{name: "chained shell operator", command: "git status && rm -rf /", want: "git status"},
		{name: "go test with flags", command: "go test ./... -race -count=1", want: "go test"},
		{name: "npm run test", command: "npm run test -- --watch=false", want: "npm run test"},
		{name: "docker compose", command: "docker compose up -d", want: "docker compose up"},
		{name: "single token verb", command: "echo hello world", want: "echo"},
		{name: "unknown command", command: "./deploy.sh --prod", want: "./deploy.sh"},
		{name: "empty command", command: "", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CommandPrefix(tt.command)
			if got != tt.want {
				t.Errorf("CommandPrefix(%q) = %q, want %q", tt.command, got, tt.want)
			}
		})
	}
}

func TestStandingDecisionGuard(t *testing.T) {
	// standingDecision logic mirrors Agent.standingDecision:
	// a chained command must always yield Ask regardless of stored rules.
	standingDecision := func(rs *Ruleset, action, target string) Decision {
		if action == ActionRun && Chainable(target) {
			return Ask
		}
		return rs.Evaluate(action, canonicalTarget(action, target))
	}

	rs := NewRuleset([]Rule{
		{Action: ActionRun, Pattern: "git status", Grant: Allow},
		{Action: ActionRun, Pattern: "go test", Grant: Allow},
	})

	// Normal approved commands evaluate to Allow.
	if got := standingDecision(rs, ActionRun, "git status"); got != Allow {
		t.Errorf("standingDecision(git status) = %v, want %v", got, Allow)
	}
	if got := standingDecision(rs, ActionRun, "go test ./..."); got != Allow {
		t.Errorf("standingDecision(go test ./...) = %v, want %v", got, Allow)
	}

	// Chained commands must be refused by the Chainable guard and return Ask,
	// even when the prefix matches a stored Allow rule.
	tests := []struct {
		name    string
		command string
	}{
		{name: "newline chain attack", command: "git status\nrm -rf /"},
		{name: "crlf chain attack", command: "git status\r\nrm -rf /"},
		{name: "shell operator chain", command: "git status && rm -rf /"},
		{name: "pipe chain", command: "git status | rm -rf /"},
		{name: "subshell chain", command: "git status $(rm -rf /)"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := standingDecision(rs, ActionRun, tt.command)
			if got != Ask {
				t.Errorf("standingDecision(%q) = %v, want %v (should be blocked by Chainable guard)", tt.command, got, Ask)
			}
		})
	}
}
