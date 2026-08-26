import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import {
	addParticipant,
	createConversation,
	listConversationsForUser,
	removeParticipant,
	renameConversation,
} from "../src/modules/conversations/conversations.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

/**
 * Creates a user directly, and deliberately not through `register()`.
 *
 * These tests are about group membership; nothing in them signs in. `register()`
 * hashes with bcrypt at cost 12 — roughly 300ms each — and this file needs three
 * or four users in every one of its twenty-odd tests. That was about half a
 * minute of pure CPU spent on fixtures, and it pushed the slowest tests past
 * Vitest's default 5s `testTimeout`.
 *
 * The failure that causes is worth knowing about, because it does not look like
 * a timeout: Vitest abandons the test but its promise chain keeps running, so
 * the *next* test's `TRUNCATE` in tests/setup.ts wipes the tables mid-flight.
 * The visible symptom was "user does not exist" and "email already registered"
 * errors scattered across files that had nothing to do with this one.
 */
async function createUser(name: string): Promise<string> {
	const user = await prisma.user.create({
		data: {
			email: `${name}@chatty.test`,
			// Suffixed so short names like "an" still clear the 3-character minimum.
			handle: `${name}_test`,
			displayName: name,
			// Deliberately not a valid bcrypt hash: no test here authenticates, and
			// producing a real one is the cost this helper exists to avoid.
			passwordHash: "not-a-real-hash",
		},
		select: { id: true },
	});

	return user.id;
}

/** Finds one conversation in a user's list, so assertions can read its per-viewer fields. */
async function conversationAsSeenBy(userId: string, conversationId: string) {
	const conversations = await listConversationsForUser(userId);
	const conversation = conversations.find((candidate) => candidate.id === conversationId);
	if (!conversation) throw new Error("conversation not in the user's list");

	return conversation;
}

/**
 * `createConversation` only sets `isGroup: true` for more than one other
 * participant, so every fixture here needs at least two — a helper with one
 * "other" id would silently build a direct conversation instead.
 */
async function createGroup(creatorId: string, otherIds: string[], name = "Group") {
	if (otherIds.length < 2) throw new Error("createGroup needs at least two other participants to be a real group");

	return createConversation(creatorId, { participantIds: otherIds, name });
}

