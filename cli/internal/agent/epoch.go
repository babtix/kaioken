package agent

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
)

// ContextEpoch manages the immutable system context baseline snapshot for LLM prompt caching,
// and tracks changes across provider turns to emit mid-conversation system updates.
type ContextEpoch struct {
	mu           sync.RWMutex
	EpochID      string
	BaselineText string
	Snapshots    map[string]string // source name -> content hash
}

// NewContextEpoch creates a new ContextEpoch from a baseline system prompt and initial source snapshots.
func NewContextEpoch(baseline string, snapshots map[string]string) *ContextEpoch {
	id := hashString(baseline)
	if len(id) > 12 {
		id = id[:12]
	}
	return &ContextEpoch{
		EpochID:      id,
		BaselineText: baseline,
		Snapshots:    snapshots,
	}
}

// ReconcileResult holds the output of comparing current context sources against epoch snapshots.
type ReconcileResult struct {
	HasChanges bool
	Updates    []string // Descriptions or rendered text of updated sources
}

// Reconcile checks current context sources against the epoch snapshots.
// Returns changes if any sources have modified since the epoch was created.
func (ce *ContextEpoch) Reconcile(currentSources map[string]string) ReconcileResult {
	ce.mu.Lock()
	defer ce.mu.Unlock()

	var updates []string
	hasChanges := false

	for name, content := range currentSources {
		oldHash, exists := ce.Snapshots[name]
		newHash := hashString(content)

		if !exists || oldHash != newHash {
			hasChanges = true
			ce.Snapshots[name] = newHash
			if content != "" {
				updates = append(updates, fmt.Sprintf("Context Source [%s] updated:\n%s", name, content))
			} else {
				updates = append(updates, fmt.Sprintf("Context Source [%s] cleared.", name))
			}
		}
	}

	return ReconcileResult{
		HasChanges: hasChanges,
		Updates:    updates,
	}
}

// BuildMidConversationMessage wraps context updates into a structured mid-conversation system message.
func BuildMidConversationMessage(updates []string) string {
	if len(updates) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("<system_context_update>\n")
	b.WriteString("The following dynamic context sources have updated since the session baseline:\n\n")
	b.WriteString(strings.Join(updates, "\n\n"))
	b.WriteString("\n</system_context_update>")
	return b.String()
}

func hashString(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}
