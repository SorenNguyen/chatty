import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "../src/lib/errors.js";
import { userRoom } from "../src/lib/socket-bus.js";
import { register } from "../src/modules/auth/auth.service.js";
import { createConversation, listConversationsForUser } from "../src/modules/conversations/conversations.service.js";
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

describe("createConversation", () => {
	it("creates a direct conversation with both participants", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const conversation = await createConversation(minhId, { participantIds: [anId] });

		expect(conversation.isGroup).toBe(false);
		expect(conversation.participants.map((participant) => participant.id).sort()).toEqual([minhId, anId].sort());
		expect(conversation.lastMessage).toBeNull();
	});

	it("reuses the existing direct conversation instead of creating a duplicate", async () => {
		// Otherwise "message An" from two screens splits the history in two.
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const first = await createConversation(minhId, { participantIds: [anId] });
		const second = await createConversation(anId, { participantIds: [minhId] });

		expect(second.id).toBe(first.id);
	});

	it("creates a group when there is more than one other participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");

		const conversation = await createConversation(minhId, {
			participantIds: [anId, binhId],
			name: "Team",
		});

		expect(conversation.isGroup).toBe(true);
		expect(conversation.name).toBe("Team");
		expect(conversation.participants).toHaveLength(3);
	});

	it("does not deduplicate groups — the same people may want several", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");

		const first = await createConversation(minhId, { participantIds: [anId, binhId], name: "Work" });
		const second = await createConversation(minhId, { participantIds: [anId, binhId], name: "Football" });

		expect(second.id).not.toBe(first.id);
	});

	it("ignores the caller's own id when the client includes it", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const conversation = await createConversation(minhId, { participantIds: [anId, minhId] });

		expect(conversation.isGroup).toBe(false);
		expect(conversation.participants).toHaveLength(2);
	});

	it("throws ValidationError when the caller is the only participant", async () => {
		const minhId = await createUser("minh");

		await expect(createConversation(minhId, { participantIds: [minhId] })).rejects.toBeInstanceOf(ValidationError);
	});

	it("throws NotFoundError when a participant does not exist", async () => {
		const minhId = await createUser("minh");

		await expect(createConversation(minhId, { participantIds: ["ghost-id"] })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it("subscribes every participant's live sockets to the new room", async () => {
		// Sockets join their rooms at connect time. Someone already online when the
		// conversation is created would otherwise sit in a chat that never updates.
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const conversation = await createConversation(minhId, { participantIds: [anId] });

		expect(fakeIO.joins).toEqual(
			expect.arrayContaining([
				{ fromRoom: userRoom(minhId), joinedRoom: conversation.id },
				{ fromRoom: userRoom(anId), joinedRoom: conversation.id },
			]),
		);
	});

	it("announces conversation:new to every participant's personal room", async () => {
		// Joining the room is not enough: a brand-new conversation has no messages,
		// so nothing would ever be broadcast into it and it would stay invisible.
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const conversation = await createConversation(minhId, { participantIds: [anId] });

		expect(fakeIO.emits).toEqual(
			expect.arrayContaining([
				{ room: userRoom(minhId), event: "conversation:new", payload: conversation },
				{ room: userRoom(anId), event: "conversation:new", payload: conversation },
			]),
		);
	});

	it("does not announce again when an existing direct conversation is reused", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		await createConversation(minhId, { participantIds: [anId] });

		fakeIO.emits.length = 0;
		await createConversation(anId, { participantIds: [minhId] });

		expect(fakeIO.emits).toEqual([]);
	});

	it("does not re-subscribe when an existing direct conversation is reused", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		await createConversation(minhId, { participantIds: [anId] });

		fakeIO.joins.length = 0;
		await createConversation(anId, { participantIds: [minhId] });

		// The room was joined when it was first created; both are already in it.
		expect(fakeIO.joins).toEqual([]);
	});
});

describe("listConversationsForUser", () => {
	it("returns only conversations the user belongs to", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");

		const mine = await createConversation(minhId, { participantIds: [anId] });
		await createConversation(anId, { participantIds: [binhId] });

		const conversations = await listConversationsForUser(minhId);

		expect(conversations.map((conversation) => conversation.id)).toEqual([mine.id]);
	});

	it("returns an empty list for a user with no conversations", async () => {
		const minhId = await createUser("minh");

		await expect(listConversationsForUser(minhId)).resolves.toEqual([]);
	});
});
