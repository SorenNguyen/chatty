import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { removeParticipant } from "../src/modules/conversations/conversations.service.js";
import { deleteMessage, sendMessage } from "../src/modules/messages/messages.service.js";
import { searchMessages } from "../src/modules/search/search.service.js";
import { installFakeIO } from "./fake-io.js";

beforeEach(() => {
	// sendMessage broadcasts, and getIO() throws when nothing has been installed.
	installFakeIO();
});

/** Created directly with `prisma` — these tests are not about authentication. */
async function makeUser(handle: string): Promise<string> {
	const user = await prisma.user.create({
		data: { email: `${handle}@chatty.test`, handle, displayName: handle, passwordHash: "x" },
		select: { id: true },
	});

	return user.id;
}

async function makeConversation(userIds: string[], name: string | null = null): Promise<string> {
	const conversation = await prisma.conversation.create({
		data: {
			isGroup: userIds.length > 2,
			name,
			participants: {
				create: userIds.map((userId, index) => ({
					userId,
					// A group needs exactly one owner or the phase 7 trigger refuses it.
					...(userIds.length > 2 && index === 0 ? { role: "OWNER" as const } : {}),
				})),
			},
		},
		select: { id: true },
	});

	return conversation.id;
}

const search = (userId: string, query: string, limit = 20) =>
	searchMessages(userId, { query, limit }).then((results) => results.map((result) => result.message.content));