describe("addParticipant", () => {
	it("adds a new member to the participant list", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		await addParticipant(minhId, group.id, { userId: chiId });

		const seenByMinh = await conversationAsSeenBy(minhId, group.id);
		expect(seenByMinh.participants.map((participant) => participant.id).sort()).toEqual(
			[minhId, anId, binhId, chiId].sort(),
		);
	});

	it("joins the new member's live sockets to the conversation room", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.joins.length = 0;
		await addParticipant(minhId, group.id, { userId: chiId });

		expect(fakeIO.joins).toContainEqual({ fromRoom: `user:${chiId}`, joinedRoom: group.id });
	});

	it("sends conversation:new to the new member, fixing the gap where it only fired on creation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.emits.length = 0;
		await addParticipant(minhId, group.id, { userId: chiId });

		const newMemberEmit = fakeIO.emits.find(
			(emit) => emit.room === `user:${chiId}` && emit.event === "conversation:new",
		);
		expect(newMemberEmit).toBeDefined();
		expect((newMemberEmit?.payload as { id: string }).id).toBe(group.id);
	});

	it("broadcasts conversation:updated to the room, without any per-viewer field", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.emits.length = 0;
		await addParticipant(minhId, group.id, { userId: chiId });

		const updatedEmit = fakeIO.emits.find(
			(emit) => emit.room === group.id && emit.event === "conversation:updated",
		);
		expect(updatedEmit).toBeDefined();
		const payload = updatedEmit?.payload as Record<string, unknown>;
		// A payload where one recipient's unread count could leak into everyone
		// else's view must never be broadcast to a whole room — see the type's
		// own doc comment in shared-types for why.
		expect(payload).not.toHaveProperty("unreadCount");
		expect(payload).not.toHaveProperty("lastMessage");
		expect((payload.participants as { id: string }[]).map((participant) => participant.id)).toContain(chiId);
	});

	it("rejects adding to a direct conversation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		await expect(addParticipant(minhId, direct.id, { userId: binhId })).rejects.toBeInstanceOf(ValidationError);
	});

	it("rejects a user id that does not exist", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(addParticipant(minhId, group.id, { userId: "cm0000000000000000000000" })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it("rejects someone who is already a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(addParticipant(minhId, group.id, { userId: anId })).rejects.toBeInstanceOf(ConflictError);
	});

	it("rejects an actor who is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const outsiderId = await createUser("duc");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(addParticipant(outsiderId, group.id, { userId: chiId })).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe("removeParticipant", () => {
	it("removes another member from the participant list (a kick)", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await removeParticipant(minhId, group.id, binhId);

		const seenByMinh = await conversationAsSeenBy(minhId, group.id);
		expect(seenByMinh.participants.map((participant) => participant.id)).not.toContain(binhId);
	});

	it("lets a participant remove themselves (leaving)", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await removeParticipant(binhId, group.id, binhId);

		const seenByMinh = await conversationAsSeenBy(minhId, group.id);
		expect(seenByMinh.participants.map((participant) => participant.id)).not.toContain(binhId);
	});

	it("evicts the removed member's sockets from the conversation room", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.leaves.length = 0;
		await removeParticipant(minhId, group.id, binhId);

		expect(fakeIO.leaves).toContainEqual({ fromRoom: `user:${binhId}`, leftRoom: group.id });
	});

	it("sends conversation:left to the removed member's personal room", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.emits.length = 0;
		await removeParticipant(minhId, group.id, binhId);

		expect(fakeIO.emits).toContainEqual({
			room: `user:${binhId}`,
			event: "conversation:left",
			payload: { conversationId: group.id },
		});
	});

	it("broadcasts conversation:updated with the reduced participant list", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.emits.length = 0;
		await removeParticipant(minhId, group.id, binhId);

		const updatedEmit = fakeIO.emits.find(
			(emit) => emit.room === group.id && emit.event === "conversation:updated",
		);
		const payload = updatedEmit?.payload as { participants: { id: string }[] };
		expect(payload.participants.map((participant) => participant.id)).not.toContain(binhId);
	});

	it("rejects removing from a direct conversation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		await expect(removeParticipant(minhId, direct.id, anId)).rejects.toBeInstanceOf(ValidationError);
	});

	it("rejects removing someone who is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const outsiderId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(removeParticipant(minhId, group.id, outsiderId)).rejects.toBeInstanceOf(NotFoundError);
	});

	it("rejects an actor who is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const outsiderId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(removeParticipant(outsiderId, group.id, binhId)).rejects.toBeInstanceOf(NotFoundError);
	});

	it("allows a group to end up with zero participants", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		// `isGroup` was set once at creation and is never recomputed from a
		// headcount (see the schema comment on `Conversation.isGroup`), so it
		// stays true all the way down to zero members — nothing here should throw.
		await removeParticipant(minhId, group.id, anId);
		await removeParticipant(minhId, group.id, binhId);
		await expect(removeParticipant(minhId, group.id, minhId)).resolves.toBeUndefined();
	});
});

describe("renameConversation", () => {
	it("renames the group and returns it in the actor's own view", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId], "Old name");

		const renamed = await renameConversation(minhId, group.id, { name: "New name" });

		expect(renamed.name).toBe("New name");
	});

	it("broadcasts conversation:updated with the new name", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId], "Old name");

		fakeIO.emits.length = 0;
		await renameConversation(minhId, group.id, { name: "New name" });

		expect(fakeIO.emits).toContainEqual(
			expect.objectContaining({
				room: group.id,
				event: "conversation:updated",
				payload: expect.objectContaining({ name: "New name" }),
			}),
		);
	});

	it("rejects renaming a direct conversation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		await expect(renameConversation(minhId, direct.id, { name: "Nope" })).rejects.toBeInstanceOf(ValidationError);
	});

	it("rejects an actor who is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const outsiderId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(renameConversation(outsiderId, group.id, { name: "Nope" })).rejects.toBeInstanceOf(NotFoundError);
	});
});
