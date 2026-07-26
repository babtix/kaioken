Session IDs follow format 'YYYYMMDD-HHMMSS-XXXX' where XXXX is a random 4-digit number
Session titles are derived from the first user message (whitespace-collapsed, truncated to 64 characters with ellipsis if exceeded) and set only on the first Record call if empty
Session.Turns() counts only user messages
Empty sessions (no user messages) are not saved to disk
Session.List returns summaries sorted by update time (newest first), skipping corrupt JSON files
State.HashFiles sorts files by path before hashing to ensure determinism
State.Load returns an empty state if the state file is missing
All file operations create necessary directories with 0o755 permissions
JSON files are written with indentation ('  ') for readability
Exported functions use PascalCase; unexported helpers use camelCase
Package names match directory names (session, state)