describe("searchMessages", () => {
	it("finds a message by a word in it", async () => {
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const conversation = await makeConversation([minh, an]);
		await sendMessage(minh, conversation, { content: "the deployment is on Friday" });
		await sendMessage(minh, conversation, { content: "lunch?" });

		await expect(search(minh, "deployment")).resolves.toEqual(["the deployment is on Friday"]);
	});

	it("searches across every conversation the caller is in", async () => {
		// The whole reason this is not a route under /conversations/:id.
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const binh = await makeUser("binh");
		const first = await makeConversation([minh, an]);
		const second = await makeConversation([minh, binh]);
		await sendMessage(an, first, { content: "keys are under the mat" });
		await sendMessage(binh, second, { content: "lost my keys" });

		await expect(search(minh, "keys")).resolves.toHaveLength(2);
	});

	it("says which conversation each result came from", async () => {
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const binh = await makeUser("binh");
		const group = await makeConversation([minh, an, binh], "Standup");
		await sendMessage(an, group, { content: "deploying now" });

		const [result] = await searchMessages(minh, { query: "deploying", limit: 20 });

		expect(result!.conversation.name).toBe("Standup");
		expect(result!.conversation.isGroup).toBe(true);
		expect(result!.conversation.participants).toHaveLength(3);
	});

	it("finds Vietnamese text", async () => {
		// `simple` splits on word boundaries and lowercases, which is right for
		// Vietnamese. The `english` configuration would stem for the wrong language.
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const conversation = await makeConversation([minh, an]);
		await sendMessage(minh, conversation, { content: "Hẹn gặp lại bạn nhé" });

		await expect(search(minh, "gặp")).resolves.toEqual(["Hẹn gặp lại bạn nhé"]);
		await expect(search(minh, "hẹn gặp")).resolves.toEqual(["Hẹn gặp lại bạn nhé"]);
	});

	it("does not match Vietnamese typed without its diacritics", async () => {
		// A known limitation rather than a bug, and pinned here so it is noticed if
		// it ever changes: `simple` keeps diacritics, so "hen gap" is a different
		// word from "hẹn gặp". Closing it needs the unaccent extension — the phase
		// 12 migration spells out exactly how.
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const conversation = await makeConversation([minh, an]);
		await sendMessage(minh, conversation, { content: "Hẹn gặp lại bạn nhé" });

		await expect(search(minh, "hen gap")).resolves.toEqual([]);
	});

	it("is case-insensitive", async () => {
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const conversation = await makeConversation([minh, an]);
		await sendMessage(minh, conversation, { content: "Deployment Friday" });

		await expect(search(minh, "deployment")).resolves.toHaveLength(1);
	});

	it("treats several words as all of them, not any", async () => {
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const conversation = await makeConversation([minh, an]);
		await sendMessage(minh, conversation, { content: "deployment on Friday" });
		await sendMessage(minh, conversation, { content: "deployment cancelled" });

		await expect(search(minh, "deployment friday")).resolves.toEqual(["deployment on Friday"]);
	});

	it("survives whatever a person types", async () => {
		// `to_tsquery` throws a syntax error on a bare space, which would have made
		// a two-word search a 500. `websearch_to_tsquery` accepts anything.
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const conversation = await makeConversation([minh, an]);
		await sendMessage(minh, conversation, { content: "deployment on Friday" });

		await expect(search(minh, "deployment & | ! ()")).resolves.toHaveLength(1);
		await expect(search(minh, '"on Friday"')).resolves.toHaveLength(1);
		await expect(search(minh, "-deployment lunch")).resolves.toEqual([]);
	});

	it("returns nothing from a conversation the caller is not in", async () => {
		// The authorization, and it is a join rather than a filter afterwards.
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const binh = await makeUser("binh");
		const theirs = await makeConversation([an, binh]);
		await sendMessage(an, theirs, { content: "a private deployment" });

		await expect(search(minh, "deployment")).resolves.toEqual([]);
	});

	it("stops finding a group's messages once the caller leaves it", async () => {
		// The same rule the sidebar follows: a group you left disappears from it
		// entirely, so it must disappear from search too.
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const binh = await makeUser("binh");
		const group = await makeConversation([minh, an, binh], "Standup");
		await sendMessage(an, group, { content: "the deployment is on Friday" });
		await expect(search(binh, "deployment")).resolves.toHaveLength(1);

		await removeParticipant(binh, group, binh);

		await expect(search(binh, "deployment")).resolves.toEqual([]);
	});

	it("does not find a deleted message", async () => {
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const conversation = await makeConversation([minh, an]);
		const sent = await sendMessage(minh, conversation, { content: "regrettable deployment" });

		await deleteMessage(minh, conversation, sent.id);

		await expect(search(minh, "deployment")).resolves.toEqual([]);
	});

	it("finds a message by its new text after an edit, and not its old", async () => {
		// Free, because the search column is GENERATED from `content` rather than
		// maintained by a trigger someone has to remember on each write path.
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const conversation = await makeConversation([minh, an]);
		const sent = await sendMessage(minh, conversation, { content: "lunch at noon" });

		await prisma.message.update({ where: { id: sent.id }, data: { content: "dinner at eight" } });

		await expect(search(minh, "lunch")).resolves.toEqual([]);
		await expect(search(minh, "dinner")).resolves.toEqual(["dinner at eight"]);
	});

	it("does not surface system lines", async () => {
		// "An added Binh" is the log of something that happened, not something
		// anyone said.
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const binh = await makeUser("binh");
		const group = await makeConversation([minh, an, binh], "Standup");
		await prisma.message.create({ data: { conversationId: group, kind: "SYSTEM", content: "An added Binh" } });

		await expect(search(minh, "added")).resolves.toEqual([]);
	});

	it("returns the newest matches first", async () => {
		// Recency rather than relevance: in a chat the thing you are looking for is
		// almost always the recent one.
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const conversation = await makeConversation([minh, an]);
		await sendMessage(minh, conversation, { content: "deployment one" });
		await sendMessage(minh, conversation, { content: "deployment two" });
		await sendMessage(minh, conversation, { content: "deployment three" });

		await expect(search(minh, "deployment")).resolves.toEqual([
			"deployment three",
			"deployment two",
			"deployment one",
		]);
	});

	it("respects the limit and pages backwards from a cursor", async () => {
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const conversation = await makeConversation([minh, an]);
		await sendMessage(minh, conversation, { content: "deployment one" });
		await sendMessage(minh, conversation, { content: "deployment two" });
		await sendMessage(minh, conversation, { content: "deployment three" });

		const firstPage = await searchMessages(minh, { query: "deployment", limit: 2 });
		expect(firstPage.map((result) => result.message.content)).toEqual(["deployment three", "deployment two"]);

		const secondPage = await searchMessages(minh, {
			query: "deployment",
			limit: 2,
			before: firstPage[firstPage.length - 1]!.message.createdAt,
		});
		expect(secondPage.map((result) => result.message.content)).toEqual(["deployment one"]);
	});

	it("finds nothing rather than everything when nothing matches", async () => {
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const conversation = await makeConversation([minh, an]);
		await sendMessage(minh, conversation, { content: "hello" });

		await expect(search(minh, "deployment")).resolves.toEqual([]);
	});
});
