package agent

import (
	"strings"
	"testing"
)

func TestDiffHunks(t *testing.T) {
	tests := []struct {
		name      string
		old, new  string
		wantNil   bool   // expect nil (no change)
		wantHunks int    // minimum hunk count
		wantCap   bool   // expect the synthetic cap hunk
		check     func(t *testing.T, hunks []Hunk)
	}{
		{
			name:      "single-line change",
			old:       "line1\nline2\nline3\nline4\nline5",
			new:       "line1\nline2\nCHANGED\nline4\nline5",
			wantHunks: 1,
			check: func(t *testing.T, hunks []Hunk) {
				h := hunks[0]
				// Should have context lines around the change.
				var hasRemove, hasAdd bool
				for _, l := range h.Lines {
					if l.Op == "-" && l.Text == "line3" {
						hasRemove = true
					}
					if l.Op == "+" && l.Text == "CHANGED" {
						hasAdd = true
					}
				}
				if !hasRemove || !hasAdd {
					t.Fatalf("expected -line3 and +CHANGED, got %+v", h.Lines)
				}
			},
		},
		{
			name: "multi-hunk change",
			old:  "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no",
			new:  "a\nB\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nN\no",
			wantHunks: 2,
			check: func(t *testing.T, hunks []Hunk) {
				if len(hunks) < 2 {
					t.Fatalf("expected at least 2 hunks for distant changes, got %d", len(hunks))
				}
			},
		},
		{
			name:      "new file",
			old:       "",
			new:       "hello\nworld",
			wantHunks: 1,
			check: func(t *testing.T, hunks []Hunk) {
				for _, l := range hunks[0].Lines {
					if l.Op == "-" {
						t.Fatal("new file should have no removals")
					}
				}
			},
		},
		{
			name:      "deletion",
			old:       "hello\nworld",
			new:       "",
			wantHunks: 1,
			check: func(t *testing.T, hunks []Hunk) {
				for _, l := range hunks[0].Lines {
					if l.Op == "+" {
						t.Fatal("deletion should have no additions")
					}
				}
			},
		},
		{
			name:    "no change",
			old:     "same\ncontent",
			new:     "same\ncontent",
			wantNil: true,
		},
		{
			name: "over 400-line cap",
			old:  strings.Repeat("old\n", 500),
			new:  strings.Repeat("new\n", 500),
			wantCap: true,
			check: func(t *testing.T, hunks []Hunk) {
				if len(hunks) != 1 {
					t.Fatalf("expected 1 synthetic hunk, got %d", len(hunks))
				}
				if !strings.Contains(hunks[0].Lines[0].Text, "too large to diff") {
					t.Fatalf("expected cap marker, got %q", hunks[0].Lines[0].Text)
				}
			},
		},
		{
			name:      "CRLF input",
			old:       "line1\r\nline2\r\nline3",
			new:       "line1\r\nCHANGED\r\nline3",
			wantHunks: 1,
			check: func(t *testing.T, hunks []Hunk) {
				// Should still detect the change despite \r\n.
				var found bool
				for _, l := range hunks[0].Lines {
					if l.Op == "+" {
						found = true
					}
				}
				if !found {
					t.Fatal("expected an addition in CRLF diff")
				}
			},
		},
		{
			name:      "no trailing newline",
			old:       "line1\nline2",
			new:       "line1\nline2\nline3",
			wantHunks: 1,
			check: func(t *testing.T, hunks []Hunk) {
				var hasAdd bool
				for _, l := range hunks[0].Lines {
					if l.Op == "+" && l.Text == "line3" {
						hasAdd = true
					}
				}
				if !hasAdd {
					t.Fatal("expected +line3 for appended line")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hunks := DiffHunks(tt.old, tt.new)
			if tt.wantNil {
				if hunks != nil {
					t.Fatalf("expected nil, got %d hunks", len(hunks))
				}
				return
			}
			if hunks == nil {
				t.Fatal("expected non-nil hunks")
			}
			if tt.wantHunks > 0 && len(hunks) < tt.wantHunks {
				t.Fatalf("expected >= %d hunks, got %d", tt.wantHunks, len(hunks))
			}
			if tt.check != nil {
				tt.check(t, hunks)
			}
		})
	}
}
