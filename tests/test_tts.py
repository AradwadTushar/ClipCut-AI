"""Unit tests for the Neural TTS engine."""

from __future__ import annotations

import pytest
from autoclip.pipeline import tts


def test_resolve_voice_preset() -> None:
    assert tts.resolve_voice("narrator") == "en-US-ChristopherNeural"
    assert tts.resolve_voice("energetic") == "en-US-BrianNeural"
    assert tts.resolve_voice("unknown_custom_id") == "unknown_custom_id"
    assert tts.resolve_voice(None) == "en-US-ChristopherNeural"


@pytest.mark.asyncio
async def test_empty_text_raises_error(tmp_path) -> None:
    with pytest.raises(ValueError, match="Cannot synthesize empty text"):
        await tts.synthesize_speech("   ", tmp_path / "out.mp3")


@pytest.mark.asyncio
async def test_list_presets() -> None:
    presets = await tts.list_presets()
    assert len(presets) >= 5
    keys = {p["preset"] for p in presets}
    assert "narrator" in keys
    assert "energetic" in keys

