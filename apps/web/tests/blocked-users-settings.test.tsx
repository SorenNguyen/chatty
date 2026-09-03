import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useBlockedUsers } from "@/hooks/use-blocked-users";
import { BlockedUsersSettings } from "@/features/profile/components/blocked-users-settings";
import { makeParticipant } from "./factories";

vi.mock("@/api/client", () => ({
	api: {
		listBlockedUsers: vi.fn(),
		unblockUser: vi.fn(),
	},
}));

beforeEach(() => {
	useBlockedUsers.getState().reset();
	vi.mocked(api.unblockUser).mockReset().mockResolvedValue(undefined);
	vi.mocked(api.listBlockedUsers)
		.mockReset()
		.mockResolvedValue({ items: [makeParticipant("an", "An")], nextCursor: null });
});

describe("BlockedUsersSettings", () => {
	it("lists the caller's blocks and refreshes from the first page after unblocking", async () => {
		const user = userEvent.setup();
		render(<BlockedUsersSettings />);

		expect(await screen.findByText("An")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Unblock" }));

		expect(api.unblockUser).toHaveBeenCalledWith("an");
		expect(api.listBlockedUsers).toHaveBeenCalledTimes(2);
	});
});
