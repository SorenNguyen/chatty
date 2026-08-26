import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "ghost";
	children: ReactNode;
}

export function Button({ variant = "primary", className, children, ...rest }: ButtonProps) {
	return (
		<button
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
