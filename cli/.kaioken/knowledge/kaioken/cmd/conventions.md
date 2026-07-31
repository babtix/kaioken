Subcommands must be added as cases in main's switch statement and implemented as functions prefixed with 'cmd' (e.g., cmdImpact).
The flags struct (defined in main.go) must be used to hold parsed flags and positionals; subcommands receive it as an argument.
All subcommand functions must return an error; main checks this error, prints it, and exits with status 1 if non-zero.
bookSpend must be called before error checking in main to record LLM usage for failed runs.
For the ext subcommand, the first positional is the subcommand (e.g., 'install') and the second is its argument (if any).
The mcp subcommand expects its first positional to be 'serve', 'manifest', or 'validate', with additional flags parsed by parseMCPFlags.
The review subcommand parses flags like -format, -severity, -only, and -fail-on-findings from the positionals slice.
The usage subcommand treats the first positional as 'refresh', 'prune', or a day count (e.g., '7d').
The run subcommand expects the prompt either via the -p flag or as the first positional argument.
The rpc subcommand takes no positionals and serves the agent over JSON-RPC on stdio.
The impact subcommand expects the intent as positional arguments, but also accepts -format or --format followed by a format string (e.g., json, markdown) to specify the output format. The intent is formed by joining all non-flag positionals. If the intent is empty, it returns an error. The -out flag (from the common flags) can be used to specify the output file path.
