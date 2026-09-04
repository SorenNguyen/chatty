import { IMAGE_UPLOAD_QUALITY, MAX_IMAGE_UPLOAD_DIMENSION, OPTIMIZED_IMAGE_MEDIA_TYPE } from "../constants/attachment";

interface ImageDimensions {
	width: number;
	height: number;
}

/**
 * Shrinks photos before they cross the network, one at a time.
 *
 * The server still decodes and re-encodes every result: browser output is
 * untrusted, and that pass removes metadata and prevents content sniffing.
 * Client work is only a bandwidth/CPU hint, so an unsupported codec, decoder
 * failure or a result larger than the original falls back to the original file.
 */
export async function optimizeImagesForUpload(files: File[]): Promise<File[]> {
	const optimized: File[] = [];

	for (const file of files) optimized.push(await optimizeImageForUpload(file));

	return optimized;
}

async function optimizeImageForUpload(file: File): Promise<File> {
	if (typeof createImageBitmap !== "function") return file;

	let image: ImageBitmap | undefined;
	try {
		image = await createImageBitmap(file, { imageOrientation: "from-image" });
		const dimensions = fitInside(image.width, image.height, MAX_IMAGE_UPLOAD_DIMENSION);
		const canvas = document.createElement("canvas");
		canvas.width = dimensions.width;
		canvas.height = dimensions.height;
		const context = canvas.getContext("2d");
		if (!context) return file;

		context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
		const encoded = await encodeWebp(canvas);
		if (!encoded || encoded.type !== OPTIMIZED_IMAGE_MEDIA_TYPE || encoded.size >= file.size) return file;

		return new File([encoded], webpName(file.name), {
			type: OPTIMIZED_IMAGE_MEDIA_TYPE,
			lastModified: file.lastModified,
		});
	} catch {
		return file;
	} finally {
		image?.close();
	}
}

function fitInside(width: number, height: number, longestEdge: number): ImageDimensions {
	const scale = Math.min(longestEdge / width, longestEdge / height, 1);

	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

function encodeWebp(canvas: HTMLCanvasElement): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, OPTIMIZED_IMAGE_MEDIA_TYPE, IMAGE_UPLOAD_QUALITY));
}

function webpName(fileName: string): string {
	const lastDot = fileName.lastIndexOf(".");
	const stem = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;

	return `${stem || "image"}.webp`;
}
