import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import {
	addParticipant,
	createConversation,
	listConversationsForUser,
	removeParticipant,
	renameConversation,
	setGroupInvitePolicy,
	setParticipantRole,
} from "../src/modules/conversations/conversations.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

/** Direct fixture rows keep this permission suite about permissions, not bcrypt. */
async function createUser(name: string): Promise<string> {
	return (
		await prisma.user.create({
			data: {
				email: `${name}@chatty.test`,
				handle: `${name}_test`,
				displayName: name,
				passwordHash: "not-a-real-hash",
			},
			select: { id: true },
		})
	).id;
}

async function createGroup(ownerId: string, participantIds: string[]) {
	return createConversation(ownerId, { participantIds, name: "Trust controls" });
}

async function conversationFor(userId: string, conversationId: string) {
	const conversation = (await listConversationsForUser(userId)).items.find((item) => item.id === conversationId);
	if (!conversation) throw new Error("conversation missing from fixture");

	return conversation;
}

describe("group admins", () => {
	it("lets the owner promote and demote an admin, with idempotent role writes", async () => {
		const ownerId = await createUser("owner");
		const adminId = await createUser("admin");
		const memberId = await createUser("member");
		const group = await createGroup(ownerId, [adminId, memberId]);

		await setParticipantRole(ownerId, group.id, adminId, { role: "admin" });
		fakeIO.emits.length = 0;
		await setParticipantRole(ownerId, group.id, adminId, { role: "admin" });
		expect(fakeIO.emits).toHaveLength(0);
		expect((await conversationFor(ownerId, group.id)).participants).toContainEqual(
			expect.objectContaining({ id: adminId, role: "admin" }),
		);
		await expect(
			prisma.message.count({
				where: { conversationId: group.id, kind: "SYSTEM", content: { contains: "an admin" } },
			}),
		).resolves.toBe(1);

		await setParticipantRole(ownerId, group.id, adminId, { role: "member" });
		expect((await conversationFor(ownerId, group.id)).participants).toContainEqual(
			expect.objectContaining({ id: adminId, role: "member" }),
		);
	});

	it("lets admins rename and remove ordinary members, but not another admin", async () => {
		const ownerId = await createUser("owner");
		const adminId = await createUser("admin");
		const otherAdminId = await createUser("other_admin");
		const memberId = await createUser("member");
		const group = await createGroup(ownerId, [adminId, otherAdminId, memberId]);
		await setParticipantRole(ownerId, group.id, adminId, { role: "admin" });
		await setParticipantRole(ownerId, group.id, otherAdminId, { role: "admin" });

		await renameConversation(adminId, group.id, { name: "Admin maintained" });
		await expect(removeParticipant(adminId, group.id, otherAdminId)).rejects.toBeInstanceOf(ForbiddenError);
		await removeParticipant(adminId, group.id, memberId);

		const updated = await conversationFor(ownerId, group.id);
		expect(updated.name).toBe("Admin maintained");
		expect(updated.participants.map((participant) => participant.id)).not.toContain(memberId);
	});

	it("keeps role changes owner-only", async () => {
		const ownerId = await createUser("owner");
		const adminId = await createUser("admin");
		const memberId = await createUser("member");
		const group = await createGroup(ownerId, [adminId, memberId]);
		await setParticipantRole(ownerId, group.id, adminId, { role: "admin" });

		await expect(setParticipantRole(adminId, group.id, memberId, { role: "admin" })).rejects.toBeInstanceOf(
			ForbiddenError,
		);
	});

	it("promotes an existing admin before an older ordinary member when the owner leaves", async () => {
		const ownerId = await createUser("owner");
		const olderMemberId = await createUser("older");
		const adminId = await createUser("admin");
		const group = await createGroup(ownerId, [olderMemberId, adminId]);
		await setParticipantRole(ownerId, group.id, adminId, { role: "admin" });

		await removeParticipant(ownerId, group.id, ownerId);

		expect((await conversationFor(adminId, group.id)).participants).toContainEqual(
			expect.objectContaining({ id: adminId, role: "owner" }),
		);
	});

	it("keeps administration roles out of direct conversations at the database boundary", async () => {
		const firstId = await createUser("first");
		const secondId = await createUser("second");
		const direct = await createConversation(firstId, { participantIds: [secondId] });

		await expect(
			prisma.conversationParticipant.update({
				where: { conversationId_userId: { conversationId: direct.id, userId: firstId } },
				data: { role: "ADMIN" },
			}),
		).rejects.toThrow(/cannot have an owner or admin/);
	});
});

describe("group invite policy", () => {
	it("defaults to everyone, then lets only owner/admin invite after the owner tightens it", async () => {
		const ownerId = await createUser("owner");
		const adminId = await createUser("admin");
		const memberId = await createUser("member");
		const firstInviteId = await createUser("first_invite");
		const secondInviteId = await createUser("second_invite");
		const group = await createGroup(ownerId, [adminId, memberId]);
		expect(group.invitePolicy).toBe("everyone");
		await setParticipantRole(ownerId, group.id, adminId, { role: "admin" });

		await setGroupInvitePolicy(ownerId, group.id, { invitePolicy: "managers" });
		await expect(addParticipant(memberId, group.id, { userId: firstInviteId })).rejects.toBeInstanceOf(
			ForbiddenError,
		);
		await addParticipant(adminId, group.id, { userId: secondInviteId });

		const updated = await conversationFor(ownerId, group.id);
		expect(updated.invitePolicy).toBe("managers");
		expect(updated.participants.map((participant) => participant.id)).toContain(secondInviteId);
		expect(fakeIO.emits).toContainEqual(
			expect.objectContaining({
				event: "conversation:updated",
				payload: expect.objectContaining({ invitePolicy: "managers" }),
			}),
		);
	});

	it("keeps invite-policy changes owner-only and idempotent", async () => {
		const ownerId = await createUser("owner");
		const adminId = await createUser("admin");
		const memberId = await createUser("member");
		const group = await createGroup(ownerId, [adminId, memberId]);
		await setParticipantRole(ownerId, group.id, adminId, { role: "admin" });

		await expect(setGroupInvitePolicy(adminId, group.id, { invitePolicy: "managers" })).rejects.toBeInstanceOf(
			ForbiddenError,
		);
		await setGroupInvitePolicy(ownerId, group.id, { invitePolicy: "managers" });
		fakeIO.emits.length = 0;
		await setGroupInvitePolicy(ownerId, group.id, { invitePolicy: "managers" });
		expect(fakeIO.emits).toHaveLength(0);
		await expect(
			prisma.message.count({
				where: { conversationId: group.id, kind: "SYSTEM", content: { contains: "changed group invites" } },
			}),
		).resolves.toBe(1);
	});
});
