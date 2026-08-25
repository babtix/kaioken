---
name: add-a-cli-command
description: Add a new command to the kaioken CLI. Load this skill when extending the command-line interface with new functionality.
sources:
    - cmd/kaioken/main.go
generated_at: 2026-07-26T04:10:54.5280033Z
model: nvidia/nemotron-3-super-120b-a12b
---

# Add a CLI Command

Add a new command function in `cmd/kaioken/main.go` and register it in the flag parsing and main function. Use this when extending the kaioken CLI with new functionality.

## Steps

1. Add the command to the usage string in `cmd/kaioken/main.go`.
   - In the `const usage` block, insert a new line under the "Commands:" section.
   - Follow the existing format: two spaces, command name (left-aligned in ~12 characters), description.
   - Example: `  example     Brief description of the new command`

2. Define the command function.
   - Insert a new function after the existing command functions (e.g., after `cmdDaemon`).
   - Use the pattern from context-requiring commands like `cmdPlan`:
     ```go
     func cmdExample(ctx context.Context, f flags) error {
         cfg, err := config.Load(f.repo)
         if err != nil {
             return err
         }
         client, err := newClient(cfg, f)
         if err != nil {
             return err
         }
         // TODO: implement command logic
         return nil
     }
     ```
   - For simple commands that don't need context or LLM client (like `cmdInit`), omit `ctx` and `newClient`:
     ```go
     func cmdExample(f flags) error {
         // TODO: implement command logic
         return nil
     }
     ```

3. Register the command in `main()`.
   - In the `switch cmd` block inside `main()`, add a new case:
     ```go
     case "example":
         err = cmdExample(ctx, args) // or cmdExample(args) for simple commands
     ```

## Conventions to follow

- Command functions must return `error` as the last return value.
- Use `config.Load(f.repo)` to load repository-specific configuration.
- For LLM-dependent commands, call `newClient(cfg, f)` to get a configured LLM client.
- Handle errors by returning them; the main function prints errors and exits with status 1.
- Keep command names lowercase and single-word (e.g., `example`, not `example-command`).
- Update the usage string to reflect the new command's purpose and any flags it uses.
- Place the command function in the file after other command helpers but before utility functions like `splitComma`.

## Verification

Run the command to ensure it's recognized and executes without syntax errors:
```sh
go run cmd/kaioken/main.go example
```
Check that it appears in the help output:
```sh
go run cmd/kaioken/main.go help | grep example
```
Confirm the command doesn't panic and returns a clean exit code (0 for success, non-zero for expected errors).

## Common mistakes

- Forgetting to add the command to the `usage` string, making it invisible in `help`.
- Omitting the case in the `switch` block in `main()`, causing the command to be unrecognized.
- Using an incorrect function signature (e.g., missing `context.Context` for commands that need cancellation).
- Not propagating errors from `config.Load` or `newClient`, leading to silent failures.
- Adding the command function in the wrong location (e.g., inside another function or after utility functions).