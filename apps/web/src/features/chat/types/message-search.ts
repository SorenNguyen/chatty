import type { MessageSearchResultDTO } from "@chatty/shared-types";

/** A search stays alive while the user moves between matching messages. */
export interface MessageSearchSession {
	query: string;
	results: MessageSearchResultDTO[];
	activeIndex: number;
}
