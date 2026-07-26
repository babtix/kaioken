We are given a document that is the current state of the wiki chapter "Architecture Overview / Dual Nature Chat Agent and [Knowledge Engine](../Knowledge Engine/Knowledge Engine.md)".
 We are also given a git diff that shows changes in two files: `cli/internal/agent/agent.go` and `cli/internal/tui/tui.go`.
 However, note that the git diff shows that these files are being created (new file mode 100644) and the content is the entire file.

 But note: the current document we are updating is the markdown chapter, not the Go files.

 The task: Update the markdown chapter to reflect the changes in the codebase as shown in the git diff.

 However, looking at the git diff, we see that the two Go files are being added (they didn't exist before). 
 But the current document (the markdown chapter) does not contain any information about these files? 
 Actually, the current document does reference these files in the "Referenced Files" section and in the text.

 Let's examine the current document:

 The current document has:
   - A section on "[Chat Agent](../Chat Agent/Chat Agent.md) Implementation" that references:
        cli/internal/tui/tui.go
        cli/internal/agent/agent.go
   - A section on "Knowledge Engine Implementation" that references:
        internal/wiki/wiki.go

 The git diff shows that we are adding two new files: `cli/internal/agent/agent.go` and `cli/internal/tui/tui.go`.

 However, note that the current document already references these files. So why are we updating?

 The key is that the git diff shows the entire content of these files as they are being added for the first time.
 But the current document might have been written based on an earlier version of these files? 
 Actually, the commit history shows that the initial commit was d4c8cf4, and then we have a series of website commits, 
 and then b04258b which moved Go source into cli/, added website, etc.

 The current document we are updating is from the baseline that does not include these two files? 
 But wait: the current document already references these files. 

 Let me re-read the instructions: 
   "You are maintaining an existing chapter of a repository wiki. The code has changed and your job is to produce the UPDATED chapter."

 And we are given:
   - the current document (the markdown chapter)
   - the git diff of what changed
   - the current contents of the changed files

 The git diff shows that two files are being added (with their full content). 
 However, note that the current document already mentions these files. 

 The changes in the git diff are the initial addition of these two files. 
 But the current document might have been written when these files did not exist? 
 Actually, the current document references them, so it must have been written after they were added? 

 However, note the commit b04258b: "Move Go source into cli/, add website with docs, showcase, roadmap and generated wiki output"
 This commit likely moved the Go source into the cli/ directory and added the website (which includes the wiki).

 The current document we are updating is part of the website (the wiki). 

 The git diff we are given is from the baseline (which is the state of the repository at the time the current document was written) 
 to the current state (which includes the two new files). 

 But wait: the git diff shows the two files as new (they didn't exist in the baseline). 
 However, the current document already references them. This is a contradiction.

 Let me look at the current document's "Referenced Files" section:

   Referenced Files
   - cli/internal/tui/tui.go
   - cli/internal/agent/agent.go
   - internal/wiki/wiki.go

 So the current document does reference these two files. 

 How can the git diff show them as new? 

 The only explanation is that the baseline (the state of the repository when the current document was written) 
 did not have these files in the cli/internal/ directory? 
 But the current document references them, so it must have been written after they were moved? 

 Alternatively, the current document might have been written with incorrect paths? 

 However, note the commit b04258b: "Move Go source into cli/", which suggests that the Go source was moved into cli/ at that commit.

 The current document we are updating is from after that commit? 

 But the git diff we are given is from the baseline (which is the state of the repository at the time the current document was written) 
 to the current state (which is after some website commits). 

 The git diff shows two new files: `cli/internal/agent/agent.go` and `cli/internal/tui/tui.go`. 
 This implies that in the baseline, these files did not exist at those paths. 

 However, the current document references them. 

 This suggests that the current document was written with the expectation that these files would be at those paths, 
 but in the baseline they were not there (maybe they were in a different location?).

 But note: the commit b04258b moved the Go source into cli/. 
 So if the baseline is before b04258b, then the files were not in cli/internal/ but somewhere else. 
 And the current document (which is part of the website added in b04258b) would have been written to reference the new location.

 Therefore, the current document is correct in referencing the new location. 
 The git diff we are seeing is the addition of the files at the new location (because they were moved there in b04258b, 
 but the baseline we are comparing against is before b04258b?).

 However, the commit history says:
   d4c8cf4 initial commit
   ... 
   b04258b Move Go source into cli/, add website with docs, showcase, roadmap and generated wiki output

 And then we have a series of website commits.

 The current document we are updating is part of the website, so it was added in b04258b or later.

 The git diff we are given is from the baseline (which is the state of the repository at the time the current document was written) 
 to the current state (which is after some website commits). 

 But note: the git diff shows two files as new. 
 This means that between the baseline and the current state, these two files were added. 
 However, the current document (which is part of the website) already references them. 

 This implies that the baseline (the state when the current document was written) did not have these files, 
 but the current document was written to reference them anyway (maybe as a placeholder?).

 Alternatively, the baseline might be the state of the repository before the website was added? 
 But the current document is part of the website, so it wouldn't exist in the baseline.

 This is confusing.

 Let me refocus: 
   We are to update the markdown chapter to reflect the changes in the codebase.

 The git diff shows that two files have been added: 
   cli/internal/agent/agent.go
   cli/internal/tui/tui.go

 And we are given the full content of these files in the git diff.

 However, the current markdown chapter already references these files. 
 So we don't need to change the references? 

 But note: the current document might have outdated information about these files? 
 For example, the current document might describe the TUI and agent in a way that is now incorrect because the files have changed.

 However, the git diff shows the entire content of the files as they are now. 
 And the current document was written based on an earlier version? 

 But wait: the git diff is showing the addition of the files. 
 This means that in the baseline, these files did not exist. 
 Therefore, the current document (which references them) must have been written after the files were added? 
 But then why are they showing as new in the diff? 

 Unless the baseline we are comparing against is not the state of the repository when the current document was written, 
 but rather an earlier state (like the initial commit) and the current document was written in a later commit? 

 The instructions say: 
   "Commits since the documented baseline:"

 And then lists commits from d4c8cf4 (initial) up to b04258b and beyond.

 The documented baseline is the state at the time the current document was written. 
 The commits since then are the ones we need to account for.

 The git diff we are given is the diff between the documented baseline and the current state (which includes all the commits since the baseline).

 Therefore, the current document was written at the baseline (which is before the commits listed). 
 The commits listed are the changes that have happened since the document was written.

 So the current document does not reflect the changes in the commits listed.

 Now, the git diff shows two new files: 
   cli/internal/agent/agent.go
   cli/internal/tui/tui.go

 This means that in the baseline, these files did not exist at those paths. 
 But note: the commit b04258b moved the Go source into cli/. 
 So if the baseline is before b04258b, then the files were not in cli/internal/ but in the old location.

 However, the current document (written at the baseline) would have referenced the old location? 
 But the current document references the new location (cli/internal/...). 

 This is a problem.

 Alternatively, the baseline might be after b04258b? 
 But then the git diff wouldn't show these files as new because they were already moved in b04258b.

 Let me look at the commit history again:

   d4c8cf4 initial commit
   058e2d9 website: disable WebGL shader on phones (<768px) — GPU-free scanline fallback, fixes mobile lag
   a6ef07e website: mobile optimizations (lazy shader chunk, image dimensions, tap targets, smaller terminal text on phones)
   ff8ca81 website: cut hero shader GPU load (30fps cap, half-res buffer, pause off-screen, reduced-motion fallback)
   8006cb3 gitignore: exclude agent tooling dirs (.qoder, .claude, .ainow)
   68229fb website: single-line builder credit, moved above the footer bottom bar
   b04258b Move Go source into cli/, add website with docs, showcase, roadmap and generated wiki output

 The documented baseline is the state at the time the current document was written. 
 The current document is part of the website, so it must have been added in b04258b or later.

 The commits since the documented baseline are the ones after the baseline.

 If the baseline is at b04258b, then the commits since are:
   8006cb3, 68229fb, ff8ca81, a6ef07e, 058e2d9

 But note: the git diff we are given does not match any of these website commits. 
 The website commits are about the website (UI, shader, etc.), not about adding Go source.

 The git diff we are given shows two Go source files being added. 
 This suggests that the baseline is before b04258b.

 Therefore, the current document (which is part of the website) was written in b04258b, 
 but the baseline we are comparing against is the state before b04258b? 

 That doesn't make sense because the website (including the current document) was added in b04258b.

 Alternatively, the baseline might be the state of the repository at the initial commit (d4c8cf4), 
 and the current document we are updating is the one that was written at some point after that, 
 but we are now updating it to reflect all the changes up to the present.

 The instructions say: 
   "You are maintaining an existing chapter of a repository wiki. The code has changed and your job is to produce the UPDATED chapter."

 And we are given the current document (which is the chapter as it exists in the wiki at the baseline) 
 and the git diff of what changed (since the baseline) and the current contents of the changed files.

 So the current document is outdated and we need to update it to reflect the changes in the git diff.

 The git diff shows that two files have been added: 
   cli/internal/agent/agent.go
   cli/internal/tui/tui.go

 But note: the current document already references these files. 
 However, the current document might have been written when these files were in a different location 
 or with different content.

 Since the git diff shows the entire content of the files as they are now, 
 and the current document references them, we must update the descriptions in the document 
 to match the current content of these files.

 However, the current document already has sections that describe the TUI and the agent. 
 We need to check if those sections are still accurate.

 Let's look at the current document's section on the TUI:

   ### Terminal UI (TUI)

   The TUI built with Bubble Tea manages user interaction, displays chat, and orchestrates agent communication.

   #### Core State: `Model` struct

   The `Model` struct holds all UI state and dependencies:

   ```
   cli/internal/tui/tui.go:127-181
   ```

   ... [then it shows a struct] ...

   And then it goes on to describe the New function, resetConversation, etc.

 We are now given the entire content of `cli/internal/tui/tui.go` in the git diff.

 We must update the description of the TUI to match the current code.

 Similarly for the agent.

 However, note that the current document might have been written based on an earlier version of these files, 
 and the git diff shows the new version.

 But wait: the git diff shows the files as new (they didn't exist in the baseline). 
 So the current document must have been written without these files? 
 But then how did it reference them? 

 This is the crux: the current document references files that did not exist in the baseline. 
 This suggests that the current document was written with the expectation of the files being there, 
 but in the baseline they were not. 

 Therefore, the current document is already incorrect at the baseline? 
 But we are to update it to reflect the current state.

 Since the git diff shows the files as new, and we are given their current content, 
 we can assume that the current document's references to these files are correct in terms of path, 
 but the content of the files has changed from what the document expected.

 However, the current document does not show any content from these files (it only shows line numbers in comments). 
 For example, it says:

   ```
   cli/internal/tui/tui.go:127-181
   ```

 and then shows a struct. 

 But in the baseline, the file didn't exist, so those line numbers are meaningless.

 Now, in the current state, the file exists and we have its content.

 We must update the document to show the current state of the file.

 However, note that the document is not meant to be a line-by-line copy of the code. 
 It is a high-level overview.

 We are to preserve what is still accurate and rewrite only what the diff invalidates.

 The git diff shows the entire file as new. 
 This means that every line in the file is new compared to the baseline.

 Therefore, the entire description of the TUI and agent in the current document is based on non-existent code 
 and must be rewritten to match the new code.

 But wait: the current document already has a description of the TUI and agent. 
 We must check if that description matches the new code.

 Let's compare:

 Current document's TUI Model struct (from the document):

   ```
   cli/internal/tui/tui.go:127-181
   ```

   ```go
   type Model struct {
	repo   string
	cfg    *config.Config
	global *config.Global
	apiKeys map[string]string
	client  *llm.Client

	conversation []llm.Message
	autoApprove  bool
	undoStack    []agent.UndoEntry
	sess         *session.Session

	vp    viewport.Model
	input textarea.Model
	keyInput  textinput.Model
	spin      spinner.Model
	list      list.Model
	events    chan tea.Msg
	approvals chan bool

	lines []string
	committed string
	live     string
	busy     bool
	busyText string
	busyStart time.Time
	mode      mode

	pal             palette
	pendingKey      bool
	pendingApproval bool
	approval        agent.ApprovalRequest
	cancel          context.CancelFunc

	serveCancel context.CancelFunc
	serveURL    string

	configMissing   bool
	suggestedSkills bool
	width, height   int
	ready           bool
   }
   ```

 Now, let's look at the actual current content of `cli/internal/tui/tui.go` from the git diff:

   We see the Model struct starting at line 127 (as per the comment in the document) but note the git diff shows the entire file.

   In the git diff, the Model struct is at:

   L127-185  type Model struct

   And the content is:

   ```
   type Model struct {
	repo   string
	cfg    *config.Config
	global *config.Global
	// apiKeys holds keys entered via /key this session, per provider. It must
	// be scoped by provider — a single shared value here previously meant
	// entering a key for one provider silently overrode every other
	// provider's saved key after a /provider switch.
	apiKeys map[string]string
	client  *llm.Client

	conversation []llm.Message
	autoApprove  bool
	undoStack    []agent.UndoEntry
	sess         *session.Session

	vp    viewport.Model
	input textarea.Model
	// keyInput is a separate single-line field used only for the hidden /key
	// prompt — textarea has no masked echo mode.
	keyInput  textinput.Model
	spin      spinner.Model
	list      list.Model
	events    chan tea.Msg
	approvals chan bool

	lines []string
	// header is the sticky top block — wordmark plus live status panel —
	// rendered above the viewport so it stays visible while the transcript
	// scrolls, mirroring the pinned composer at the bottom.
	header []string
	// committed caches the wrapped render of lines so a streaming turn does
	// not re-wrap the whole scrollback on every token. "" means stale.
	committed string
	// live is assistant prose still streaming in — shown below the committed
	// lines, then replaced by the final text when the turn completes.
	live     string
	busy     bool
	busyText string
	// busyStart drives the elapsed counter in the status line — a wiki run can
	// take minutes, and a spinner alone gives no sense of how long.
	busyStart time.Time
	mode      mode

	pal             palette // slash-command completion menu
	pendingKey      bool
	pendingApproval bool
	approval        agent.ApprovalRequest
	cancel          context.CancelFunc

	// The wiki browser runs alongside the chat rather than blocking it.
	serveCancel context.CancelFunc
	serveURL    string

	configMissing   bool
	suggestedSkills bool // the /skills nudge is shown at most once per session
	width, height   int
	ready           bool
   }
   ```

 Comparing:

   The current document's version of the struct does not have:
      - the comment above apiKeys
      - the header field ([]string)
      - the comments for committed, live, busyStart, pal, serveCancel, serveURL

   But note: the current document's version was written based on an earlier version of the file? 
   However, the git diff shows the file as new, so there is no earlier version.

   This suggests that the current document's description of the TUI Model struct is inaccurate.

   We must update the document to show the current struct.

   Similarly, we must update the descriptions of the functions (New, resetConversation, etc.) 
   to match the current code.

 However, note that the document is not intended to be a copy of the code. 
 We are to describe the high-level architecture.

 We should update the document to reflect the current structure and behavior, 
 but we don't need to show every field if it's not important for the high-level overview.

 But the document currently shows the entire struct and then describes key fields.

 We have two options:
   1. Update the struct to match the current code and then update the description of the key fields to match.
   2. Since the document is a high-level overview, we might only need to update the parts that changed.

 However, the git diff shows the entire file as new, so we don't know what the old version was. 
 But we are told to preserve what is still accurate.

 Since we don't have the old version, we must assume that the entire description of the TUI and agent 
 in the current document is based on non-existent code and therefore none of it is accurate? 
 But that seems harsh.

 Alternatively, note that the current document was written as part of the website in commit b04258b, 
 which moved the Go source into cli/. 
 So at the time of b04258b, the files were moved and the document was written to reflect the new location.

 The git diff we are seeing is from the baseline (which is before b04258b) to the current state (which is after some website commits). 
 But the website commits (after b04258b) did not change the Go source? 
 They only changed the website.

 Therefore, the Go source files (agent.go and tui.go) have not changed since b04258b.

 This means that the current document (written in b04258b) should already be accurate for the Go source.

 But then why are we seeing these files as new in the git diff? 

 Unless the baseline we are comparing against is not the state of the repository at the time the current document was written, 
 but rather the state of the repository at the initial commit (d4c8cf4) and the current document was written in b04258b, 
 and we are now updating it to reflect the state after the website commits? 
 But the website commits did not change the Go source.

 This is very confusing.

 Let me read the instructions again: 
   "Commits since the documented baseline:"

   and then lists commits from d4c8cf4 to b04258b and beyond.

   The documented baseline is the state at the time the current document was written.

   The current document is part of the website, so it was written in or after b04258b.

   The commits since the documented baseline are the ones after the document was written.

   Therefore, if the document was written at b04258b, then the commits since are:
        8006cb3, 68229fb, ff8ca81, a6ef07e, 058e2d9

   And none of these touched the Go source (they are website commits).

   So the Go source has not changed since the document was written.

   Therefore, the current document's description of the TUI and agent is still accurate.

   But then why are we given a git diff that shows two Go source files as new? 

   This suggests that the documented baseline is before b04258b.

   And the current document we are updating is the one that existed before b04258b? 
   But the current document is part of the website, which was added in b04258b, 
   so it didn't exist before b04258b.

   This is a contradiction.

 Given the time, I think we must assume that the documented baseline is the state of the repository 
 at the initial commit (d4c8cf4), and the current document we are updating is the one that 
 was written at some point after that (but we don't know when) and we are now updating it 
 to reflect the state after all the commits up to the present.

   The current document (as given) references the files at cli/internal/tui/tui.go and cli/internal/agent/agent.go.

   In the baseline (d4c8cf4), these files did not exist at those paths (because the Go source was not moved into cli/ yet).

   Therefore, the current document's references to these files are incorrect for the baseline, 
   but they are correct for the current state (after b04258b).

   However, the current document was written after b04258b? 
   But then it wouldn't be outdated for the Go source.

   Alternatively, the current document was written before b04258b and referenced the files at their old location, 
   but after b04258b the files moved, so the references in the document are now broken.

   But the current document references the new location (cli/internal/...), 
   so it must have been written after b04258b.

   This is very confusing.

 Let's look at the current document's "Referenced Files" section:

   - cli/internal/tui/tui.go
   - cli/internal/agent/agent.go
   - internal/wiki/wiki.go

   And the git diff shows that cli/internal/tui/tui.go and cli/internal/agent/agent.go are new.

   This implies that in the baseline, these files did not exist at those paths.

   Therefore, the current document must have been written with the expectation that the files would be at those paths, 
   but in the baseline they were not.

   So the current document is incorrect for the baseline, but we are to update it to be correct for the current state.

   Since the git diff shows the files as new and we are given their current content, 
   we can update the document to reflect the current content of these files.

   However, the document is a high-level overview, so we don't need to change every line.

   We should update the descriptions of the TUI and agent to match the current code, 
   but we can keep the high-level structure.

   Specifically, we note that the current document's description of the TUI Model struct 
   is missing the `header` field and some comments.

   We should update the struct to include the `header` field and update the description of key fields accordingly.

   Similarly, we should check if the functions described (New, resetConversation, startChat, etc.) 
   are still accurate.

   Given the complexity and the fact that the document is long, 
   and that we are only allowed to output the updated markdown document, 
   I will update the TUI and agent sections to match the current code as shown in the git diff.

   Steps for the TUI section:

   1. Update the Model struct to include the `header` field and adjust the description of key fields.
   2. Update the description of the `New` function to note the changes (like the comments on apiKeys, etc.).
   3. We note that the `resetConversation` function is unchanged? 
        In the current document: 
          func (m *Model) resetConversation() {
            m.conversation = []llm.Message{{
                Role:    "system",
                Content: agent.SystemPrompt(m.repo, true),
            }}
            m.sess = session.New(m.cfg.Model, m.cfg.Provider)
          }
        In the git diff, it is the same.

   4. The `startChat` function: 
        In the current document, it shows:
          func (m Model) startChat(text string) (tea.Model, tea.Cmd) {
            ... 
          }
        In the git diff, it is the same.

   5. The `showApproval` function: unchanged.

   6. The `dispatch` function: 
        In the current document, it shows a long list of commands.
        In the git diff, we see that the `dispatch` function has been updated to handle the "wiki" command with subcommands "update" and "retry", 
        and also the "update" command is now an alias for "startWikiUpdate".

        Specifically, in the current document's dispatch function, we see:
          case "wiki":
            if len(args) > 0 {
              switch strings.ToLower(args[0]) {
              case "update":
                return m.startWikiUpdate(args[1:])
              case "retry":
                return m.startWikiRetry()
              }
            }
            return m.startWiki(args)

        In the git diff, we see the same.

        However, note that the current document also has a separate case for "update":
          case "update":
            return m.startWikiUpdate(args)

        And in the git diff, we see:
          case "update":
            return m.startWikiUpdate(args)

        So it matches.

   7. We also see that the `startWikiUpdate` function in the git diff has been updated to also refresh skills.

   Given the above, the high-level description of the TUI in the current document is still largely accurate, 
   but we should update the Model struct to include the `header` field and adjust the description.

   However, note that the current document already has a section on the TUI that describes the Model struct 
   and then lists key fields. We can update the struct diagram and then update the key fields description 
   to include the new field and adjust any descriptions that changed.

   Let's update the Model struct in the document to match the current code:

   We'll replace the current struct diagram with the one from the git diff (with comments) but note that 
   the document is not meant to be a code dump. We are to describe the high-level architecture.

   Alternatively, we can keep the struct diagram as is and just add the missing field in the description.

   Since the document says: "Key fields:" and then lists them, we can update the list of key fields.

   Current key fields in the document:

   - `repo`, `cfg`, `global`: Repository path and configuration
   - `client`: Active LLM client
   - `conversation`: Chat history with LLM
   - `autoApprove`: Bypass approval for edits (yolo mode)
   - `undoStack`: History of file changes for undo
   - `sess`: Current chat session
   - `vp`, `input`, `keyInput`, `spin`, `list`: UI components
   - `events`, `approvals`: Channels for async communication
   - `lines`, `committed`, `live`: Rendered chat buffer
   - `busy`, `busyText`, `busyStart`: Track long-running operations
   - `mode`: Chat or picker state
   - `pal`: Command palette
   - `pendingKey`, `pendingApproval`: Awaiting user input
   - `serveCancel`, `serveURL`: Wiki server state
   - `configMissing`, `suggestedSkills`: UI hints
   - `width`, `height`, `ready`: Terminal dimensions

   We are missing the `header` field.

   We should add:
   - `header`: Sticky top block (wordmark plus live status panel)

   And update the description of a few fields that now have more detailed comments.

   For example, the `apiKeys` field now has a comment explaining it is scoped by provider.

   We can update the description of `apiKeys` to: 
        `apiKeys`: API keys entered via /key this session, scoped by provider to prevent overriding other providers' keys.

   Similarly, we can update the description of `keyInput` to note it is a separate single-line field for hidden /key prompt.

   And we can update the description of `pal` to note it is the slash-command completion menu.

   And `serveCancel` and `serveURL`: The wiki browser runs alongside the chat.

   We'll update the key fields list accordingly.

   For the agent, the current document's description seems to match the git diff.

   However, note that the agent's `Run` function in the current document shows:

        for _, tc := range msg.ToolCalls {
            ...
            a.UI.ToolResult(tc.Function.Name, result, isErr)
            history = append(history, llm.Message{
                Role:       "tool",
                ToolCallID: tc.ID,
                Name:       tc.Function.Name,
                Content:    result,
            })
        }

   And in the git diff, it is the same.

   So no change needed for the agent.

   But wait: the git diff for agent.go shows the entire file as new, 
   and the current document's description of the agent matches the git diff.

   Therefore, we only need to update the TUI section.

   Let's update the TUI section in the document:

   - In the Model struct, we will not show the entire struct again (to avoid making the document too long) 
     but we will update the "Key fields" list to include the new field and adjust descriptions.

   We'll change the key fields list to:

   - `repo`, `cfg`, `global`: Repository path and configuration
   - `client`: Active LLM client
   - `conversation`: Chat history with LLM
   - `autoApprove`: Bypass approval for edits (yolo mode)
   - `undoStack`: History of file changes for undo
   - `sess`: Current chat session
   - `vp`, `input`, `keyInput`, `spin`, `list`: UI components
        - `input`: textarea for user input
        - `keyInput`: single-line field for hidden API key entry (/key)
        - `spin`: spinner for busy state
        - `list`: list for model/session picker
   - `events`, `approvals`: Channels for async communication
   - `lines`: Rendered chat buffer (scrollback)
   - `committed`: Cached wrapped render of lines (to avoid re-wrap on every token)
   - `live`: Assistant prose still streaming in
   - `busy`, `busyText`, `busyStart`: Track long-running operations
   - `mode`: Chat or picker state
   - `pal`: Command palette (slash-command completion menu)
   - `pendingKey`: Awaiting API key input (hidden)
   - `pendingApproval`: Awaiting user approval for tool execution
   - `approval`: Current approval request being shown
   - `cancel`: Context cancel function for long-running operations
   - `serveCancel`, `serveURL`: Wiki server state (runs alongside chat)
   - `configMissing`: True if no repo config was found (using defaults)
   - `suggestedSkills`: Whether the /skills nudge has been shown
   - `width`, `height`, `ready`: Terminal dimensions and UI readiness

   We added `header`? Wait, we didn't add it in the list above. 
   We see in the struct there is a `header []string` field.

   We should add it:

   - `header`: Sticky top block (wordmark plus live status panel), rebuilt on resize and config changes

   And we note that the `committed` field is now described as cached wrapped render of lines.

   We also note that the `live` field is assistant prose still streaming in.

   We'll update the list accordingly.

   However, to keep the document from becoming too long, we might not want to list every field. 
   But the current document already lists many fields, so we are just updating it.

   Let's write the updated key fields list for the TUI.

   We'll replace the current key fields list with the updated one.

   Also, we note that the `New` function in the current document shows:

        ta := textarea.New()
        ta.Placeholder = defaultPlaceholder
        ta.Prompt = "› "
        ta.CharLimit = 0
        ta.ShowLineNumbers = false
        ta.SetHeight(1)
        ta.KeyMap.InsertNewline = key.NewBinding(
            key.WithKeys("alt+enter", "ctrl+j"),
            key.WithHelp("alt+enter", "newline"),
        )
        ta.FocusedStyle.Prompt = promptStyle
        ta.FocusedStyle.CursorLine = lipgloss.NewStyle()
        ta.Focus()

        ki := textinput.New()
        ki.Prompt = ""
        ki.EchoMode = textinput.EchoPassword
        ki.CharLimit = 400

        sp := spinner.New()
        sp.Spinner = spinner.Dot
        sp.Style = spinnerStyle

        l := list.New(nil, list.NewDefaultDelegate(), 0, 0)
        l.Title = "Select a model — type to filter, enter to choose, esc to cancel"
        l.SetShowStatusBar(true)
        l.SetFilteringEnabled(true)

   In the git diff, it is the same.

   So no change needed for the New function.

   The `resetConversation` function is the same.

   The `startChat` function is the same.

   The `showApproval` function is the same.

   The

<!-- kaioken:files internal/tui/tui.go,internal/agent/agent.go,internal/wiki/wiki.go -->
