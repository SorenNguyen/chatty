/**
 * The four shapes a button in this app is allowed to take.
 *
 * Shared rather than declared next to `Button` because the audit forbids a type
 * that is not `<Component>Props` inside a component file — and because a caller
 * choosing a variant should be able to see the list without opening the
 * component.
 */
export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
