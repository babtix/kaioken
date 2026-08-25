package ext

import (
	"fmt"
	"strconv"
	"strings"
)

// Extensions use strict three-part versions — no ranges, no pre-release
// tags — because the entire update story is "is the release tag newer than
// what is installed", and anything richer buys ambiguity, not capability.

// semver is a parsed MAJOR.MINOR.PATCH version.
type semver struct{ major, minor, patch int }

// parseSemver parses "1.2.3". A leading "v" is tolerated, since GitHub
// release tags are conventionally "v1.2.3".
func parseSemver(s string) (semver, error) {
	s = strings.TrimPrefix(strings.TrimSpace(s), "v")
	parts := strings.Split(s, ".")
	if len(parts) != 3 {
		return semver{}, fmt.Errorf("invalid version %q: want MAJOR.MINOR.PATCH", s)
	}
	var nums [3]int
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || (len(p) > 1 && p[0] == '0') {
			return semver{}, fmt.Errorf("invalid version %q: %q is not a plain number", s, p)
		}
		nums[i] = n
	}
	return semver{nums[0], nums[1], nums[2]}, nil
}

// compare returns -1, 0 or 1 as a sorts before, equal to, or after b.
func (a semver) compare(b semver) int {
	pairs := [3][2]int{{a.major, b.major}, {a.minor, b.minor}, {a.patch, b.patch}}
	for _, p := range pairs {
		switch {
		case p[0] < p[1]:
			return -1
		case p[0] > p[1]:
			return 1
		}
	}
	return 0
}

// newerVersion reports whether candidate is strictly newer than current.
// Unparseable input reports false: an update must never fire on garbage.
func newerVersion(candidate, current string) bool {
	c, err := parseSemver(candidate)
	if err != nil {
		return false
	}
	cur, err := parseSemver(current)
	if err != nil {
		return false
	}
	return c.compare(cur) > 0
}

// devVersion is the placeholder the source tree builds with. A binary
// reporting it is a development build, and a development build must be able
// to load every extension — otherwise no extension could ever be tested
// against an unreleased host.
const devVersion = "0.1.0"

// minVersionSatisfied reports whether the running Kaioken (app) satisfies an
// extension's minKaiokenVersion (min). An empty min means no requirement.
func minVersionSatisfied(app, min string) error {
	if strings.TrimSpace(min) == "" {
		return nil
	}
	mv, err := parseSemver(min)
	if err != nil {
		return fmt.Errorf("invalid minKaiokenVersion %q: %w", min, err)
	}
	if app == devVersion {
		return nil
	}
	av, err := parseSemver(app)
	if err != nil {
		// An unversioned build (custom ldflags) should not lock out
		// extensions — the pin exists to protect users of releases.
		return nil
	}
	if av.compare(mv) < 0 {
		return fmt.Errorf("requires kaioken >= %s (this build is %s)", min, app)
	}
	return nil
}
