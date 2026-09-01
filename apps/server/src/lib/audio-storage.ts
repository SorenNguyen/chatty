import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { saveFileAttachment } from "./attachment-storage.js";
import { ValidationError } from "./errors.js";

const PCM_SAMPLE_RATE = 8_000;
const PCM_BYTES_PER_SAMPLE = 2;
const WAVEFORM_BUCKETS = 64;
// The recorder stops at 300s. Thirty seconds of server-side tolerance avoids
// rejecting a browser whose final MediaRecorder chunk lands just after 5:00.
const MAX_ACCEPTED_VOICE_SECONDS = 330;
const FFMPEG_TIMEOUT_MS = 30_000;
const require = createRequire(import.meta.url);
const loadedFfmpegPath: unknown = require("ffmpeg-static");
const ffmpegPath = typeof loadedFfmpegPath === "string" ? loadedFfmpegPath : null;

interface AudioMetadata {
	durationMs: number;
	waveform: number[];
}

export interface StoredVoiceAttachment extends AudioMetadata {
	byteSize: number;
	mediaType: "audio/mp4";
}

function runFfmpeg(args: string[], input: Buffer): Promise<Buffer> {
	if (!ffmpegPath) throw new ValidationError("Voice messages are not available on this server");

	return new Promise((resolve, reject) => {
		const process = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });
		const output: Buffer[] = [];
		let errorOutput = "";
		const timeout = setTimeout(() => {
			process.kill("SIGKILL");
			reject(new ValidationError("Voice encoding took too long"));
		}, FFMPEG_TIMEOUT_MS);

		process.stdout.on("data", (chunk: Buffer) => output.push(chunk));
		process.stderr.on("data", (chunk: Buffer) => {
			errorOutput += chunk.toString();
		});
		process.on("error", () => {
			clearTimeout(timeout);
			reject(new ValidationError("That recording could not be read"));
		});
		process.on("close", (code) => {
			clearTimeout(timeout);
			if (code === 0) resolve(Buffer.concat(output));
			else
				reject(
					new ValidationError(
						errorOutput.includes("Invalid data")
							? "That recording could not be read"
							: "Voice encoding failed",
					),
				);
		});
		process.stdin.on("error", () => undefined);
		process.stdin.end(input);
	});
}

function deriveAudioMetadata(pcm: Buffer): AudioMetadata {
	const sampleCount = Math.floor(pcm.byteLength / PCM_BYTES_PER_SAMPLE);
	const durationMs = Math.round((sampleCount / PCM_SAMPLE_RATE) * 1000);
	if (durationMs > MAX_ACCEPTED_VOICE_SECONDS * 1000) {
		throw new ValidationError("Voice messages may be at most 5 minutes");
	}

	const rmsValues: number[] = [];
	for (let bucket = 0; bucket < WAVEFORM_BUCKETS; bucket += 1) {
		const start = Math.floor((bucket * sampleCount) / WAVEFORM_BUCKETS);
		const end = Math.max(start + 1, Math.floor(((bucket + 1) * sampleCount) / WAVEFORM_BUCKETS));
		let sumSquares = 0;
		let samples = 0;
		for (let sample = start; sample < Math.min(end, sampleCount); sample += 1) {
			const value = pcm.readInt16LE(sample * PCM_BYTES_PER_SAMPLE);
			sumSquares += value * value;
			samples += 1;
		}
		rmsValues.push(samples === 0 ? 0 : Math.sqrt(sumSquares / samples));
	}

	const loudest = Math.max(...rmsValues, 1);
	const waveform = rmsValues.map((value) => Math.round((value / loudest) * 100));

	return { durationMs, waveform };
}

export async function saveVoiceAttachment(attachmentId: string, upload: Buffer): Promise<StoredVoiceAttachment> {
	const pcm = await runFfmpeg(
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			"pipe:0",
			"-f",
			"s16le",
			"-acodec",
			"pcm_s16le",
			"-ac",
			"1",
			"-ar",
			String(PCM_SAMPLE_RATE),
			"-t",
			String(MAX_ACCEPTED_VOICE_SECONDS + 1),
			"pipe:1",
		],
		upload,
	);
	const metadata = deriveAudioMetadata(pcm);
	const encoded = await runFfmpeg(
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			"pipe:0",
			"-vn",
			"-ac",
			"1",
			"-ar",
			"24000",
			"-c:a",
			"aac",
			"-b:a",
			"32k",
			"-f",
			"mp4",
			"-movflags",
			"frag_keyframe+empty_moov",
			"pipe:1",
		],
		upload,
	);
	const stored = await saveFileAttachment(attachmentId, encoded);

	return { ...stored, ...metadata, mediaType: "audio/mp4" };
}
