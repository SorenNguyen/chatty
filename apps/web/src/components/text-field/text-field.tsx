import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/utils/cn";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
	label: string;
	error?: string;
	/** Sets the value in mono — for anything typed to a machine's rules rather than a person's: a handle, a code. */
	isMonospaced?: boolean;
}

export function TextField({ label, error, isMonospaced, className, ...rest }: TextFieldProps) {
	// useId, not a prop: two TextFields on one page must not share an id, or
	// clicking one label focuses the other's input.
	const inputId = useId();

	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={inputId} className="eyebrow text-ink-soft">
				{label}
			</label>
			<input
				id={inputId}
				aria-invalid={Boolean(error)}
				className={cn(
					"rounded-md border bg-paper-raised px-3 py-2.5 text-sm outline-none transition",
					// An ink ring, not a blue glow. The focus state is the same
					// material as the rest of the UI rather than the browser's idea of
					// what a focused input looks like.
					"focus:border-ink focus:ring-[3px] focus:ring-ink/8",
					// A field that takes no input has to look like one. The group
					// panel disables the name field for everyone but the owner, and
					// without this it is indistinguishable from an editable one.
					"disabled:bg-paper disabled:text-ink-faint",
					isMonospaced && "font-mono",
					error ? "border-signal focus:border-signal focus:ring-signal/10" : "border-rule",
					className,
				)}
				{...rest}
			/>
			{/* In the eyebrow voice, because the field is speaking as a machine here
			    — it is reporting a rule, not making conversation. */}
			{error && <p className="eyebrow text-signal">{error}</p>}
		</div>
	);
}
