/**
 * The engine's own version.
 *
 * Held here rather than read from package.json at runtime: an extension's
 * `minKaiokenVersion` is checked against it, and a version that depends on
 * where the process was started from is not a version anything can rely on.
 */
export const VERSION = "2.0.0";
