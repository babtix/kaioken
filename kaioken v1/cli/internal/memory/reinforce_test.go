package memory

import (
	"testing"

	"kaioken/internal/llm"
	"kaioken/internal/skills"
)

func TestSkillNameFromDocArg(t *testing.T) {
	cases := map[string]string{
		`{"doc":".kaioken/skills/add-a-cli-command"}`:           "add-a-cli-command",
		`{"doc":"skills/add-a-cli-command"}`:                    "add-a-cli-command",
		`{"doc":".kaioken/skills/add-a-cli-command/SKILL.md"}`:  "add-a-cli-command",
		`{"doc":".kaioken/wiki/Architecture"}`:                  "",
		`{"doc":".kaioken/skills"}`:                             "",
		`{"doc":""}`:                                             "",
		`not json`:                                               "",
	}
	for in, want := range cases {
		if got := skillNameFromDocArg(in); got != want {
			t.Errorf("skillNameFromDocArg(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestConsultedSkills(t *testing.T) {
	conv := []llm.Message{
		assistantTool(tc("read_knowledge", `{"doc":".kaioken/skills/add-a-cli-command"}`)),
		toolRes("read_knowledge", "the skill body"),
		assistantTool(tc("read_knowledge", `{"doc":".kaioken/wiki/Architecture"}`)),
		toolRes("read_knowledge", "a chapter"),
		assistantTool(tc("read_knowledge", `{"doc":"skills/add-a-tui-command"}`)),
		toolRes("read_knowledge", "the tui skill"),
	}
	got := ConsultedSkills(conv)
	if len(got) != 2 {
		t.Fatalf("expected 2 skills, got %v", got)
	}
	if got[0] != "add-a-cli-command" || got[1] != "add-a-tui-command" {
		t.Errorf("got %v, want [add-a-cli-command add-a-tui-command]", got)
	}
}

func TestReinforceFromSession(t *testing.T) {
	repo := t.TempDir()
	seed := &skills.Skill{Name: "add-a-cli-command", Description: "d", Origin: skills.OriginGenerated, Body: "x"}
	if err := seed.Save(repo); err != nil {
		t.Fatal(err)
	}
	conv := []llm.Message{
		assistantTool(tc("read_knowledge", `{"doc":"skills/add-a-cli-command"}`)),
		toolRes("read_knowledge", "body"),
	}
	if got := ReinforceFromSession(repo, conv, "sess-1", true); len(got) != 1 || got[0] != "add-a-cli-command" {
		t.Fatalf("expected one reinforcement, got %v", got)
	}
	s, _ := skills.Load(repo, "add-a-cli-command")
	if s.UseCount != 1 {
		t.Errorf("UseCount = %d, want 1", s.UseCount)
	}
	if len(s.Sessions) != 1 || s.Sessions[0] != "sess-1" {
		t.Errorf("Sessions = %v, want [sess-1]", s.Sessions)
	}
	// A session that ended with an error does not reinforce.
	if got := ReinforceFromSession(repo, conv, "sess-2", false); len(got) != 0 {
		t.Errorf("unclean session should not reinforce, got %v", got)
	}
	s2, _ := skills.Load(repo, "add-a-cli-command")
	if s2.UseCount != 1 {
		t.Errorf("UseCount should still be 1 after an unclean session, got %d", s2.UseCount)
	}
}

func TestReinforceFromSessionDedupsSessionID(t *testing.T) {
	repo := t.TempDir()
	if err := (&skills.Skill{Name: "s", Description: "d", Origin: skills.OriginGenerated, Body: "x"}).Save(repo); err != nil {
		t.Fatal(err)
	}
	conv := []llm.Message{
		assistantTool(tc("read_knowledge", `{"doc":"skills/s"}`)),
		toolRes("read_knowledge", "body"),
	}
	ReinforceFromSession(repo, conv, "same-sess", true)
	ReinforceFromSession(repo, conv, "same-sess", true)
	s, _ := skills.Load(repo, "s")
	if len(s.Sessions) != 1 {
		t.Errorf("Sessions should dedup, got %v", s.Sessions)
	}
	if s.UseCount != 2 {
		t.Errorf("UseCount should count each clean use, got %d", s.UseCount)
	}
}

func TestPruneStaleFlagsNeverOpened(t *testing.T) {
	repo := t.TempDir()
	if err := (&skills.Skill{Name: "unused", Description: "d", Origin: skills.OriginGenerated, Body: "x"}).Save(repo); err != nil {
		t.Fatal(err)
	}
	if err := (&skills.Skill{Name: "used", Description: "d", Origin: skills.OriginGenerated, Body: "x", UseCount: 3}).Save(repo); err != nil {
		t.Fatal(err)
	}
	cands, err := PruneStale(repo, 30)
	if err != nil {
		t.Fatal(err)
	}
	if len(cands) != 1 || cands[0].Name != "unused" {
		t.Errorf("expected only 'unused' flagged, got %+v", cands)
	}
}

func TestPruneStaleSkipsHumanSkills(t *testing.T) {
	repo := t.TempDir()
	// A human skill with no frontmatter is loaded with Origin inferred human.
	if err := (&skills.Skill{Name: "handwritten", Description: "d", Origin: skills.OriginHuman, Body: "x"}).Save(repo); err != nil {
		t.Fatal(err)
	}
	cands, err := PruneStale(repo, 30)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range cands {
		if c.Name == "handwritten" {
			t.Errorf("human skills must never be prune candidates: %+v", c)
		}
	}
}
