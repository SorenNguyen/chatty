import type { NextFunction, Request, Response } from "express";
import multer, { MulterError } from "multer";
import { ValidationError } from "../lib/errors.js";

/**
 * Multipart parsing for the two things this app accepts uploads of.
 *
 * One factory rather than a file per endpoint: the wrapping below exists to turn
 * multer's own failures into typed errors, and a second copy of it is a second
 * place for a `LIMIT_FILE_SIZE` to start reaching users as a 500.
 */

/**
 * Big enough for a photo straight off a phone, small enough that a handful of
 * concurrent uploads cannot exhaust memory — these are buffered, not streamed
 * to disk, because the file is re-encoded before anything is written.
 */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Roomier than an avatar: this one is the thing being sent, not a thumbnail of a face. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

interface ImageUploadOptions {
	/** Form field the file arrives under. The client must match this exactly. */
	field: string;
	maxBytes: number;
	/** Names the thing in the error a user reads — "Avatar", "Image". */
	label: string;
}

function createImageUpload(options: ImageUploadOptions) {
	const upload = multer({
		// Memory, not disk. Multer's disk storage writes the raw upload under a
		// name it invents, which would mean an unvalidated file sitting in the
		// filesystem between arriving and being checked. Nothing untrusted
		// reaches disk here.
		storage: multer.memoryStorage(),
		limits: { fileSize: options.maxBytes, files: 1 },
		fileFilter: (_req, file, next) => {
			// A first pass only. The client picks this header, so it proves nothing
			// — the real check is the re-encode in lib/*-storage.ts. This just stops
			// ten megabytes of video being buffered before that happens.
			if (!file.mimetype.startsWith("image/")) {
				next(new ValidationError(`${options.label} must be an image`));

				return;
			}

			next(null, true);
		},
	}).single(options.field);

	/**
	 * Parses the multipart body into `req.file`.
	 *
	 * Wrapped rather than used directly so multer's own failures become the
	 * project's typed errors. Left alone, a `LIMIT_FILE_SIZE` reaches the error
	 * middleware as an unrecognized error and is reported as a 500 — "something
	 * broke" instead of "your picture is too big".
	 */
	return function uploadImage(req: Request, res: Response, next: NextFunction): void {
		upload(req, res, (error: unknown) => {
			if (error instanceof MulterError) {
				const message =
					error.code === "LIMIT_FILE_SIZE"
						? `${options.label} must be smaller than ${options.maxBytes / 1024 / 1024}MB`
						: `Could not read the upload — send one file in a "${options.field}" field`;

				next(new ValidationError(message));

				return;
			}

			next(error);
		});
	};
}

export const uploadAvatar = createImageUpload({ field: "avatar", maxBytes: MAX_AVATAR_BYTES, label: "Avatar" });

/**
 * Mounted on `POST /conversations/:id/messages`, which also accepts plain JSON.
 * Multer passes a non-multipart request straight through, leaving `req.file`
 * undefined — so one route serves a text message and an image without a branch
 * in front of it.
 */
export const uploadAttachment = createImageUpload({
	field: "attachment",
	maxBytes: MAX_ATTACHMENT_BYTES,
	label: "Image",
});
