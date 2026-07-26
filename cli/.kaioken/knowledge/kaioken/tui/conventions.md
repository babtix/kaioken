New slash commands must be added to the commands slice in commands.go with unique name, optional aliases, argument hint, summary, detail, guide, and examples.
Each command must implement the matches method (inherited from command struct) for prefix matching in the palette.
Command guide text must be added to the commandGuides map in explain.go for /explain support.
Commands must be assigned to appropriate chapters in tutorial.go for guided walkthroughs.
New commands must be handled in the dispatch method (in tui.go) to avoid 'unknown command' errors.
The TUI must reset conversation state via resetConversation on session creation and save sessions after each turn via saveSession.
During long-running operations, set busy state (showing spinner and elapsed time) and listen for cancellation signals.
Assistant replies are rendered as markdown only after full response receipt to avoid continuous reflow during streaming.
The /key command uses a separate masked input field (keyInput) to prevent API key leakage.
The palette closes when a space is typed (indicating argument entry) or when user presses Esc.
Every command must have non-empty summary and guide text (enforced by tests).
Command examples must be literal invocations starting with '/' and have non-empty explanations.
