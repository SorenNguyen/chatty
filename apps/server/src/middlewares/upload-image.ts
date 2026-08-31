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

/**
 * How many images one message may carry.
 *
 * Ten, and the number is about the reader rather than the uploader: a gallery
 * past this stops being glanceable and wants a screen of its own. It also caps
 * what one request can buffer — these are held in memory until the re-encode,
 * so the real ceiling is this times `MAX_ATTACHMENT_BYTES`.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

interface ImageUploadOptions {
	/** Form field the file arrives under. The client must match this exactly. */
	field: string;
	maxBytes: number;
	/** Names the thing in the error a user reads — "Avatar", "Image". */
	label: string;
	/**
	 * How many files this field accepts. One means `req.file`; more means
	 * `req.files`, which is a different property, so the two cannot be confused
	 * by a handler reading the wrong one.
	 */
	maxFiles: number;
}

function createImageUpload(options: ImageUploadOptions) {
	const upload = multer({
		// Memory, not disk. Multer's disk storage writes the raw upload under a
		// name it invents, which would mean an unvalidated file sitting in the
		// filesystem between arriving and being checked. Nothing untrusted
		// reaches disk here.
		storage: multer.memoryStorage(),
		limits: { fileSize: options.maxBytes, files: options.maxFiles },
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
	});

	const parse = options.maxFiles === 1 ? upload.single(options.field) : upload.array(options.field, options.maxFiles);

	/**
	 * Parses the multipart body into `req.file`.
	 *
	 * Wrapped rather than used directly so multer's own failures become the
	 * project's typed errors. Left alone, a `LIMIT_FILE_SIZE` reaches the error
	 * middleware as an unrecognized error and is reported as a 500 — "something
	 * broke" instead of "your picture is too big".
	 */
	return function uploadImage(req: Request, res: Response, next: NextFunction): void {
		parse(req, res, (error: unknown) => {
			if (error instanceof MulterError) {
				const message = describeMulterError(error, options);

				next(new ValidationError(message));

				return;
			}

			next(error);
		});
	};
}

/**
 * Turns multer's own failure codes into the sentence a person reads.
 *
 * Separate because there are now three of them and the too-many-files case is
 * the one a user meets by accident — picking twelve photos in the file dialog
 * is one drag, and "could not read the upload" would be a lie about why.
 */
function describeMulterError(error: MulterError, options: ImageUploadOptions): string {
	if (error.code === "LIMIT_FILE_SIZE") {
		return `${options.label} must be smaller than ${options.maxBytes / 1024 / 1024}MB`;
	}

	if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
		return options.maxFiles === 1
			? `Send one file in a "${options.field}" field`
			: `A message may carry at most ${options.maxFiles} images`;
	}

	return `Could not read the upload — send files in a "${options.field}" field`;
}

/** One image into the tray. Same ceiling as a message's, same re-encode after. */
export const uploadSticker = createImageUpload({
	field: "sticker",
	maxBytes: MAX_ATTACHMENT_BYTES,
	label: "Sticker",
	maxFiles: 1,
});

export const uploadAvatar = createImageUpload({
	field: "avatar",
	maxBytes: MAX_AVATAR_BYTES,
	label: "Avatar",
	maxFiles: 1,
});

/**
 * Mounted on `POST /conversations/:id/messages`, which also accepts plain JSON.
 * Multer passes a non-multipart request straight through, leaving `req.files`
 * an empty array — so one route serves a text message and a gallery without a
 * branch in front of it.
 */
export const uploadAttachment = createImageUpload({
	field: "attachment",
	maxBytes: MAX_ATTACHMENT_BYTES,
	label: "Image",
	maxFiles: MAX_ATTACHMENTS_PER_MESSAGE,
});
