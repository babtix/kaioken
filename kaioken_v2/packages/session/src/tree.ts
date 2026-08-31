import type { SessionMeta } from "./storage.js";

/**
 * The shape of a conversation that has been rewound.
 *
 * `/fork` and `/compact` do not end one session and begin an unrelated one:
 * they take the work in a different direction from a point that still exists on
 * disk. A flat, newest-first list hides that — three forks off the same turn
 * look like three unrelated conversations. The tree keeps the relationship, so
 * the question "which of these was I on before I rewound?" has an answer.
 */

export interface BranchNode {
	session: SessionMeta;
	/** Depth from a root, for indentation. */
	depth: number;
	children: BranchNode[];
	/** No branch was taken from this one: it is a live end of the tree. */
	tip: boolean;
}

/**
 * Arrange sessions into their branch tree, newest root first.
 *
 * A session whose parent is missing — deleted, or from another repository —
 * becomes a root rather than disappearing. Losing a conversation because its
 * ancestor was cleaned up would be the worst possible reading of a broken link.
 */
export function buildBranchTree(sessions: readonly SessionMeta[]): BranchNode[] {
	const nodes = new Map<string, BranchNode>();
	for (const session of sessions) {
		nodes.set(session.id, { session, depth: 0, children: [], tip: true });
	}

	const roots: BranchNode[] = [];
	for (const node of nodes.values()) {
		const parentId = node.session.parent?.id;
		const parent = parentId ? nodes.get(parentId) : undefined;
		// A cycle cannot arise through the normal path — a new session always
		// points at one that already existed — but a hand-edited or restored
		// file can make one, and a cycle in the edges is an infinite walk
		// later rather than an error message here. The link is checked before
		// it is made, so no cycle ever enters the tree.
		if (!parent || parent === node || descendsFrom(nodes, parent, node.session.id)) {
			roots.push(node);
			continue;
		}
		parent.children.push(node);
		parent.tip = false;
	}

	const assign = (node: BranchNode, depth: number): void => {
		node.depth = depth;
		node.children.sort(byNewest);
		for (const child of node.children) assign(child, depth + 1);
	};
	roots.sort(byNewest);
	for (const root of roots) assign(root, 0);
	return roots;
}

/** Does `node` already sit under the session `ancestorId`? */
function descendsFrom(
	nodes: ReadonlyMap<string, BranchNode>,
	node: BranchNode,
	ancestorId: string,
): boolean {
	const seen = new Set<string>();
	let current: BranchNode | undefined = node;
	while (current) {
		if (current.session.id === ancestorId) return true;
		if (seen.has(current.session.id)) return true;
		seen.add(current.session.id);
		const parentId: string | undefined = current.session.parent?.id;
		current = parentId ? nodes.get(parentId) : undefined;
	}
	return false;
}

/** The tree flattened depth-first, which is the order it is displayed in. */
export function flattenBranches(roots: readonly BranchNode[]): BranchNode[] {
	const out: BranchNode[] = [];
	const walk = (node: BranchNode): void => {
		out.push(node);
		for (const child of node.children) walk(child);
	};
	for (const root of roots) walk(root);
	return out;
}

function byNewest(a: BranchNode, b: BranchNode): number {
	const ta = a.session.updated ? new Date(a.session.updated).getTime() : 0;
	const tb = b.session.updated ? new Date(b.session.updated).getTime() : 0;
	if (ta !== tb) return tb - ta;
	return b.session.id.localeCompare(a.session.id);
}
