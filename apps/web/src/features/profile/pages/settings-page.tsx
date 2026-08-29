import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { SettingsModal } from "../components";

/**
 * The /profile route, which is a modal rather than a page.
 *
 * It renders nothing but the overlay: the router mounts it as a sibling of the
 * chat, so the conversation stays on screen underneath. That works because the
 * modal is `fixed inset-0`, which takes it out of the chat's layout entirely —
 * no prop threading, and `features/chat` never learns that settings exist.
 *
 * Closing navigates rather than flipping a local flag, which is what keeps the
 * browser's back button and a bookmarked /profile behaving the way the URL
 * promises.
 */
export function SettingsPage() {
	const currentUser = useAuth((state) => state.currentUser);
	const navigate = useNavigate();

	if (!currentUser) return null;

	return <SettingsModal user={currentUser} onClose={() => navigate("/chat")} />;
}
