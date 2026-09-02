import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import {
	createConversation,
	getConversationForUser,
	listConversationsForUser,
	setConversationPinned,
} from "../src/modules/conversations/conversations.service.js";
import { installFakeIO } from "./fake-io.js";

let minhId: string;

async function makePeer(handle: string): Promise<string> {
	const user = await prisma.user.create({
		data: { email: `${handle}@test.com`, handle, displayName: handle, passwordHash: "x" },
		select: { id: true },
	});

	return user.id;
}

/**
 * Conversations in a known order, oldest first, so `updatedAt` is deterministic
 * rather than whatever a millisecond-resolution clock happened to produce for
 * rows written inside one loop. That collision is the reason the cursor has `id`
 * as a tiebreaker, and test 4 below is about it.
 */
async function makeConversations(count: number): Promise<string[]> {
	const ids: string[] = [];
	for (let index = 0; index < count; index += 1) {
		const peer = await makePeer(`peer${index}`);
		const conversation = await createConversation(minhId, { participantIds: [peer] });
		await prisma.conversation.update({
			where: { id: conversation.id },
			data: { updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)) },
			select: { id: true },
		});
		ids.push(conversation.id);
	}

	// Newest first is the order the sidebar reads in.
	return ids.reverse();
}

beforeEach(async () => {
	installFakeIO();
	minhId = await makePeer("minh");
});

describe("conversation list paging", () => {
	it("returns a bounded page and says there is more", async () => {
		const newestFirst = await makeConversations(5);

		const page = await listConversationsForUser(minhId, { limit: 2 });

		expect(page.items.map((item) => item.id)).toEqual(newestFirst.slice(0, 2));
		expect(page.hasMore).toBe(true);
	});

	it("walks the whole list without repeating or skipping a row", async () => {
		const newestFirst = await makeConversations(7);

		const seen: string[] = [];
		let cursor: string | undefined;
		for (;;) {
			const page = await listConversationsForUser(minhId, { limit: 3, ...(cursor ? { before: cursor } : {}) });
			seen.push(...page.items.map((item) => item.id));
			if (!page.hasMore) break;
			cursor = page.items.at(-1)!.id;
		}

		expect(seen).toEqual(newestFirst);
		expect(new Set(seen).size).toBe(seen.length);
	});

	/**
	 * The reason pinned rows are not paged at all. They are capped at five per
	 * person, so the first page carries the whole block and every later page is
	 * walking the ordinary tail — which turns a cursor over
	 * `(pinnedAt NULLS LAST, updatedAt, id)` into an ordinary two-column keyset.
	 */
	it("puts every pinned conversation on the first page, above the tail", async () => {
		const newestFirst = await makeConversations(6);
		const oldest = newestFirst.at(-1)!;
		await setConversationPinned(minhId, oldest, { pinned: true });

		const page = await listConversationsForUser(minhId, { limit: 2 });

		// Pinned first even though it is the least recently active, and the page
		// still carries its two unpinned rows rather than spending the budget on it.
		expect(page.items[0]!.id).toBe(oldest);
		expect(page.items).toHaveLength(3);
		expect(page.items.slice(1).map((item) => item.id)).toEqual(newestFirst.slice(0, 2));

		// And it is not repeated once paging starts.
		const second = await listConversationsForUser(minhId, { limit: 2, before: page.items.at(-1)!.id });
		expect(second.items.map((item) => item.id)).not.toContain(oldest);
	});

	it("does not lose a row when two conversations share a millisecond", async () => {
		const ids = await makeConversations(4);
		const sameMoment = new Date(Date.UTC(2026, 5, 1, 12, 0, 0));
		await prisma.conversation.updateMany({ where: { id: { in: ids } }, data: { updatedAt: sameMoment } });

		const first = await listConversationsForUser(minhId, { limit: 2 });
		const second = await listConversationsForUser(minhId, { limit: 2, before: first.items.at(-1)!.id });
		const seen = [...first.items, ...second.items].map((item) => item.id);

		// Without `id` breaking the tie this returns the same two rows twice.
		expect(new Set(seen).size).toBe(4);
		expect([...seen].sort()).toEqual([...ids].sort());
	});

	it("refuses a cursor that names nothing", async () => {
		await makeConversations(1);

		await expect(listConversationsForUser(minhId, { before: "not-a-conversation" })).rejects.toThrow(
			"Conversation not found",
		);
	});

	it("fetches one row, for a conversation the client has not paged to yet", async () => {
		const ids = await makeConversations(3);
		const oldest = ids.at(-1)!;

		const row = await getConversationForUser(minhId, oldest);

		expect(row.id).toBe(oldest);
	});

	it("refuses to fetch a row for somebody who is not in it", async () => {
		const ids = await makeConversations(1);
		const stranger = await makePeer("stranger");

		await expect(getConversationForUser(stranger, ids[0]!)).rejects.toThrow();
	});
});
