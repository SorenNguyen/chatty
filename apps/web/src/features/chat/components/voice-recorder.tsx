import { Mic, Pause, Play, Send, Square, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { useVoiceRecorder } from "../hooks/use-voice-recorder";
import { formatDuration } from "../utils/format-duration";

interface VoiceRecorderProps {
	isDisabled: boolean;
	onSend: (recording: Blob, onProgress?: (percent: number) => void) => Promise<void>;
	onActiveChange: (isActive: boolean) => void;
}

export function VoiceRecorder({ isDisabled, onSend, onActiveChange }: VoiceRecorderProps) {
	const { phase, elapsedMs, recording, error, level, start, stop, discard } = useVoiceRecorder();
	const [isSending, setIsSending] = useState(false);
	const [previewUrl, setPreviewUrl] = useState<string | undefined>();
	const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [sendError, setSendError] = useState("");
	const previewAudioRef = useRef<HTMLAudioElement>(null);

	useEffect(() => onActiveChange(phase !== "idle"), [onActiveChange, phase]);

	useEffect(() => {
		if (!recording) {
			setPreviewUrl(undefined);

			return;
		}
		const objectUrl = URL.createObjectURL(recording);
		setPreviewUrl(objectUrl);

		return () => URL.revokeObjectURL(objectUrl);
	}, [recording]);

	async function send(): Promise<void> {
		if (!recording) return;
		setIsSending(true);
		setUploadProgress(0);
		setSendError("");
		try {
			await onSend(recording, setUploadProgress);
			discardRecording();
		} catch (caught) {
			setSendError(caught instanceof Error ? caught.message : "The voice message could not be sent");
		} finally {
			setIsSending(false);
		}
	}

	async function togglePreview(): Promise<void> {
		const audio = previewAudioRef.current;
		if (!audio) return;
		try {
			if (audio.paused) {
				await audio.play();
				setIsPreviewPlaying(true);
			} else {
				audio.pause();
				setIsPreviewPlaying(false);
			}
		} catch {
			setSendError("The recording preview could not be played");
		}
	}

	function discardRecording(): void {
		previewAudioRef.current?.pause();
		setIsPreviewPlaying(false);
		setSendError("");
		setUploadProgress(0);
		discard();
	}

	if (phase === "idle") {
		return (
			<div>
				<Button
					variant="ghost"
					onClick={() => void start()}
					disabled={isDisabled}
					aria-label="Record a voice message"
					className="size-9 rounded-bubble p-0 text-ink-faint hover:text-ink"
				>
					<Mic className="size-4" />
				</Button>
				{error && <p className="absolute bottom-full right-0 mb-2 text-xs text-signal">{error}</p>}
			</div>
		);
	}

	return (
		<div className="flex min-h-9 min-w-0 flex-wrap items-center gap-2 rounded-panel bg-paper-sunken px-3 py-1.5">
			<span className="meta min-w-10 text-ink-soft">{formatDuration(elapsedMs)}</span>
			{phase === "recording" ? (
				<>
					<span className="h-1 flex-1 overflow-hidden bg-rule-soft">
						<span
							className="block h-full origin-left bg-live transition-transform"
							style={{ transform: `scaleX(${String(Math.max(0.04, level))})` }}
						/>
					</span>
					<Button
						variant="ghost"
						onClick={discardRecording}
						aria-label="Cancel recording"
						className="size-7 p-0"
					>
						<X className="size-4" />
					</Button>
					<Button onClick={stop} aria-label="Stop recording" className="size-7 p-0">
						<Square className="size-3" />
					</Button>
				</>
			) : (
				<>
					<audio
						ref={previewAudioRef}
						src={previewUrl}
						onEnded={() => setIsPreviewPlaying(false)}
						className="hidden"
					/>
					<Button
						variant="ghost"
						onClick={() => void togglePreview()}
						aria-label={isPreviewPlaying ? "Pause recording preview" : "Play recording preview"}
						className="size-7 p-0"
					>
						{isPreviewPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
					</Button>
					<span className="eyebrow min-w-0 flex-1 truncate text-ink-faint">
						{isSending ? `Uploading ${uploadProgress}%` : "Recording ready"}
					</span>
					<Button
						variant="ghost"
						onClick={discardRecording}
						aria-label="Discard recording"
						className="size-7 p-0"
					>
						<Trash2 className="size-4" />
					</Button>
					<Button
						onClick={() => void send()}
						disabled={isSending}
						aria-label="Send voice message"
						className="size-7 p-0"
					>
						<Send className="size-4" />
					</Button>
				</>
			)}
			{sendError && (
				<p role="alert" className="w-full text-xs text-signal">
					{sendError}
				</p>
			)}
		</div>
	);
}
