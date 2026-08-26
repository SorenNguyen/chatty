import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/utils/cn";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
	label: string;
	error?: string;
}

export function TextField({ label, error, className, ...rest }: TextFieldProps) {
	// useId, not a prop: two TextFields on one page must not share an id, or
	// clicking one label focuses the other's input.
	const inputId = useId();

	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={inputId} className="text-sm font-medium text-slate-700">
				{label}
			</label>
			<input
				id={inputId}
				aria-invalid={Boolean(error)}
				className={cn(
					"rounded-lg border px-3 py-2 text-sm outline-none transition",
					"focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
					// A field that takes no input has to look like one. The group
					// panel disables the name field for everyone but the owner, and
					// without this it is indistinguishable from an editable one.
					"disabled:bg-slate-50 disabled:text-slate-500",
					error ? "border-red-400" : "border-slate-300",
					className,
				)}
				{...rest}
			/>
			{error && <p className="text-xs text-red-600">{error}</p>}
		</div>
	);
}
