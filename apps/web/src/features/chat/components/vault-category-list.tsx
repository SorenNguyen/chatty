import type { ConversationVaultSummaryDTO } from "@chatty/shared-types";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/button";
import { VAULT_TABS, VAULT_TAB_ICONS, type VaultTab } from "../constants/vault";

interface VaultCategoryListProps {
	summary: ConversationVaultSummaryDTO | null;
	/** Counted from the conversation the panel already holds, not fetched. */
	memberCount: number | null;
	onSelect: (tab: VaultTab) => void;
}

/**
 * What the conversation holds, as a list rather than a tab bar.
 *
 * Six tabs did not fit. The panel is 448px on a desktop and the width of a phone
 * below that, so the strip had to scroll horizontally — which hides categories
 * behind a gesture nobody performs, and spends the panel's most valuable row on
 * six words that say nothing about what is in them. A list has room for the one
 * thing a tab could never carry: **the count**, so "Files 0" is answered before
 * it is opened rather than after a request and a spinner.
 *
 * A missing count renders as nothing at all. A zero would be a claim, and until
 * the summary arrives this component does not have one to make.
 */
export function VaultCategoryList({ summary, memberCount, onSelect }: VaultCategoryListProps) {
	function countOf(tab: VaultTab): number | null {
		if (tab === "members") return memberCount;

		return summary ? summary[tab] : null;
	}

	return (
		<ul className="flex flex-col">
			{VAULT_TABS.filter((tab) => tab.id !== "members" || memberCount !== null).map((tab) => {
				const Icon = VAULT_TAB_ICONS[tab.id];
				const count = countOf(tab.id);

				return (
					<li key={tab.id}>
						<Button
							variant="ghost"
							onClick={() => onSelect(tab.id)}
							// Spelled out rather than left to be assembled from the label and
							// the count, which sit in adjacent elements with no whitespace
							// between them: a screen reader reads that as "Saved2".
							aria-label={count === null ? tab.label : `${tab.label}, ${count}`}
							className="w-full justify-start gap-3 rounded-none px-6 py-3 text-left"
						>
							<Icon className="size-4 shrink-0 text-ink-soft" />
							<span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{tab.label}</span>
							{count !== null && <span className="meta shrink-0 text-ink-faint">{count}</span>}
							<ChevronRight className="size-4 shrink-0 text-ink-faint" />
						</Button>
					</li>
				);
			})}
		</ul>
	);
}
