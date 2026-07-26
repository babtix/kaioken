Command handlers must be named cmd<Command> (e.g., cmdInit, cmdScan) and accept either flags or (context.Context, flags) parameters
Use parseFlags() to convert command-line args into the flags struct
Load configuration with config.Load(f.repo) (or config.Default() for models command when config missing)
Create LLM client via newClient(cfg, f)
For repository operations, use scan.Repo(f.repo, cfg)
For module planning, load plan via plan.Load(f.repo)
Handle errors by returning them; main() checks and exits on non-nil error
For long-running operations (wiki, generate, skills), pass context and use progress reporters (cliProgress for wiki, skills.Progress for skills)
The flags.positional field captures a single trailing argument (used by models, wiki, update, skills)
The flags.module field (comma-separated) restricts operations to specific module IDs
The flags.force flag bypasses up-to-date checks in generate, wiki, and skills commands
