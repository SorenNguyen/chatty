import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "../src/lib/errors.js";
import { userRoom } from "../src/lib/socket-bus.js";
import { register } from "../src/modules/auth/auth.service.js";
import {
	createConversation,
	listConversationsForUser,
	markConversationRead,
} from "../src/modules/conversations/conversations.service.js";
import { sendMessage } from "../src/modules/messages/messages.service.js";
import { updateProfile } from "../src/modules/users/users.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

/** Creates a user and returns their id, so tests read as intent rather than setup. */
async function createUser(name: string): Promise<string> {
	const { user } = await register({
		email: `${name}@chatty.test`,
		password: "SuperSecret123",
		// Suffixed so short names like "an" still clear the 3-character minimum.
		handle: `${name}_test`,
		displayName: name,
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

describe("unreadCount", () => {
	it("counts messages written by other people", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		await sendMessage(anId, conversation.id, { content: "one" });
		await sendMessage(anId, conversation.id, { content: "two" });

		expect((await conversationAsSeenBy(minhId, conversation.id)).unreadCount).toBe(2);
	});

	it("does not count your own messages as unread", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		await sendMessage(minhId, conversation.id, { content: "mine" });

		expect((await conversationAsSeenBy(minhId, conversation.id)).unreadCount).toBe(0);
	});

	it("is per viewer — the same conversation is unread for one side and not the other", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		await sendMessage(minhId, conversation.id, { content: "hello" });

		expect((await conversationAsSeenBy(anId, conversation.id)).unreadCount).toBe(1);
		expect((await conversationAsSeenBy(minhId, conversation.id)).unreadCount).toBe(0);
	});

	it("only counts messages newer than the read marker", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		const first = await sendMessage(anId, conversation.id, { content: "one" });
		await sendMessage(anId, conversation.id, { content: "two" });
		await markConversationRead(minhId, conversation.id, { messageId: first.id });

		expect((await conversationAsSeenBy(minhId, conversation.id)).unreadCount).toBe(1);
	});

	it("is zero for a conversation that was never written in", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		// The raw count query returns no row at all for an empty conversation, so
		// this is the case where a missing entry must read as zero, not undefined.
		expect((await conversationAsSeenBy(minhId, conversation.id)).unreadCount).toBe(0);
	});
});

