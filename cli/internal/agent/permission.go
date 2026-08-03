package agent

// Standing permissions.
//
// Approval used to be all-or-nothing: answer y/n every time, or set
// AutoApprove and answer nothing ever again. Neither is what anyone wants
// after the fifth `go test ./...` of a session. The user does not want to
// approve *everything*; they want to approve *this*, and have that stick.
//
// So approvals are matched against a ruleset before the prompt is raised.
// Rules are wildcard patterns scoped to an action, last match wins, and the
// default is to ask — opencode's model (permission/index.ts evaluate). The
// front-end owns adding rules, because "always allow" is a UI affordance;
// this package only consults them.
//
// The other half is deciding what "this" means. `npm run test -- --watch=false`
// and `npm run test` are the same command to a human and different strings to
// a matcher, while `npm` covers far more than anyone means to approve. The
// arity table below maps a command to the prefix that carries its meaning,
// which is what a rule is written against — ported from opencode's
// permission/arity.ts.

import (
	"strings"
	"sync"
)

// Action names the kind of thing being approved. They match the strings
// already passed to Agent.approve.
const (
	ActionRun       = "run"
	ActionWrite     = "write"
	ActionEdit      = "edit"
	ActionRemember  = "remember"
	ActionExtension = "extension"
)

// Decision is what a ruleset says about a request.
type Decision string

const (
	// Ask raises the approval prompt. The default for everything.
	Ask Decision = "ask"
	// Allow proceeds without prompting.
	Allow Decision = "allow"
	// Deny refuses without prompting. A denied action never reaches the user,
	// which is the point: it is for things the answer is always no to.
	Deny Decision = "deny"
)

// Rule grants or refuses one pattern of one action. Pattern is matched against
// the canonical target — for run_command, the arity-trimmed command prefix.
type Rule struct {
	Action  string   `yaml:"action" json:"action"`
	Pattern string   `yaml:"pattern" json:"pattern"`
	Grant   Decision `yaml:"grant" json:"grant"`
}

// Ruleset is a shared, mutable set of standing permissions. Like BudgetGuard
// it outlives the per-turn Agent. A nil Ruleset asks about everything, which
// is the old behavior.
type Ruleset struct {
	mu    sync.RWMutex
	rules []Rule
}

// NewRuleset returns a ruleset seeded with rules (typically from config).
func NewRuleset(rules []Rule) *Ruleset {
	rs := &Ruleset{}
	rs.rules = append(rs.rules, rules...)
	return rs
}

