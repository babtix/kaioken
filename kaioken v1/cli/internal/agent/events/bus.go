package events

import "sync"

// Handler observes (and for interceptable types, mutates) one event.
type Handler func(*Event)

// Bus dispatches events to subscribers, synchronously and in subscription
// order. Synchronous dispatch is the point: interceptable hooks must run to
// completion before the agent acts on their verdict, and an observational
// handler that needs concurrency can spawn its own goroutine.
//
// A nil *Bus is valid and inert, so callers emit unconditionally instead of
// nil-checking at every site.
type Bus struct {
	mu       sync.RWMutex
	handlers map[Type][]Handler
	all      []Handler
}

// NewBus returns an empty bus.
func NewBus() *Bus {
	return &Bus{handlers: make(map[Type][]Handler)}
}

// Default is the process-wide bus. Front-ends that own an agent share it
// with subsystems that have no agent handle — compaction call sites, the
// extension host — so one subscription observes the whole process. Code
// that wants isolation (tests, sub-agents) builds its own bus instead.
var Default = NewBus()

// Subscribe registers a handler for one event type.
func (b *Bus) Subscribe(t Type, h Handler) {
	if b == nil || h == nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[t] = append(b.handlers[t], h)
}

// SubscribeAll registers a handler for every event type. All-handlers run
// after the type-specific ones.
func (b *Bus) SubscribeAll(h Handler) {
	if b == nil || h == nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.all = append(b.all, h)
}

// HasHandlers reports whether anything is listening for t, so emitters can
// skip building expensive payloads nobody wants.
func (b *Bus) HasHandlers(t Type) bool {
	if b == nil {
		return false
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.handlers[t]) > 0 || len(b.all) > 0
}

// Emit delivers e to every subscriber of e.Type, then to the SubscribeAll
// handlers. Handlers run on the caller's goroutine; the mutated event is
// what the caller reads back for interceptable types.
func (b *Bus) Emit(e *Event) {
	if b == nil || e == nil {
		return
	}
	b.mu.RLock()
	specific := b.handlers[e.Type]
	all := b.all
	b.mu.RUnlock()
	for _, h := range specific {
		h(e)
	}
	for _, h := range all {
		h(e)
	}
}
