import { z } from "zod";

const pageFields = {
	before: z.string().min(1).max(64).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(40),
};

export const listMediaSchema = z.object({
	...pageFields,
	kind: z.enum(["image", "file", "audio"]),
});
export type ListMediaQuery = z.infer<typeof listMediaSchema>;

export const listLinksSchema = z.object(pageFields);
export type ListLinksQuery = z.infer<typeof listLinksSchema>;

export const listSavedSchema = z.object(pageFields);
export type ListSavedQuery = z.infer<typeof listSavedSchema>;
