package events

import (
	"errors"
	"testing"

	"kaioken/internal/llm"
)

func TestSubscribeOrderAndEmit(t *testing.T) {
	b := NewBus()
	var order []string
	b.Subscribe(TurnStart, func(e *Event) { order = append(order, "first") })
	b.Subscribe(TurnStart, func(e *Event) { order = append(order, "second") })
	b.SubscribeAll(func(e *Event) { order = append(order, "all") })

	b.Emit(&Event{Type: TurnStart})
	if len(order) != 3 || order[0] != "first" || order[1] != "second" || order[2] != "all" {
		t.Fatalf("dispatch order wrong: %v", order)
	}
}

func TestEmitOnlyMatchingType(t *testing.T) {
	b := NewBus()
	hits := 0
	b.Subscribe(AgentStart, func(e *Event) { hits++ })
	b.Emit(&Event{Type: AgentEnd})
	if hits != 0 {
		t.Fatalf("AgentStart handler fired for AgentEnd")
	}
	b.Emit(&Event{Type: AgentStart})
	if hits != 1 {
		t.Fatalf("hits = %d, want 1", hits)
	}
}

func TestHandlerMutatesInterceptableEvent(t *testing.T) {
	b := NewBus()
	b.Subscribe(ToolCall, func(e *Event) {
		e.ToolArgs = `{"path":"redirected.txt"}`
	})
	b.Subscribe(ToolResult, func(e *Event) {
		e.Result = "[redacted]"
	})

	call := &Event{Type: ToolCall, ToolArgs: `{"path":"secret.txt"}`}
	b.Emit(call)
	if call.ToolArgs != `{"path":"redirected.txt"}` {
		t.Errorf("ToolArgs not rewritten: %s", call.ToolArgs)
	}

	res := &Event{Type: ToolResult, Result: "top secret"}
	b.Emit(res)
	if res.Result != "[redacted]" {
		t.Errorf("Result not rewritten: %s", res.Result)
	}
}

func TestHandlerVeto(t *testing.T) {
	b := NewBus()
	b.Subscribe(ToolCall, func(e *Event) {
		e.Block = true
		e.BlockReason = "policy"
	})
	ev := &Event{Type: ToolCall, ToolName: "run_command"}
	b.Emit(ev)
	if !ev.Block || ev.BlockReason != "policy" {
		t.Fatalf("veto not recorded: %+v", ev)
	}
}

func TestHistoryMutation(t *testing.T) {
	b := NewBus()
	b.Subscribe(BeforeProviderRequest, func(e *Event) {
		*e.History = append(*e.History, llm.Message{Role: "user", Content: "injected"})
	})
	history := []llm.Message{{Role: "system", Content: "s"}}
	b.Emit(&Event{Type: BeforeProviderRequest, History: &history})
	if len(history) != 2 || history[1].Content != "injected" {
		t.Fatalf("history not mutated through pointer: %+v", history)
	}
}

func TestNilBusIsInert(t *testing.T) {
	var b *Bus
	// None of these may panic.
	b.Subscribe(AgentStart, func(e *Event) {})
	b.SubscribeAll(func(e *Event) {})
	b.Emit(&Event{Type: AgentStart, Err: errors.New("x")})
	if b.HasHandlers(AgentStart) {
		t.Fatal("nil bus claims handlers")
	}
}

func TestHasHandlers(t *testing.T) {
	b := NewBus()
	if b.HasHandlers(ToolCall) {
		t.Fatal("empty bus claims handlers")
	}
	b.Subscribe(ToolCall, func(e *Event) {})
	if !b.HasHandlers(ToolCall) {
		t.Fatal("subscription not visible")
	}
	// A SubscribeAll listener makes every type report handlers: emitters
	// must build payloads for it.
	b2 := NewBus()
	b2.SubscribeAll(func(e *Event) {})
	if !b2.HasHandlers(CompactionStart) {
		t.Fatal("SubscribeAll not counted by HasHandlers")
	}
}
