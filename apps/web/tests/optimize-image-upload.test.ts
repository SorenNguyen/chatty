import { afterEach, describe, expect, it, vi } from "vitest";
import { optimizeImagesForUpload } from "@/features/chat/utils/optimize-image-upload";

interface CanvasMocks {
	drawImage: ReturnType<typeof vi.fn>;
	toBlob: ReturnType<typeof vi.spyOn>;
}

function makeFile(size: number, name = "holiday.photo.jpg"): File {
	return new File([new Uint8Array(size)], name, { type: "image/jpeg", lastModified: 123 });
}

function installCanvasMocks(encodedSize: number): CanvasMocks {
	const drawImage = vi.fn();
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		drawImage,
	} as unknown as CanvasRenderingContext2D);
	const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, mediaType) => {
		callback(new Blob([new Uint8Array(encodedSize)], { type: mediaType ?? "" }));
	});

	return { drawImage, toBlob };
}

function makeBitmap(width: number, height: number): ImageBitmap {
	return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("optimizeImagesForUpload", () => {
	it("fits a large image into 1600px and uploads a smaller WebP", async () => {
		const file = makeFile(2_000);
		const bitmap = makeBitmap(3200, 1600);
		const createBitmap = vi.fn().mockResolvedValue(bitmap);
		vi.stubGlobal("createImageBitmap", createBitmap);
		const { drawImage, toBlob } = installCanvasMocks(400);

		const [optimized] = await optimizeImagesForUpload([file]);

		expect(createBitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
		expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 800);
		expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.86);
		expect(optimized).not.toBe(file);
		expect(optimized).toMatchObject({ name: "holiday.photo.webp", size: 400, type: "image/webp" });
		expect(bitmap.close).toHaveBeenCalledOnce();
	});

	it("keeps the original when encoding would add bytes", async () => {
		const file = makeFile(400);
		const bitmap = makeBitmap(800, 600);
		vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
		installCanvasMocks(500);

		await expect(optimizeImagesForUpload([file])).resolves.toEqual([file]);
		expect(bitmap.close).toHaveBeenCalledOnce();
	});

	it("keeps the original when this browser cannot preprocess it", async () => {
		const file = makeFile(400);
		vi.stubGlobal("createImageBitmap", undefined);

		await expect(optimizeImagesForUpload([file])).resolves.toEqual([file]);
	});

	it("falls back per image when decoding fails", async () => {
		const file = makeFile(400);
		vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("unsupported image")));

		await expect(optimizeImagesForUpload([file])).resolves.toEqual([file]);
	});
});
