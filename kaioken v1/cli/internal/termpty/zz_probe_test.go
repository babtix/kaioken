//go:build windows

package termpty

import (
	"strings"
	"testing"
	"time"
)

func TestProbeClean(t *testing.T) {
	skipIfUnsupported(t)
	p, err := Start(StartOptions{Dir: t.TempDir(), Cols: 80, Rows: 24})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer p.Close()

	time.Sleep(400 * time.Millisecond)
	if _, err := p.Write([]byte("echo probe-clean-marker\r")); err != nil {
		t.Fatal(err)
	}
	// One single readUntil call for the whole test — no concurrent readers.
	got := readUntil(t, p, "probe-clean-marker\r\nprobe-clean-marker", 25*time.Second)
	t.Logf("count=%d len=%d\n%q", strings.Count(got, "probe-clean-marker"), len(got), got)
}
