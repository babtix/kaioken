import type { SessionRepo } from "../types.js";

/** A fresh backend instance owned by one conformance case. */
export interface SessionBackendFixture {
	readonly repository: SessionRepo;
	dispose?(): Promise<void>;
}

/** Creates an isolated fixture for one conformance case. */
export type SessionBackendFixtureFactory = () => Promise<SessionBackendFixture>;

/** A runner-independent conformance case that can be registered with any test framework. */
export interface SessionBackendConformanceCase {
	readonly group: string;
	readonly name: string;
	run(): Promise<void>;
}
