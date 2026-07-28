Command functions must be named cmd<CommandName> (e.g., cmdInit, cmdScan).
Use the flags struct (defined in main.go) to hold parsed command-line arguments and flags.
Implement parseFlags-style argument processing for -key value pairs and boolean flags.
Commands requiring context for cancellation or long-running work must accept context.Context as first parameter; quick operations accept only flags.
All command functions must return an error; main checks for non-nil errors and exits with status 1.
For ext subcommands, use positionals[0] for subcommand and positionals[1] for argument.
Use signal.NotifyContext in main for graceful shutdown on interrupt signals.
Error messages must be printed to stderr with fmt.Fprintln(os.Stderr, "error:", err) before os.Exit(1).
Unknown commands must print usage and exit with status 2 via fmt.Fprintf(os.Stderr, "unknown command %q\n\n%s", cmd, usage).
