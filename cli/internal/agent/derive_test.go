package agent

import (
	"testing"

	"kaioken/internal/agent/events"
	"kaioken/internal/config"
	"kaioken/internal/llm"
)

// TestDeriveInheritedFields verifies that derive() inherits fields that must carry
// over to sub-agents (Client, Root, UI, MaxSteps, AllowRun, Mode, MemoryDisabled,
// Budget, Perms).
func TestDeriveInheritedFields(t *testing.T) {
	client := &llm.Client{}
	budget := &BudgetGuard{WarnAt: 5.0, HardStop: 10.0}
	perms := NewRuleset([]Rule{
		{Action: ActionRun, Pattern: "go test", Grant: Allow},
	})
	ui := fakeUI{}

	tests := []struct {
		name           string
		memoryDisabled bool
		allowRun       bool
		mode           Mode
	}{
		{
			name:           "memory disabled and allow run true",
			memoryDisabled: true,
			allowRun:       true,
			mode:           ModePlan,
		},
		{
			name:           "memory enabled and allow run false",
			memoryDisabled: false,
			allowRun:       false,
			mode:           ModeExplore,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			parent := &Agent{
				Client:         client,
				Root:           "/workspace/repo",
				UI:             ui,
				MaxSteps:       50,
				AllowRun:       tc.allowRun,
				Mode:           tc.mode,
				MemoryDisabled: tc.memoryDisabled,
				Budget:         budget,
				Perms:          perms,
			}

			child := parent.derive()

			if child.Client != parent.Client {
				t.Errorf("Client: got %v, want %v", child.Client, parent.Client)
			}
			if child.Root != parent.Root {
				t.Errorf("Root: got %q, want %q", child.Root, parent.Root)
			}
			if child.UI != parent.UI {
				t.Errorf("UI: got %v, want %v", child.UI, parent.UI)
			}
			if child.MaxSteps != parent.MaxSteps {
				t.Errorf("MaxSteps: got %d, want %d", child.MaxSteps, parent.MaxSteps)
			}
			if child.AllowRun != parent.AllowRun {
				t.Errorf("AllowRun: got %v, want %v", child.AllowRun, parent.AllowRun)
			}
			if child.Mode != parent.Mode {
				t.Errorf("Mode: got %v, want %v", child.Mode, parent.Mode)
			}
			if child.MemoryDisabled != parent.MemoryDisabled {
				t.Errorf("MemoryDisabled: got %v, want %v", child.MemoryDisabled, parent.MemoryDisabled)
			}
			if child.Budget != parent.Budget {
				t.Errorf("Budget: got %v, want %v", child.Budget, parent.Budget)
			}
			if child.Perms != parent.Perms {
				t.Errorf("Perms: got %v, want %v", child.Perms, parent.Perms)
			}
		})
	}
}

// TestDeriveDepth verifies that derive() increments Depth by 1.
func TestDeriveDepth(t *testing.T) {
	for _, depth := range []int{0, 1, 2} {
		parent := &Agent{Depth: depth}
		child := parent.derive()
		if child.Depth != depth+1 {
			t.Errorf("Depth for parent %d: got %d, want %d", depth, child.Depth, depth+1)
		}
	}
}

// TestDeriveContextNil verifies that Context is left nil even when the parent
// has a non-nil ContextTracker.
func TestDeriveContextNil(t *testing.T) {
	parent := &Agent{
		Context: &ContextTracker{},
	}
	child := parent.derive()
	if child.Context != nil {
		t.Errorf("Context: got %v, want nil", child.Context)
	}
}

// TestDeriveNotesAndConfigNil verifies that Notes and Config are left nil even
// when the parent has them configured.
func TestDeriveNotesAndConfigNil(t *testing.T) {
	parent := &Agent{
		Notes:  NewDirNotes(),
		Config: &config.Config{Model: "custom-model"},
	}
	child := parent.derive()
	if child.Notes != nil {
		t.Errorf("Notes: got %v, want nil", child.Notes)
	}
	if child.Config != nil {
		t.Errorf("Config: got %v, want nil", child.Config)
	}
}

// TestDeriveNoStreamAndAutoApprove verifies that derive() enforces NoStream=true
// and AutoApprove=false regardless of parent settings.
func TestDeriveNoStreamAndAutoApprove(t *testing.T) {
	parent := &Agent{
		NoStream:    false,
		AutoApprove: true,
	}
	child := parent.derive()
	if !child.NoStream {
		t.Errorf("NoStream: got %v, want true", child.NoStream)
	}
	if child.AutoApprove {
		t.Errorf("AutoApprove: got %v, want false", child.AutoApprove)
	}
}

// TestDeriveEvents verifies that derive() explicitly resolves Events to a.bus().
func TestDeriveEvents(t *testing.T) {
	// When parent has nil Events, child gets events.Default
	parentDefault := &Agent{Events: nil}
	childDefault := parentDefault.derive()
	if childDefault.Events != events.Default {
		t.Errorf("Events with nil parent: got %v, want events.Default", childDefault.Events)
	}

	// When parent has a custom Bus, child inherits it
	customBus := events.NewBus()
	parentCustom := &Agent{Events: customBus}
	childCustom := parentCustom.derive()
	if childCustom.Events != customBus {
		t.Errorf("Events with custom bus: got %v, want %v", childCustom.Events, customBus)
	}
}

// TestDeriveQueueIndependence verifies that the derived agent's steering and
// follow-up queues are isolated from the parent.
func TestDeriveQueueIndependence(t *testing.T) {
	parent := &Agent{}
	parent.Steer("steer parent 1")
	parent.Steer("steer parent 2")
	parent.FollowUp("followup parent 1")

	if parent.QueuedCount() != 3 {
		t.Fatalf("parent QueuedCount before derive: got %d, want 3", parent.QueuedCount())
	}

	child := parent.derive()
	if child.QueuedCount() != 0 {
		t.Errorf("child QueuedCount immediately after derive: got %d, want 0", child.QueuedCount())
	}

	child.Steer("steer child 1")
	if child.QueuedCount() != 1 {
		t.Errorf("child QueuedCount after steer: got %d, want 1", child.QueuedCount())
	}
	if parent.QueuedCount() != 3 {
		t.Errorf("parent QueuedCount after child steer: got %d, want 3", parent.QueuedCount())
	}

	parent.Steer("steer parent 3")
	if parent.QueuedCount() != 4 {
		t.Errorf("parent QueuedCount after parent steer: got %d, want 4", parent.QueuedCount())
	}
	if child.QueuedCount() != 1 {
		t.Errorf("child QueuedCount after parent steer: got %d, want 1", child.QueuedCount())
	}
}
