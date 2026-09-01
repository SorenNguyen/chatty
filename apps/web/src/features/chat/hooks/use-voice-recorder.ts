import { useEffect, useRef, useState } from "react";

export type VoiceRecorderPhase = "idle" | "recording" | "preview";

function recordingError(error: unknown): string {
	if (!window.isSecureContext) return "Microphone recording requires HTTPS or localhost.";
	if (error instanceof DOMException && error.name === "NotAllowedError") return "Microphone permission was denied.";
	if (error instanceof DOMException && error.name === "NotFoundError") return "No microphone was found.";
	if (error instanceof DOMException && error.name === "NotReadableError") return "The microphone is already in use.";

	return "The microphone could not be started.";
}

export function useVoiceRecorder() {
	const [phase, setPhase] = useState<VoiceRecorderPhase>("idle");
	const [elapsedMs, setElapsedMs] = useState(0);
	const [recording, setRecording] = useState<Blob | null>(null);
	const [error, setError] = useState("");
	const [level, setLevel] = useState(0);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const timerRef = useRef<number | null>(null);
	const startedAtRef = useRef(0);
	const audioContextRef = useRef<AudioContext | null>(null);
	const levelFrameRef = useRef<number | null>(null);
	const shouldDiscardRef = useRef(false);

	function release(): void {
		if (timerRef.current !== null) window.clearInterval(timerRef.current);
		timerRef.current = null;
		streamRef.current?.getTracks().forEach((track) => track.stop());
		streamRef.current = null;
		if (levelFrameRef.current !== null) window.cancelAnimationFrame(levelFrameRef.current);
		levelFrameRef.current = null;
		void audioContextRef.current?.close();
		audioContextRef.current = null;
		setLevel(0);
	}

	async function start(): Promise<void> {
		if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
			setError(
				window.isSecureContext
					? "Voice recording is not supported in this browser."
					: "Microphone recording requires HTTPS or localhost.",
			);

			return;
		}
		try {
			shouldDiscardRef.current = false;
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			streamRef.current = stream;
			const audioContext = new AudioContext();
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			audioContext.createMediaStreamSource(stream).connect(analyser);
			audioContextRef.current = audioContext;
			const samples = new Uint8Array(analyser.fftSize);
			const measureLevel = () => {
				analyser.getByteTimeDomainData(samples);
				let sumSquares = 0;
				for (const sample of samples) {
					const normalized = (sample - 128) / 128;
					sumSquares += normalized * normalized;
				}
				setLevel(Math.min(1, Math.sqrt(sumSquares / samples.length) * 4));
				levelFrameRef.current = window.requestAnimationFrame(measureLevel);
			};
			measureLevel();
			const mimeType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((type) =>
				MediaRecorder.isTypeSupported(type),
			);
			const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
			const chunks: Blob[] = [];
			recorder.addEventListener("dataavailable", (event) => {
				if (event.data.size > 0) chunks.push(event.data);
			});
			recorder.addEventListener("stop", () => {
				if (shouldDiscardRef.current) {
					shouldDiscardRef.current = false;
					setRecording(null);
					setPhase("idle");
					release();

					return;
				}
				setRecording(new Blob(chunks, { type: recorder.mimeType }));
				setPhase("preview");
				release();
			});
			recorderRef.current = recorder;
			startedAtRef.current = Date.now();
			setElapsedMs(0);
			setError("");
			setPhase("recording");
			recorder.start(250);
			timerRef.current = window.setInterval(() => {
				const elapsed = Date.now() - startedAtRef.current;
				setElapsedMs(elapsed);
				if (elapsed >= 300_000 && recorder.state === "recording") recorder.stop();
			}, 250);
		} catch (caught) {
			release();
			setError(recordingError(caught));
		}
	}

	function stop(): void {
		if (recorderRef.current?.state === "recording") recorderRef.current.stop();
	}

	function discard(): void {
		const wasRecording = recorderRef.current?.state === "recording";
		shouldDiscardRef.current = Boolean(wasRecording);
		if (wasRecording) recorderRef.current?.stop();
		recorderRef.current = null;
		release();
		setRecording(null);
		setElapsedMs(0);
		setPhase("idle");
		if (!wasRecording) shouldDiscardRef.current = false;
	}

	useEffect(
		() => () => {
			shouldDiscardRef.current = true;
			if (recorderRef.current?.state === "recording") recorderRef.current.stop();
			recorderRef.current = null;
			release();
		},
		[],
	);

	return { phase, elapsedMs, recording, error, level, start, stop, discard };
}
