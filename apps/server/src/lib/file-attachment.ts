import { fileTypeFromBuffer } from "file-type";

const INTERPRETABLE_MEDIA_TYPES = new Set([
	"text/html",
	"application/xhtml+xml",
	"image/svg+xml",
	"application/xml",
	"text/xml",
	"application/xslt+xml",
]);

/** The type the stored bytes justify, with browser-executable formats demoted. */
export async function sniffFileMediaType(upload: Buffer): Promise<string> {
	const detected = await fileTypeFromBuffer(upload);
	const mediaType = detected?.mime ?? "application/octet-stream";

	return INTERPRETABLE_MEDIA_TYPES.has(mediaType) ? "application/octet-stream" : mediaType;
}

/** A display/download name, never a path. */
export function normalizeFileName(fileName: string): string {
	// Multer exposes multipart filenames as latin1 even though browsers encode
	// them as UTF-8. Recover that byte sequence, but keep the original if it was
	// genuinely latin1 and the conversion would introduce replacement glyphs.
	const decoded = Buffer.from(fileName, "latin1").toString("utf8");
	const unicodeName = decoded.includes("\uFFFD") ? fileName : decoded;
	const withoutControls = unicodeName.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();

	return (withoutControls || "download").slice(0, 255);
}

/** ASCII fallback plus RFC 5987's UTF-8 form for ordinary Vietnamese names. */
export function buildContentDisposition(fileName: string): string {
	const asciiName = fileName
		.normalize("NFKD")
		.replace(/[^\x20-\x7e]/g, "_")
		.replace(/["\\]/g, "_");
	const encodedName = encodeURIComponent(fileName).replace(
		/[!'()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);

	return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}
