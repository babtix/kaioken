# Initializing a Repository

This chapter explains how to set up kaioken for a new or existing repository using the `kaioken init` command. The command creates a default configuration file (`.kaioken/config.yaml`) that enables subsequent kaioken operations like scanning, planning, and wiki generation.

## Table of Contents
- [What `kaioken init` does](#what-kaioken-init-does)
- [Running the command](#running-the-command)
- [Configuration file](#configuration-file)
- [Flags](#flags)
- [Next steps](#next-steps)
- [Referenced files](#referenced-files)

## What `kaioken init` does

The `init` command prepares a repository for kaioken by creating a configuration file at `.kaioken/config.yaml`. If this file already exists, the command aborts to prevent overwriting an existing configuration, advising the user to edit it directly instead.

The configuration is initialized with default values from `config.Default()`, which includes settings for the LLM provider, model, file excludes, concurrency limits, and other behaviors. If the `-model` flag is provided, it overrides the model in the default configuration.

## Running the command

Execute `kaioken init` from within the target repository (or specify a path with `-repo`). The command requires no arguments but accepts optional flags to customize the initialization.

```sh
# Initialize in the current directory
kaioken init

# Initialize in a specific repository
kaioken init -repo /path/to/repo

# Initialize with a custom model
kaioken init -model anthropic/claude-3-opus-20240229
```

Upon success, the command prints the path to the created configuration file and provides next-step guidance.

## Configuration file

The generated `.kaioken/config.yaml` file contains kaioken's runtime configuration. Key sections include:

- **Provider and model**: Specifies the LLM service (default: openrouter) and model ID.
- **Excludes**: File patterns to ignore during scanning (e.g., build artifacts, dependencies).
- **Concurrency**: Limits for parallel operations during wiki generation and scanning.
- **Token budget**: Maximum tokens per LLM request.
- **API keys**: *Not stored in the file*; must be set via environment variables (e.g., `OPENROUTER_API_KEY`).

The file is intended to be reviewed and adjusted after initialization. For example, users may want to modify exclusions or adjust concurrency based on repository size.

## Flags

The `init` command accepts the following flags (all common flags are accepted, but only `-repo` and `-model` affect its behavior):

| Flag        | Description                                                                 |
|-------------|-----------------------------------------------------------------------------|
| `-repo`     | Path to the target repository (default: current directory)                  |
| `-model`    | Override the model ID from the default configuration                        |
| `-force`    | Accepted but ignored (present for consistency with other commands)          |
| `-module`   | Accepted but ignored                                                        |
| `-base`     | Accepted but ignored                                                        |
| `-port`     | Accepted but ignored                                                        |

Note: Boolean flags like `-force` do not require a value. The command parses all flags but only uses `-repo` and `-model`; others are safely ignored.

## Next steps

After running `kaioken init`:

1. **Set your API key** as an environment variable for the chosen provider (e.g., `export OPENROUTER_API_KEY=your_key_here` for OpenRouter).
2. **Review the configuration** in `.kaioken/config.yaml` and adjust settings as needed (e.g., modify exclusions for large dependencies).
3. **Run `kaioken plan`** to propose a module structure for your repository using the LLM.

Once these steps are complete, you can proceed with scanning (`kaioken scan`), planning (`kaioken plan`), and generating knowledge cards (`kaioken generate`).

## Referenced files
- cli/cmd/kaioken/main.go

<!-- kaioken:files cmd/kaioken/main.go -->
