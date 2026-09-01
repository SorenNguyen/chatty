# ADR 0014 — Portable voice-message format

Status: accepted

## Decision

The browser records in the best format its `MediaRecorder` supports, but the server never preserves
that container. It decodes the upload once to mono 8 kHz PCM to validate it, calculate duration, and
derive a 64-bucket RMS waveform, then transcodes the original to mono AAC in a fragmented MP4
container. The stored response type is always `audio/mp4` and it is the only new attachment kind
served inline.

`ffmpeg-static` supplies the binary so development, CI, and production use the same codec behavior.
Duration is derived from decoded sample count because that package does not include `ffprobe`.
Recordings are limited to five minutes, with a small decode allowance for container rounding.

## Consequences

- Safari/iPhone and Chromium play the same stored file even when they recorded different formats.
- Transcoding costs CPU and temporary memory on the API process; voice work remains sequential per
  request and the upload is capped at 16 MB.
- A broken or disguised upload is rejected by the decoder before any attachment row is committed.
- The waveform is stable metadata, so every client renders the same shape without decoding audio.
- Deployments do not need a system `ffmpeg`, but package installation must support the platform for
  which `ffmpeg-static` ships a binary.
