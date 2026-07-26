For any tool that reads files, use the resolve method to confine paths to the repository root and truncate results exceeding maxReadBytes (100_000 bytes) or knowledgeMaxBytes (60_000 bytes) for knowledge reads.
For write_file and edit_file tools, generate a preview (diffPreview for write, hunkPreview for edit), seek user approval via the approve method (unless AutoApprove is set), and on success record an UndoEntry via UI.RecordUndo.
For run_command tool, seek approval for the command string and execute it in the repository root using exec.CommandContext.
The read_knowledge tool must only serve files under the .kaioken directory and reject path escapes by checking that resolved paths start with the repository root.
All tools must be registered in the Tools method of the Agent struct with appropriate llm.Tool definitions.
Error conditions must be returned as strings (often prefixed with 'error:') to allow the model to recover, not as Go errors.
