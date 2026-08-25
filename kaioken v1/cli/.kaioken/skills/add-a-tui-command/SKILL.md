---
name: add-a-tui-command
description: Add a new command to the TUI's command palette. Load this skill when you want to extend the interactive terminal interface with a new slash command.
sources:
    - internal/tui/commands.go
    - internal/tui/palette.go
    - internal/tui/tutorial_test.go
generated_at: 2026-07-26T04:12:17.9005334Z
model: nvidia/nemotron-3-super-120b-a12b
---

# Add a TUI Command

Add a new slash command to the TUI's command palette by implementing its handler in commands.go and updating palette.go to acknowledge the registration.

## Prerequisites
None.

## Steps
1. Open `internal/tui/commands.go`.
2. Locate the `commands` slice (look for `var commands = []command{`).
3. Add a new command struct to the slice, following the pattern of existing commands. For example:
   ```go
   {
       name: "mycommand", args: "[argument]",
       summary: "a brief description of the command",
       detail: "a longer explanation",
       guide: "extended guidance",
       examples: []example{
           {"/mycommand", "what it does"},
           {"/mycommand foo", "what it does with an argument"},
       },
   },
   ```
4. Open `internal/tui/palette.go`.
5. At the top of the file, after the imports, add a comment:
   ```go
   // Note: Commands are registered in internal/tui/commands.go. This file does not require changes for new commands.
   ```

## Conventions to follow
- Follow the existing command structure: name, aliases (if any), args, summary, detail, guide, and examples.
- The `args` field should be a string that hints at the expected arguments (shown beside the command name in the palette).
- The `summary` is a short string shown in the palette.
- The `detail` is a longer string shown in the tutorial when the command is selected.
- The `guide` is an even longer string shown in the `/explain` command.
- Provide at least one example in the `examples` slice.
- Ensure the command name is unique and does not conflict with existing commands or aliases.

## Verification
- Run the test `TestTutorialIsDispatchedAndListed` to ensure the TUI mechanism is still working:
  ```sh
  go test -run TestTutorialIsDispatchedAndListed ./internal/tui
  ```
- Verify that the new command is present in the `commands` slice in `internal/tui/commands.go` by inspecting the file.
- Verify that the comment was added to `internal/tui/palette.go`.

## Common mistakes