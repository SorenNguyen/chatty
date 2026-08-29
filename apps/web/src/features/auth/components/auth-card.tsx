import type { ReactNode } from "react";

interface AuthCardProps {
	title: string;
	description?: string;
	children: ReactNode;
}

/**
 * The sheet every signed-out screen is printed on.
 *
 * One component rather than the same header, card and wordmark copied into four
 * pages: they drifted almost immediately the first time — two of them centred
 * their heading and two did not — and a sign-in screen that does not match the
 * reset screen it links to reads as a phishing page.
 */
export function AuthCard({ title, description, children }: AuthCardProps) {
	return (
		<main className="flex min-h-screen items-center justify-center bg-paper p-4">
			<div className="w-full max-w-sm">
				<div className="mb-6 flex items-baseline gap-2">
					<span className="font-display text-[30px] leading-none tracking-tight">Chatty</span>
					<span aria-hidden="true" className="size-1.5 bg-signal" />
				</div>

				<div className="rounded-panel border border-rule bg-paper-raised p-7">
					<h1 className="text-[19px] font-bold tracking-tight text-ink">{title}</h1>
					{description && <p className="mt-2 text-[13px] leading-normal text-ink-soft">{description}</p>}

					<div className="mt-6">{children}</div>
				</div>
			</div>
		</main>
	);
}
