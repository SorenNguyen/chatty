import type { NextFunction, Request, Response } from "express";
import multer, { MulterError } from "multer";
import { ValidationError } from "../lib/errors.js";

/**
 * Big enough for a photo straight off a phone, small enough that a handful of
 * concurrent uploads cannot exhaust memory — these are buffered, not streamed
 * to disk, because the file is re-encoded before anything is written.
 */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Form field the file arrives under. The client must match this exactly. */
const AVATAR_FIELD = "avatar";

const upload = multer({
	// Memory, not disk. Multer's disk storage writes the raw upload under a name
	// it invents, which would mean an unvalidated file sitting in the filesystem
	// between arriving and being checked. Nothing untrusted reaches disk here.
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
	fileFilter: (_req, file, next) => {
		// A first pass only. The client picks this header, so it proves nothing —
		// the real check is lib/avatar-storage re-encoding the pixels. This just
		// stops five megabytes of video being buffered before that happens.
		if (!file.mimetype.startsWith("image/")) {
			next(new ValidationError("Only image files can be used as an avatar"));

			return;
		}

		next(null, true);
	},
}).single(AVATAR_FIELD);

/**
 * Parses the multipart body into `req.file`.
 *
 * Wrapped rather than used directly so multer's own failures become the
 * project's typed errors. Left alone, a `LIMIT_FILE_SIZE` reaches the error
 * middleware as an unrecognized error and is reported to the user as a 500 —
 * "something broke" instead of "your picture is too big".
 */
export function uploadAvatar(req: Request, res: Response, next: NextFunction): void {
	upload(req, res, (error: unknown) => {
		if (error instanceof MulterError) {
			const message =
				error.code === "LIMIT_FILE_SIZE"
					? `Avatar must be smaller than ${MAX_AVATAR_BYTES / 1024 / 1024}MB`
					: `Could not read the upload — send one file in a "${AVATAR_FIELD}" field`;

			next(new ValidationError(message));

			return;
		}

		next(error);
	});
}
