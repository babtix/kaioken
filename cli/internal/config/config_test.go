package config

import "testing"

// Kaioken's own output directory must be excluded from scans, or every run
// treats the wiki it generated last time as source material.
func TestDefaultExcludesOwnOutputDir(t *testing.T) {
	var found bool
	for _, e := range DefaultExcludes {
		if e == Dir {
			found = true
		}
	}
	if !found {
		t.Errorf("%q missing from DefaultExcludes: %v", Dir, DefaultExcludes)
	}
}

func TestIsFreeModel(t *testing.T) {
	cases := map[string]bool{
		"nvidia/nemotron-3-ultra-550b-a55b:free": true,
		"NVIDIA/Nemotron:FREE":                   true,
		"  deepseek/deepseek-r1:free  ":          true,
		"anthropic/claude-sonnet-4.5":            false,
		"openai/gpt-4o":                          false,
		"":                                       false,
	}
	for model, want := range cases {
		if got := IsFreeModel(model); got != want {
			t.Errorf("IsFreeModel(%q) = %v, want %v", model, got, want)
		}
	}
}

func TestEffectiveConcurrency(t *testing.T) {
	cfg := Default() // Concurrency 4

	if n, clamped := cfg.EffectiveConcurrency("anthropic/claude-sonnet-4.5"); n != 4 || clamped {
		t.Errorf("paid model = (%d, %v), want (4, false)", n, clamped)
	}
	if n, clamped := cfg.EffectiveConcurrency("deepseek/deepseek-r1:free"); n != FreeModelConcurrency || !clamped {
		t.Errorf("free model = (%d, %v), want (%d, true)", n, clamped, FreeModelConcurrency)
	}

	// A config that already asks for less than the cap keeps its own value and
	// must not report a clamp it did not perform.
	cfg.Concurrency = 1
	if n, clamped := cfg.EffectiveConcurrency("deepseek/deepseek-r1:free"); n != 1 || clamped {
		t.Errorf("free model at concurrency 1 = (%d, %v), want (1, false)", n, clamped)
	}

	// A zero/negative config value must never produce an errgroup limit of 0,
	// which would deadlock.
	cfg.Concurrency = 0
	if n, _ := cfg.EffectiveConcurrency("openai/gpt-4o"); n != 1 {
		t.Errorf("zero concurrency = %d, want 1", n)
	}
}
