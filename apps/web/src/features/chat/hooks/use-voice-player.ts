import { useEffect, useRef, useState } from "react";

let activeAudio: HTMLAudioElement | null = null;

export function useVoicePlayer() {
	const audioRef = useRef<HTMLAudioElement>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [elapsedMs, setElapsedMs] = useState(0);
	const [playbackRate, setPlaybackRate] = useState(1);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		const update = () => setElapsedMs(audio.currentTime * 1000);
		const stop = () => setIsPlaying(false);
		audio.addEventListener("timeupdate", update);
		audio.addEventListener("pause", stop);
		audio.addEventListener("ended", stop);

		return () => {
			if (!audio.paused) audio.pause();
			audio.removeEventListener("timeupdate", update);
			audio.removeEventListener("pause", stop);
			audio.removeEventListener("ended", stop);
			if (activeAudio === audio) activeAudio = null;
		};
	}, []);

	async function togglePlayback(): Promise<void> {
		const audio = audioRef.current;
		if (!audio) return;
		if (!audio.paused) {
			audio.pause();

			return;
		}
		if (activeAudio && activeAudio !== audio) activeAudio.pause();
		activeAudio = audio;
		await audio.play();
		setIsPlaying(true);
	}

	function cyclePlaybackRate(): void {
		const next = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
		setPlaybackRate(next);
		if (audioRef.current) audioRef.current.playbackRate = next;
	}

	function seek(fraction: number): void {
		const audio = audioRef.current;
		if (!audio || !Number.isFinite(audio.duration)) return;
		audio.currentTime = Math.max(0, Math.min(1, fraction)) * audio.duration;
	}

	return { audioRef, isPlaying, elapsedMs, playbackRate, togglePlayback, cyclePlaybackRate, seek };
}
