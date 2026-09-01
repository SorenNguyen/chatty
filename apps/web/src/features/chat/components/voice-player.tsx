import type { AttachmentDTO } from "@chatty/shared-types";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { useVoicePlayer } from "../hooks/use-voice-player";
import { formatDuration } from "../utils/format-duration";

interface VoicePlayerProps {
	attachment: AttachmentDTO;
	className?: string;
}

export function VoicePlayer({ attachment, className }: VoicePlayerProps) {
	const { audioRef, isPlaying, elapsedMs, playbackRate, togglePlayback, cyclePlaybackRate, seek } = useVoicePlayer();
	const durationMs = attachment.durationMs ?? 0;
	const playedFraction = durationMs === 0 ? 0 : elapsedMs / durationMs;

	return (
		<div
			className={cn(
				"flex min-w-64 max-w-80 items-center gap-2 rounded-control border border-rule bg-paper-raised px-2.5 py-2 text-ink",
				className,
			)}
		>
			<audio ref={audioRef} src={attachment.url} preload="metadata" />
			<Button
				variant="ghost"
				onClick={() => void togglePlayback()}
				aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
				className="size-8 shrink-0 p-0"
			>
				{isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
			</Button>
			<Button
				variant="ghost"
				onClick={(event) => {
					const bounds = event.currentTarget.getBoundingClientRect();
					seek((event.clientX - bounds.left) / bounds.width);
				}}
				aria-label="Seek voice message"
				className="flex h-8 min-w-0 flex-1 items-center gap-0.5 rounded-none p-0 hover:bg-transparent"
			>
				{attachment.waveform.map((height, index) => (
					<span
						key={`${attachment.id}-${String(index)}`}
						className={
							index / attachment.waveform.length <= playedFraction
								? "w-0.5 bg-live"
								: "w-0.5 bg-ink-faint"
						}
						style={{ height: `${Math.max(10, height)}%` }}
					/>
				))}
			</Button>
			<span className="meta shrink-0 text-ink-faint">
				{formatDuration(Math.min(elapsedMs, durationMs) || durationMs)}
			</span>
			<Button
				variant="ghost"
				onClick={cyclePlaybackRate}
				aria-label="Change playback speed"
				className="meta h-7 w-9 shrink-0 p-0"
			>
				{playbackRate}×
			</Button>
		</div>
	);
}
