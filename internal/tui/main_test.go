package tui

import (
	"os"
	"testing"

	"kaioken/internal/config"
)

// TestMain redirects the global config at $KAIOKEN_HOME into a throwaway
// directory for the whole package.
//
// This is not hygiene, it is damage control: the /key path writes the entered
// key to the user's real ~/.kaioken/config.yaml, so any test that exercises
// key entry silently destroys the developer's actual API key. That happened.
// Nothing in this package may run against the real home directory.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "kaioken-test-home")
	if err != nil {
		panic("cannot create a temp config home: " + err.Error())
	}
	if err := os.Setenv(config.HomeEnv, dir); err != nil {
		panic("cannot sandbox the config home: " + err.Error())
	}
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}
