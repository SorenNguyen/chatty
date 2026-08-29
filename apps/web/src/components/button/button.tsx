import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "outline" | "ghost" | "danger";
	children: ReactNode;
}

/**
 * `type` defaults to "button", not to the HTML default of "submit".
 *
 * A `<button>` with no type inside a `<form>` submits it, and it also becomes a
 * candidate for *implicit* submission — pressing Enter in a text field activates
 * the form's first submit button, whatever that button was actually for. That
 * shipped as a real bug: attaching an image to a message and pressing Enter
 * instead of clicking send fired the preview's "Remove attached image" button
 * first, so the picture was dropped and a text-only message went out. Found by
 * the e2e suite; invisible to every unit test, because each one clicks the
 * button it means.
 *
 * Every genuine submit in this app already says `type="submit"` explicitly, so
 * this default costs nothing and closes the same trap in the other three forms.
 *
 * On the four variants: `danger` is outlined rather than filled, and that is the
 * whole point of it existing separately from `primary`. A solid red block is the
 * most attention-grabbing thing on the screen, which is the opposite of what a
 * button guarding account deletion should be — it invites the click it is meant
 * to slow down. The outline says "this one is different" without shouting.
 */
export function Button({ variant = "primary", type = "button", className, children, ...rest }: ButtonProps) {
	return (
		<button
			type={type}
			// `className` comes last so a caller's utility beats the defaults —
			// that override is exactly what twMerge inside cn() exists to resolve.
			className={cn(
				"inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/15",
				"disabled:cursor-not-allowed disabled:opacity-35",
				variant === "primary" && "bg-ink text-paper hover:bg-ink/90",
				variant === "outline" && "border border-ink text-ink hover:bg-ink/5",
				variant === "ghost" && "text-ink-soft hover:bg-ink/5 hover:text-ink",
				variant === "danger" && "border border-signal text-signal hover:bg-signal-soft",
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}
