"""Text-to-Speech API endpoints."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import paths
from ..pipeline import tts

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tts", tags=["tts"])


class SynthesizeIn(BaseModel):
    text: str = Field(min_length=1, description="Text script or commentary to synthesize")
    voice: str = Field(default="narrator", description="Voice preset ('narrator', 'energetic', 'clear_female', etc.)")
    rate: str = Field(default="+0%", description="Speed modifier (e.g. '+0%', '+10%')")


class WordOut(BaseModel):
    text: str
    start: float
    end: float


class SynthesizeOut(BaseModel):
    audio_url: str
    duration_s: float
    words: list[WordOut]
    voice: str


@router.get("/voices")
async def get_voices() -> list[dict[str, str]]:
    """Return list of curated broadcast neural voices."""
    return await tts.list_presets()


@router.post("/synthesize", response_model=SynthesizeOut)
async def synthesize_endpoint(payload: SynthesizeIn) -> SynthesizeOut:
    """Synthesize text into speech with word-level subtitle timing."""
    import uuid

    tts_dir = paths.work_dir() / "tts"
    tts_dir.mkdir(parents=True, exist_ok=True)

    filename = f"tts_{uuid.uuid4().hex[:12]}.mp3"
    dest_path = tts_dir / filename

    try:
        result = await tts.synthesize_speech(
            payload.text,
            dest_path,
            voice=payload.voice,
            rate=payload.rate,
        )
    except Exception as exc:
        log.exception("TTS synthesis failed")
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {exc}") from exc

    return SynthesizeOut(
        audio_url=f"/api/tts/audio/{filename}",
        duration_s=result.duration_s,
        words=[WordOut(text=w.text, start=w.start, end=w.end) for w in result.words],
        voice=result.voice,
    )


@router.get("/audio/{filename}")
async def get_tts_audio(filename: str) -> FileResponse:
    """Serve a synthesized audio file."""
    tts_file = paths.work_dir() / "tts" / filename
    if not tts_file.exists():
        raise HTTPException(status_code=404, detail="Audio file not found.")
    return FileResponse(tts_file, media_type="audio/mpeg", filename=filename)

