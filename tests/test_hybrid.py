"""Unit tests for the Hybrid Hook Machine (Pipeline 3)."""

from __future__ import annotations

import pytest
from autoclip.pipeline.hybrid import generate_hook_text


@pytest.mark.asyncio
async def test_generate_hook_text_fallback() -> None:
    # When no LLM is configured or available, falls back to existing hook or title
    hook = await generate_hook_text(
        clip_title="Crazy GTA 6 Reveal",
        clip_reason="Shocking discovery",
        dialogue_snippet="Look at this character on screen",
        existing_hook="Wait till you see who leaked in GTA 6!",
        provider_name="none",
    )
    assert hook == "Wait till you see who leaked in GTA 6!"


@pytest.mark.asyncio
async def test_generate_hook_text_title_fallback() -> None:
    hook = await generate_hook_text(
        clip_title="Secret Ending",
        clip_reason="",
        dialogue_snippet="",
        existing_hook="",
        provider_name="nonexistent_provider",
    )
    assert "Secret Ending" in hook or "Wait" in hook

