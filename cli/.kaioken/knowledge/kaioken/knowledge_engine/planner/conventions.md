When saving a plan, ensure the .kaioken directory exists by calling os.MkdirAll before writing modules.yaml (seen in Save function).
Load returns a specific error if modules.yaml is not found, prompting the user to run `kaioken plan` first (seen in Load function).
Validation warnings (e.g., mismatched scope entries) are printed to stderr via fmt.Fprintln(os.Stderr) but do not halt execution (seen in Validate function).
Scope entries in modules.yaml must be repo-relative paths or directory prefixes; directory prefixes match all files under that path (seen in Validate and FilesFor functions).
Module IDs use snake_case and are path-like for children (e.g., parent/child) but without slashes within a single ID (seen in Flatten function and plannerSystem comment).
The plan file includes a header explaining its purpose and that it is editable before generation (seen in Save function).