// Add appends a rule. Later rules win, so adding is how a decision is changed.
func (r *Ruleset) Add(rule Rule) {
	if r == nil || rule.Action == "" || rule.Pattern == "" {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rules = append(r.rules, rule)
}

// Rules returns a copy of the current rules, for persisting to config.
func (r *Ruleset) Rules() []Rule {
	if r == nil {
		return nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return append([]Rule(nil), r.rules...)
}

// Evaluate reports what to do about an action on a target. The last matching
// rule wins, so a broad allow can be narrowed by a later deny.
func (r *Ruleset) Evaluate(action, target string) Decision {
	if r == nil {
		return Ask
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := Ask
	for _, rule := range r.rules {
		if rule.Action != action && rule.Action != "*" {
			continue
		}
		if wildcardMatch(rule.Pattern, target) {
			out = rule.Grant
		}
	}
	return out
}

// wildcardMatch reports whether s matches a pattern in which "*" stands for
// any run of characters, including none. Everything else is literal — these
// patterns are written by users about paths and commands, where the regex
// metacharacters would be more surprise than power.
func wildcardMatch(pattern, s string) bool {
	if pattern == "*" {
		return true
	}
	parts := strings.Split(pattern, "*")
	if len(parts) == 1 {
		return pattern == s
	}
	if !strings.HasPrefix(s, parts[0]) {
		return false
	}
	s = s[len(parts[0]):]
	last := len(parts) - 1
	for _, part := range parts[1:last] {
		if part == "" {
			continue
		}
		i := strings.Index(s, part)
		if i < 0 {
			return false
		}
		s = s[i+len(part):]
	}
	if parts[last] == "" {
		return true
	}
	return strings.HasSuffix(s, parts[last])
}

// commandArity maps a command prefix to how many leading tokens carry its
// meaning, flags excluded. Ported from opencode's permission/arity.ts, trimmed
// to the tools a coding session actually reaches for.
//
// The rule that makes it work: only list a longer prefix when its arity
// differs from what the shorter one already implies. `git` is 2, so
// `git commit` needs no entry; `npm` is 2 but `npm run` is 3, because
// "npm run" alone says nothing about what is being run.
var commandArity = map[string]int{
	// Single-token commands: the verb is the whole meaning.
	"cat": 1, "cd": 1, "chmod": 1, "chown": 1, "cp": 1, "curl": 1, "echo": 1,
	"env": 1, "export": 1, "find": 1, "grep": 1, "head": 1, "kill": 1, "ln": 1,
	"ls": 1, "mkdir": 1, "mv": 1, "ps": 1, "pwd": 1, "rg": 1, "rm": 1,
	"rmdir": 1, "sed": 1, "sleep": 1, "sort": 1, "tail": 1, "touch": 1,
	"tree": 1, "wc": 1, "which": 1,

	// Two-token: a subcommand selects the operation.
	"bazel": 2, "brew": 2, "bun": 2, "bundle": 2, "cargo": 2, "composer": 2,
	"deno": 2, "docker": 2, "dotnet": 2, "flutter": 2, "gem": 2, "git": 2,
	"go": 2, "gradle": 2, "helm": 2, "kubectl": 2, "make": 2, "mix": 2,
	"mvn": 2, "npm": 2, "npx": 2, "pip": 2, "pnpm": 2, "poetry": 2, "rustup": 2,
	"terraform": 2, "uv": 2, "yarn": 2,

	// Three-token: the subcommand is a namespace, the next word is the verb.
	"bun run": 3, "bun x": 3, "cargo add": 3, "cargo run": 3, "deno task": 3,
	"docker compose": 3, "docker container": 3, "docker image": 3,
	"docker network": 3, "docker volume": 3, "git remote": 3, "git stash": 3,
	"git submodule": 3, "go mod": 3, "go tool": 3, "npm run": 3, "pnpm run": 3,
	"uv run": 3, "yarn run": 3,
}

// CommandPrefix reduces a command line to the part that names what it does.
// Flags and arguments are dropped, so `go test ./... -race -count=1` and
// `go test ./internal/agent` both reduce to `go test` — one approval, and one
// rule, covering the command the user actually had in mind.
//
// Unknown commands reduce to their first token, which is deliberately
// conservative: approving `./deploy.sh --prod` should not silently approve
// `./deploy.sh --prod --force`, but it also should not require an exact-string
// rule per invocation. Callers that want the exact line can still write one.
func CommandPrefix(command string) string {
	tokens := commandTokens(command)
	if len(tokens) == 0 {
		return ""
	}
	for n := len(tokens); n > 0; n-- {
		if arity, ok := commandArity[strings.Join(tokens[:n], " ")]; ok {
			if arity > len(tokens) {
				arity = len(tokens)
			}
			return strings.Join(tokens[:arity], " ")
		}
	}
	return tokens[0]
}

// commandTokens splits a command line into words, dropping flags. It stops at
// the first shell operator: in `git status && rm -rf /` only the first command
// is what an approval of "git status" would be about, and the rest must not
// ride along on it.
func commandTokens(command string) []string {
	var out []string
	for _, raw := range strings.Fields(strings.TrimSpace(command)) {
		if isShellOperator(raw) {
			break
		}
		if strings.HasPrefix(raw, "-") {
			continue
		}
		out = append(out, raw)
	}
	return out
}

// isShellOperator reports whether a token chains or redirects to another
// command. A chained line is not the command it starts with.
func isShellOperator(tok string) bool {
	switch tok {
	case "&&", "||", "|", ";", "&", ">", ">>", "<", "|&":
		return true
	}
	return strings.ContainsAny(tok, ";|&") || strings.HasPrefix(tok, "$(") || strings.Contains(tok, "`")
}

// canonicalTarget is what a rule is matched against for an action: the
// meaning-carrying prefix for a command, the path for anything else.
func canonicalTarget(action, target string) string {
	if action == ActionRun {
		return CommandPrefix(target)
	}
	return target
}

// Chainable reports whether a command line chains or substitutes other
// commands. Such a line must never be covered by a stored rule: the rule was
// written about its first command, and the rest is unexamined.
func Chainable(command string) bool {
	for _, raw := range strings.Fields(command) {
		if isShellOperator(raw) {
			return true
		}
	}
	return strings.Contains(command, "$(") || strings.Contains(command, "`")
}
