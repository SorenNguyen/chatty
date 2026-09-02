import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import {
	createConversation,
	listConversationsForUser,
	transferGroupOwnership,
} from "../src/modules/conversations/conversations.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

/** Direct row creation, not `register()` — see the note in group-management.service.test.ts. */
async function createUser(name: string): Promise<string> {
	const user = await prisma.user.create({
		data: {
			email: `${name}@chatty.test`,
			handle: `${name}_test`,
			displayName: name,
			passwordHash: "not-a-real-hash",
		},
		select: { id: true },
	});

	return user.id;
}

async function createGroup(creatorId: string, otherIds: string[]) {
	if (otherIds.length < 2) throw new Error("createGroup needs at least two other participants to be a real group");

	return createConversation(creatorId, { participantIds: otherIds, name: "Group" });
}

/** Who holds the role, straight from the database rather than through a DTO. */
async function ownerIdsOf(conversationId: string): Promise<string[]> {
	const owners = await prisma.conversationParticipant.findMany({
		where: { conversationId, role: "OWNER" },
		select: { userId: true },
	});

	return owners.map((owner) => owner.userId);
}

async function systemLines(conversationId: string): Promise<string[]> {
	const messages = await prisma.message.findMany({
		where: { conversationId, kind: "SYSTEM" },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: { content: true },
	});

	return messages.map((message) => message.content);
}

describe("transferGroupOwnership", () => {
	it("moves the role and leaves the former owner an ordinary member", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await transferGroupOwnership(minhId, group.id, { userId: anId });

		expect(await ownerIdsOf(group.id)).toEqual([anId]);
		const seenByMinh = (await listConversationsForUser(minhId)).items;
		const roles = seenByMinh[0]!.participants.map((participant) => [participant.id, participant.role]);
		expect(roles).toEqual(expect.arrayContaining([[minhId, "member"] as const, [anId, "owner"] as const]));
	});

	it("writes a line in the group log saying who handed it to whom", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await transferGroupOwnership(minhId, group.id, { userId: anId });

		expect(await systemLines(group.id)).toEqual(["minh made an the group owner"]);
		expect(fakeIO.emits.filter((emit) => emit.event === "conversation:updated")).toHaveLength(1);
	});

	it("refuses a member who does not own the group", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(transferGroupOwnership(anId, group.id, { userId: binhId })).rejects.toBeInstanceOf(ForbiddenError);
		expect(await ownerIdsOf(group.id)).toEqual([minhId]);
	});

	it("refuses somebody who is not in the group", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const outsiderId = await createUser("duc");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(transferGroupOwnership(minhId, group.id, { userId: outsiderId })).rejects.toBeInstanceOf(
			NotFoundError,
		);
		expect(await ownerIdsOf(group.id)).toEqual([minhId]);
	});

	it("refuses handing the group to yourself", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(transferGroupOwnership(minhId, group.id, { userId: minhId })).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	it("refuses in a direct conversation, which has nobody to administer", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		await expect(transferGroupOwnership(minhId, direct.id, { userId: anId })).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	it("leaves exactly one owner when two hand-overs race, and fails the loser cleanly", async () => {
		// The case the phase 7 lock and the deferred owner constraint were built
		// for. What matters is the *shape* of the loss: a 403 from the service,
		// because the second request finds it is no longer the owner — not a
		// constraint violation surfacing as a 500.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		const results = await Promise.allSettled([
			transferGroupOwnership(minhId, group.id, { userId: anId }),
			transferGroupOwnership(minhId, group.id, { userId: binhId }),
		]);

		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((result) => result.status === "rejected")).toEqual([
			expect.objectContaining({ reason: expect.any(ForbiddenError) }),
		]);
		expect(await ownerIdsOf(group.id)).toHaveLength(1);
	});
});
