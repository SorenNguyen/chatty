import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "ghost";
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
 */
export function Button({ variant = "primary", type = "button", className, children, ...rest }: ButtonProps) {
	return (
		<button
			type={type}
			// `className` comes last so a caller's utility beats the defaults —
			// that override is exactly what twMerge inside cn() exists to resolve.
			className={cn(
				"inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
				"disabled:cursor-not-allowed disabled:opacity-50",
				variant === "primary" && "bg-blue-600 text-white hover:bg-blue-700",
				variant === "ghost" && "text-slate-600 hover:bg-slate-100",
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}