describe("markConversationRead", () => {
	it("records the marker on the participant and reports it back", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const message = await sendMessage(anId, conversation.id, { content: "hello" });

		const event = await markConversationRead(minhId, conversation.id, { messageId: message.id });

		expect(event).toEqual({ conversationId: conversation.id, userId: minhId, lastReadMessageId: message.id });

		const seenByAn = await conversationAsSeenBy(anId, conversation.id);
		const minhAsParticipant = seenByAn.participants.find((participant) => participant.id === minhId);
		expect(minhAsParticipant?.lastReadMessageId).toBe(message.id);
	});

	it("broadcasts to the conversation so the author sees it without asking", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const message = await sendMessage(anId, conversation.id, { content: "hello" });

		fakeIO.emits.length = 0;
		await markConversationRead(minhId, conversation.id, { messageId: message.id });

		expect(fakeIO.emits).toContainEqual({
			room: conversation.id,
			event: "conversation:read",
			payload: { conversationId: conversation.id, userId: minhId, lastReadMessageId: message.id },
		});
	});

	it("refuses to move the marker backwards", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const first = await sendMessage(anId, conversation.id, { content: "one" });
		const second = await sendMessage(anId, conversation.id, { content: "two" });

		await markConversationRead(minhId, conversation.id, { messageId: second.id });
		// What scrolling up to read history looks like: the client marks an older
		// message, and a conversation that was fully read must not turn unread.
		const event = await markConversationRead(minhId, conversation.id, { messageId: first.id });

		expect(event.lastReadMessageId).toBe(second.id);
		expect((await conversationAsSeenBy(minhId, conversation.id)).unreadCount).toBe(0);
	});

	it("stays silent when the marker did not actually move", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const first = await sendMessage(anId, conversation.id, { content: "one" });
		const second = await sendMessage(anId, conversation.id, { content: "two" });
		await markConversationRead(minhId, conversation.id, { messageId: second.id });

		fakeIO.emits.length = 0;
		await markConversationRead(minhId, conversation.id, { messageId: first.id });

		// A "read" event per repeated request would have every client patching
		// state and re-rendering for something that did not change.
		expect(fakeIO.emits.filter((emit) => emit.event === "conversation:read")).toHaveLength(0);
	});

	it("rejects a non-participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("binh");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const message = await sendMessage(anId, conversation.id, { content: "hello" });

		await expect(
			markConversationRead(outsiderId, conversation.id, { messageId: message.id }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("rejects a message that belongs to another conversation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const ours = await createConversation(minhId, { participantIds: [anId] });
		const theirs = await createConversation(minhId, { participantIds: [binhId] });
		const elsewhere = await sendMessage(binhId, theirs.id, { content: "not yours" });

		// Otherwise a marker could be parked on an id from anywhere, and the
		// unread count for this conversation would be computed from a foreign row.
		await expect(markConversationRead(minhId, ours.id, { messageId: elsewhere.id })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});
});

describe("turning read receipts off", () => {
	/** What the other side of a conversation can see of this user's reading. */
	async function sharedMarkerOf(viewerId: string, readerId: string, conversationId: string) {
		const conversation = await conversationAsSeenBy(viewerId, conversationId);

		return conversation.participants.find((participant) => participant.id === readerId)?.lastReadMessageId;
	}

	it("stops sharing the marker while leaving the reader's own unread count working", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const message = await sendMessage(anId, conversation.id, { content: "hello" });
		await updateProfile(minhId, { readReceiptsEnabled: false });

		await markConversationRead(minhId, conversation.id, { messageId: message.id });

		// An sees nothing. Minh's own badge is still cleared — reading is the
		// reader's business, and only the sharing of it was turned off.
		expect(await sharedMarkerOf(anId, minhId, conversation.id)).toBeNull();
		expect((await conversationAsSeenBy(minhId, conversation.id)).unreadCount).toBe(0);
	});

	it("broadcasts the read only to the reader's own devices", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const message = await sendMessage(anId, conversation.id, { content: "hello" });
		await updateProfile(minhId, { readReceiptsEnabled: false });

		fakeIO.emits.length = 0;
		await markConversationRead(minhId, conversation.id, { messageId: message.id });

		// The badge still has to clear on the laptop when they read on the phone,
		// so the event is not simply dropped — it is addressed to nobody else.
		const reads = fakeIO.emits.filter((emit) => emit.event === "conversation:read");
		expect(reads.map((emit) => emit.room)).toEqual([userRoom(minhId)]);
	});

	it("withdraws the receipts already given", async () => {
		// A setting that leaves yesterday's "Seen" on somebody's screen has not
		// done what its label says.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const message = await sendMessage(anId, conversation.id, { content: "hello" });
		await markConversationRead(minhId, conversation.id, { messageId: message.id });
		expect(await sharedMarkerOf(anId, minhId, conversation.id)).toBe(message.id);

		fakeIO.emits.length = 0;
		await updateProfile(minhId, { readReceiptsEnabled: false });

		expect(await sharedMarkerOf(anId, minhId, conversation.id)).toBeNull();
		// And said out loud, so the other side stops showing it now rather than
		// after their next reload.
		expect(fakeIO.emits.filter((emit) => emit.event === "conversation:updated")).toHaveLength(1);
	});

	it("does not reveal what was read while it was off when it is turned back on", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const hidden = await sendMessage(anId, conversation.id, { content: "read in secret" });
		await updateProfile(minhId, { readReceiptsEnabled: false });
		await markConversationRead(minhId, conversation.id, { messageId: hidden.id });

		await updateProfile(minhId, { readReceiptsEnabled: true });

		// Nothing is published by the toggle itself. This is what the second marker
		// column buys: an `enabled ? marker : null` projection would hand An the
		// whole hidden period in one go, the instant Minh changed their mind.
		expect(await sharedMarkerOf(anId, minhId, conversation.id)).toBeNull();

		// It catches up on the next thing actually read, which is a receipt caused
		// by an action rather than by a setting.
		const next = await sendMessage(anId, conversation.id, { content: "and now?" });
		await markConversationRead(minhId, conversation.id, { messageId: next.id });
		expect(await sharedMarkerOf(anId, minhId, conversation.id)).toBe(next.id);
	});
});
