import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { makeConversation, makeMessage, makeParticipant } from "./factories";

const conversation = makeConversation({
	participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
	lastMessage: makeMessage("message-1", "an", "ordinary preview"),
});

function renderList(overrides: Partial<React.ComponentProps<typeof ConversationList>> = {}) {
	render(
		<ConversationList
			conversations={[conversation]}
			currentUserId="minh"
			selectedConversationId={null}
			onlineUserIds={new Set()}
			onSelect={() => undefined}
			typingByConversation={{}}
			paging={{ hasMore: false, isLoadingMore: false, loadMore: () => undefined }}
			{...overrides}
		/>,
	);
}

describe("ConversationList", () => {
	it("temporarily replaces the preview when somebody is typing", () => {
		renderList({ typingByConversation: { "conversation-1": ["an"] } });

		expect(screen.getByText("Typing…")).toBeInTheDocument();
		expect(screen.queryByText("ordinary preview")).not.toBeInTheDocument();
	});

	it("uses one compact @ badge instead of adding a label that crowds the row", () => {
		renderList({
			conversations: [
				makeConversation({
					participants: conversation.participants,
					unreadCount: 3,
					lastMessage: { ...conversation.lastMessage!, mentionedUserIds: ["minh"] },
				}),
			],
		});

		expect(screen.getByLabelText("3 unread messages, including a mention")).toHaveTextContent("@");
		expect(screen.queryByText("Mention")).not.toBeInTheDocument();
	});
});
