import type { MessageSearchResultDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { MESSAGE_SEARCH_DEBOUNCE_MS, MESSAGE_SEARCH_MIN_LENGTH } from "../constants/search";

interface MessageSearch {
	query: string;
	setQuery: (query: string) => void;
	results: MessageSearchResultDTO[];
	isSearching: boolean;
	error: string;
	/** True once a search has run and come back with nothing. */
	hasNoResults: boolean;
	clear: () => void;
}

/**
 * Searching messages as you type.
 *
 * Debounced, unlike `useUserSearch` — which searches on submit and is right to.
 * The difference is what the two are for: you look someone up by a handle you
 * already know, and you look for a message by trying words until one works.
 * Making that a form submit puts a keypress between every attempt and its
 * answer.
 *
 * Debouncing is also what keeps this from being a request per keystroke against
 * a full-text index, which is the shape of load that makes a search endpoint the
 * slowest thing in an app.
 */
export function useMessageSearch(): MessageSearch {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<MessageSearchResultDTO[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [error, setError] = useState("");
	const [hasSearched, setHasSearched] = useState(false);

	useEffect(() => {
		const trimmed = query.trim();

		// Below the minimum is not an empty search, it is *no* search: the results
		// of the last real one are cleared rather than left on screen under a query
		// that no longer produced them.
		if (trimmed.length < MESSAGE_SEARCH_MIN_LENGTH) {
			setResults([]);
			setHasSearched(false);
			setError("");

			return;
		}

		let isCurrent = true;
		const timer = setTimeout(() => {
			setIsSearching(true);
			api.searchMessages(trimmed)
				.then((found) => {
					// A slow response for an older query can land after a newer one;
					// without this the results and the box disagree.
					if (!isCurrent) return;

					setResults(found);
					setHasSearched(true);
					setError("");
				})
				.catch((searchError: Error) => {
					if (isCurrent) setError(searchError.message);
				})
				.finally(() => {
					if (isCurrent) setIsSearching(false);
				});
		}, MESSAGE_SEARCH_DEBOUNCE_MS);

		return () => {
			isCurrent = false;
			clearTimeout(timer);
		};
	}, [query]);

	const clear = useCallback(() => {
		setQuery("");
		setResults([]);
		setHasSearched(false);
		setError("");
	}, []);

	return {
		query,
		setQuery,
		results,
		isSearching,
		error,
		hasNoResults: hasSearched && results.length === 0,
		clear,
	};
}
