/**
 * The shell's view of session storage.
 *
 * The storage itself moved to `@kaioken/session` when the CLI needed to read
 * the same files — `kaioken handoff` and `kaioken learn` distil a saved
 * conversation, and two implementations of one on-disk format is how the two
 * halves of a product start disagreeing about what a session is. This file
 * stays as the shell's import path so nothing else had to move with it.
 */
export * from "@kaioken/session";
