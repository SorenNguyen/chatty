import type { StickerDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";

interface StickerTray {
	stickers: StickerDTO[];
	isLoading: boolean;
	error: string;
	add: (file: File) => Promise<void>;
	remove: (stickerId: string) => Promise<void>;
}

/**
 * The signed-in person's sticker tray.
 *
 * Loaded once when the tray is first opened rather than with the chat: most
 * sessions never open it, and the URLs it returns carry tokens that expire —
 * fetching them an hour before they are looked at would hand back links that
 * have already gone stale.
 */
export function useStickers(): StickerTray {
	const [stickers, setStickers] = useState<StickerDTO[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let isCurrent = true;

		void api
			.listStickers()
			.then((loaded) => isCurrent && setStickers(loaded))
			.catch((loadError: Error) => isCurrent && setError(loadError.message))
			.finally(() => isCurrent && setIsLoading(false));

		return () => {
			isCurrent = false;
		};
	}, []);

	const add = useCallback(async (file: File) => {
		setError("");
		try {
			const saved = await api.addSticker(file);
			// Newest first, matching the order the server lists them in.
			setStickers((current) => [saved, ...current]);
		} catch (addError) {
			setError((addError as Error).message);
		}
	}, []);

	const remove = useCallback(async (stickerId: string) => {
		setError("");
		// Removed from the tray first: the request is a delete, and a tile that
		// lingers until the round trip finishes reads as a button that did nothing.
		setStickers((current) => current.filter((sticker) => sticker.id !== stickerId));
		try {
			await api.removeSticker(stickerId);
		} catch (removeError) {
			setError((removeError as Error).message);
		}
	}, []);

	return { stickers, isLoading, error, add, remove };
}
