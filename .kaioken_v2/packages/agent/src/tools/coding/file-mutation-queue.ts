import { resolve } from "node:path";
import { posix } from "../path.js";

const fileMutationQueues = new Map<string, Promise<void>>();
let registrationQueue = Promise.resolve();

function getMutationQueueKey(filePath: string): string {
	const normalized = posix(resolve(filePath));
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * Serialize file mutation operations targeting the same file.
 * Operations for different files still run in parallel.
 *
 * Guaranteed not to deadlock:
 * 1. Prior failures (e.g. anchor not found) do not break the chain.
 * 2. try/finally ensures releaseNext() is always called.
 * 3. Empty queues are pruned from the map.
 */
export async function withFileMutationQueue<T>(
	filePath: string,
	fn: () => Promise<T>,
): Promise<T> {
	const registration = registrationQueue.then(async () => {
		const key = getMutationQueueKey(filePath);
		const currentQueue = fileMutationQueues.get(key) ?? Promise.resolve();

		let releaseNext!: () => void;
		const nextQueue = new Promise<void>((resolveQueue) => {
			releaseNext = resolveQueue;
		});

		// Chain so that even if currentQueue rejected, nextQueue will still be awaited
		const chainedQueue = currentQueue.then(
			() => nextQueue,
			() => nextQueue,
		);
		fileMutationQueues.set(key, chainedQueue);

		return { key, currentQueue, chainedQueue, releaseNext };
	});

	registrationQueue = registration.then(
		() => undefined,
		() => undefined,
	);

	const { key, currentQueue, chainedQueue, releaseNext } = await registration;

	// Wait for the prior operation on this file to finish; ignore prior errors
	try {
		await currentQueue;
	} catch {
		// Previous operation failed; do not cancel or deadlock this operation
	}

	try {
		return await fn();
	} finally {
		releaseNext();
		if (fileMutationQueues.get(key) === chainedQueue) {
			fileMutationQueues.delete(key);
		}
	}
}
