package ext

import (
	"strings"
	"testing"
)

func TestParseSemver(t *testing.T) {
	good := map[string]semver{
		"1.2.3":   {1, 2, 3},
		"v1.2.3":  {1, 2, 3},
		"0.0.1":   {0, 0, 1},
		"10.0.20": {10, 0, 20},
	}
	for in, want := range good {
		got, err := parseSemver(in)
		if err != nil {
			t.Errorf("parseSemver(%q): %v", in, err)
			continue
		}
		if got != want {
			t.Errorf("parseSemver(%q) = %v, want %v", in, got, want)
		}
	}
	for _, in := range []string{"", "1.2", "1.2.3.4", "1.2.x", "1.02.3", "-1.2.3", "1.2.3-beta"} {
		if _, err := parseSemver(in); err == nil {
			t.Errorf("parseSemver(%q) should fail", in)
		}
	}
}

func TestSemverCompareAndNewer(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"1.0.0", "1.0.0", 0},
		{"1.0.1", "1.0.0", 1},
		{"1.1.0", "1.0.9", 1},
		{"2.0.0", "1.99.99", 1},
		{"0.9.0", "1.0.0", -1},
	}
	for _, c := range cases {
		av, _ := parseSemver(c.a)
		bv, _ := parseSemver(c.b)
		if got := av.compare(bv); got != c.want {
			t.Errorf("compare(%s, %s) = %d, want %d", c.a, c.b, got, c.want)
		}
	}

	if !newerVersion("1.0.1", "1.0.0") {
		t.Error("1.0.1 should be newer than 1.0.0")
	}
	if newerVersion("1.0.0", "1.0.0") {
		t.Error("equal versions are not newer")
	}
	if newerVersion("garbage", "1.0.0") || newerVersion("1.0.1", "garbage") {
		t.Error("unparseable versions must never report newer")
	}
}

func TestMinVersionSatisfied(t *testing.T) {
	if err := minVersionSatisfied("1.0.0", ""); err != nil {
		t.Errorf("empty min must always pass: %v", err)
	}
	if err := minVersionSatisfied("2.0.0", "1.5.0"); err != nil {
		t.Errorf("newer host must pass: %v", err)
	}
	if err := minVersionSatisfied("1.0.0", "1.5.0"); err == nil {
		t.Error("older host must be refused")
	}
	// The dev build placeholder loads everything, or no extension could be
	// tested against an unreleased host.
	if err := minVersionSatisfied(devVersion, "99.0.0"); err != nil {
		t.Errorf("dev build must pass any min: %v", err)
	}
	if err := minVersionSatisfied("1.0.0", "not-a-version"); err == nil || !strings.Contains(err.Error(), "minKaiokenVersion") {
		t.Errorf("invalid min must be reported, got %v", err)
	}
}
