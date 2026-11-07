"""Neural Text-to-Speech (TTS) Engine for AutoClip.

Powered by Edge Neural TTS, providing broadcast-quality studio voices
with word-level timing offsets to drive animated Hormozi captions.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import edge_tts

from . import ffmpeg
from .transcript import Word

log = logging.getLogger(__name__)

#: Curated high-retention voices for YouTube Shorts & TikTok
VOICE_PRESETS: dict[str, str] = {
    "narrator": "en-US-ChristopherNeural",       # Deep, authoritative male (breakdowns, trailers, docu)
    "energetic": "en-US-BrianNeural",            # High-energy, exciting male (viral hooks, stunts)
    "storyteller": "en-US-AndrewNeural",         # Engaging, conversational male (lore, reviews)
    "clear_female": "en-US-EmmaNeural",          # Crisp, modern professional female
    "vibrant_female": "en-US-AvaNeural",         # Fast-paced, dynamic female
}

DEFAULT_VOICE = "narrator"
DEFAULT_RATE = "+15%"  # Paced for high-retention Shorts and TikTok


@dataclass
class TTSResult:
    """Output of a speech synthesis operation."""

    audio_path: Path
    words: list[Word]
    duration_s: float
    text: str
    voice: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "audio_path": str(self.audio_path),
            "duration_s": round(self.duration_s, 2),
            "word_count": len(self.words),
            "text": self.text,
            "voice": self.voice,
        }


def resolve_voice(voice_name_or_id: str | None) -> str:
    """Resolve a preset name ('narrator', 'energetic') or full voice ID."""
    if not voice_name_or_id:
        return VOICE_PRESETS[DEFAULT_VOICE]
    return VOICE_PRESETS.get(voice_name_or_id.lower(), voice_name_or_id)


async def synthesize_speech(
    text: str,
    output_path: Path,
    *,
    voice: str | None = None,
    rate: str = DEFAULT_RATE,
    pitch: str = "+0Hz",
) -> TTSResult:
    """Synthesize text into a neural audio file with word-accurate timestamps.

    Args:
        text: The text/commentary to speak.
        output_path: Destination path for the audio file (.mp3 or .wav).
        voice: Voice preset ('narrator', 'energetic', 'clear_female', etc.) or full voice ID.
        rate: Speed modifier (e.g., '+0%', '+10%').
        pitch: Pitch modifier (e.g., '+0Hz').

    Returns:
        TTSResult containing audio path, list of Word objects with timestamps, and duration.
    """
    clean_text = text.strip()
    if not clean_text:
        raise ValueError("Cannot synthesize empty text.")

    voice_id = resolve_voice(voice)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    temp_mp3 = output_path.with_suffix(".mp3")
    words: list[Word] = []

    attempts = 0
    max_attempts = 3
    while attempts < max_attempts:
        attempts += 1
        try:
            communicate = edge_tts.Communicate(
                clean_text,
                voice_id,
                rate=rate,
                pitch=pitch,
                boundary="WordBoundary",
            )
            words = []
            with open(temp_mp3, "wb") as f:
                async for chunk in communicate.stream():
                    chunk_type = chunk.get("type")
                    if chunk_type == "audio":
                        f.write(chunk["data"])
                    elif chunk_type == "WordBoundary":
                        start_s = round(chunk["offset"] / 10_000_000, 3)
                        end_s = round((chunk["offset"] + chunk["duration"]) / 10_000_000, 3)
                        words.append(Word(text=chunk["text"], start=start_s, end=end_s))

            if temp_mp3.exists() and temp_mp3.stat().st_size > 0:
                break
        except Exception as exc:
            if attempts >= max_attempts:
                log.exception("TTS synthesis failed after %d attempts", attempts)
                raise
            log.warning("TTS attempt %d failed (%s); retrying with fallback voice...", attempts, exc)
            voice_id = "en-US-ChristopherNeural"
            await asyncio.sleep(0.8)

    # Probe duration
    info = ffmpeg.probe(temp_mp3)
    duration_s = info.duration_s if info.has_audio else (words[-1].end if words else 0.0)

    # If caller specifically asked for .wav, transcode to 48kHz WAV
    final_path = temp_mp3
    if output_path.suffix.lower() == ".wav":
        wav_path = output_path
        ffmpeg.run([
            "-i", str(temp_mp3),
            "-ar", "48000",
            "-ac", "2",
            "-y",
            str(wav_path),
        ])
        if temp_mp3 != wav_path and temp_mp3.exists():
            temp_mp3.unlink()
        final_path = wav_path

    log.info(
        "Synthesized %d words (%.2fs) using voice '%s' -> %s",
        len(words),
        duration_s,
        voice_id,
        final_path.name,
    )

    return TTSResult(
        audio_path=final_path,
        words=words,
        duration_s=duration_s,
        text=clean_text,
        voice=voice_id,
    )


async def list_presets() -> list[dict[str, str]]:
    """Return available voice presets and descriptions."""
    return [
        {"preset": "narrator", "voice_id": VOICE_PRESETS["narrator"], "gender": "Male", "style": "Authoritative documentary / breakdown"},
        {"preset": "energetic", "voice_id": VOICE_PRESETS["energetic"], "gender": "Male", "style": "High-energy viral hooks / challenges"},
        {"preset": "storyteller", "voice_id": VOICE_PRESETS["storyteller"], "gender": "Male", "style": "Warm conversational narration"},
        {"preset": "clear_female", "voice_id": VOICE_PRESETS["clear_female"], "gender": "Female", "style": "Crisp modern professional"},
        {"preset": "vibrant_female", "voice_id": VOICE_PRESETS["vibrant_female"], "gender": "Female", "style": "Dynamic fast-paced"},
    ]
