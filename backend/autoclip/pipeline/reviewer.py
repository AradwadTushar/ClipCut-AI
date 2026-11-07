"""2-Tier Collaborative Review Engine for AutoClip.

Combines broad, fast candidate generation (Tier 1: Ollama / Gemini Flash Lite)
with elite creative copywriting, hook refinement, and boundary polish (Tier 2: Claude / Gemini).
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from ..config import Settings, load as load_settings
from ..db import store
from ..db.models import Clip
from ..pipeline.runner import JobWorkspace
from ..pipeline.transcript import Transcript
from ..providers import LLMProvider, build_provider

log = logging.getLogger(__name__)


class PolishVerdict(BaseModel):
    """Creative review output from Tier 2 model."""

    optimized_title: str = Field(description="High-CTR, curiosity-inducing YouTube Shorts title (under 60 chars)")
    curiosity_hook: str = Field(description="Curiosity or mystery opening hook for on-screen text")
    shock_hook: str = Field(description="Surprising or bold opening hook")
    action_hook: str = Field(description="Direct, fast-paced opening hook")
    trim_start_s: float = Field(default=0.0, description="Seconds to trim from start to remove dead air (0.0 to 3.0)")
    trim_end_s: float = Field(default=0.0, description="Seconds to trim from end to hit a punchy finish (0.0 to 3.0)")
    refined_score: int = Field(ge=1, le=100, description="Refined virality score (1-100)")
    verdict: str = Field(description="'MUST_POST', 'STRONG_CONTENDER', 'NEEDS_EDIT', or 'SKIP'")
    creative_tip: str = Field(description="1 actionable tip for visual pacing or text overlay")


REVIEW_PROMPT = """You are an elite YouTube Shorts and TikTok creative director specializing in viral retention and high-CTR packaging.

A candidate clip was extracted from a long video. Your job is to polish its title, craft 3 high-impact opening text hooks, suggest micro-trims for dead air, and score its virality.

Source Video Context:
Title: {source_title}

Candidate Metadata:
Draft Title: {draft_title}
Draft Hook: {draft_hook}
Duration: {duration_s:.1f}s (from {start_s:.1f}s to {end_s:.1f}s)

Spoken Dialogue Excerpt:
\"\"\"
{dialogue}
\"\"\"

Respond with a strictly formatted JSON object matching this schema:
{{
  "optimized_title": "Punchy title under 60 characters with strong curiosity gap",
  "curiosity_hook": "Question or mystery hook for the first 3 seconds",
  "shock_hook": "Bold or counter-intuitive hook",
  "action_hook": "Fast, high-energy hook",
  "trim_start_s": 0.0,
  "trim_end_s": 0.0,
  "refined_score": 88,
  "verdict": "MUST_POST",
  "creative_tip": "Keep zoom cut at 0:14 when he mentions the price."
}}
"""


async def polish_clip(
    clip_id: str,
    *,
    tier2_provider_name: str | None = None,
    settings: Settings | None = None,
    apply: bool = True,
) -> dict[str, Any]:
    """Execute Tier 2 Creative Polish on a single clip candidate.

    Args:
        clip_id: ID of the clip to polish.
        tier2_provider_name: Optional override provider (e.g. 'anthropic', 'gemini').
        settings: Optional app settings.
        apply: Automatically commit polished title and micro-trim boundaries to database.

    Returns:
        Dictionary containing the polished title, 3 viral hooks, micro-trims, and verdict.
    """
    settings = settings or load_settings()
    clip = await asyncio.to_thread(store.get_clip, clip_id)
    if clip is None:
        raise ValueError(f"Clip not found: {clip_id}")

    job = await asyncio.to_thread(store.get_job, clip.job_id)
    if job is None:
        raise ValueError(f"Job not found: {clip.job_id}")

    source = await asyncio.to_thread(store.get_source, job.source_id)
    source_title = source.title if source else "Video"

    workspace = JobWorkspace(clip.job_id)
    transcript = (
        await asyncio.to_thread(Transcript.load, workspace.transcript)
        if workspace.transcript.exists()
        else None
    )

    dialogue = ""
    if transcript:
        words = transcript.slice(clip.start_word, clip.end_word)
        dialogue = " ".join(w.text for w in words)

    # Determine provider: prefer anthropic (Claude) if key exists, otherwise gemini
    chosen_provider = tier2_provider_name
    if not chosen_provider:
        from ..config import get_secret

        claude_key = get_secret("anthropic", settings)
        chosen_provider = "anthropic" if claude_key else "gemini"

    provider = build_provider(chosen_provider, settings)
    log.info("Executing Tier 2 review on clip %s using %s", clip_id, provider.name)

    prompt = REVIEW_PROMPT.format(
        source_title=source_title,
        draft_title=clip.title,
        draft_hook=clip.hook,
        duration_s=clip.end_s - clip.start_s,
        start_s=clip.start_s,
        end_s=clip.end_s,
        dialogue=dialogue,
    )

    from ..providers.base import DetectionConfig

    config = DetectionConfig(temperature=0.3)
    system = "You are a viral YouTube Shorts packaging assistant. Respond with strictly valid JSON only."

    raw_response = await provider._complete(system, prompt, config)

    # Parse JSON
    try:
        clean = raw_response.strip()
        if clean.startswith("```json"):
            clean = clean.removeprefix("```json").removesuffix("```").strip()
        elif clean.startswith("```"):
            clean = clean.removeprefix("```").removesuffix("```").strip()
        data = json.loads(clean)
        verdict = PolishVerdict(**data)
    except Exception as exc:
        log.warning("Tier 2 response JSON parse failed (%s); raw: %s", exc, raw_response)
        verdict = PolishVerdict(
            optimized_title=clip.title,
            curiosity_hook=clip.hook,
            shock_hook=clip.hook,
            action_hook=clip.hook,
            trim_start_s=0.0,
            trim_end_s=0.0,
            refined_score=clip.score,
            verdict="STRONG_CONTENDER",
            creative_tip="Add prominent text captions during first 2 seconds.",
        )

    applied = False
    new_start_s = clip.start_s
    new_end_s = clip.end_s
    new_title = clip.title

    if apply:
        new_title = verdict.optimized_title
        candidate_start = clip.start_s + max(0.0, verdict.trim_start_s)
        candidate_end = clip.end_s - max(0.0, verdict.trim_end_s)
        if candidate_end - candidate_start >= 5.0:
            new_start_s = round(candidate_start, 2)
            new_end_s = round(candidate_end, 2)

        start_word = clip.start_word
        end_word = clip.end_word
        if transcript and (new_start_s != clip.start_s or new_end_s != clip.end_s):
            first, last = transcript.indices_in_range(new_start_s, new_end_s)
            start_word, end_word = first, max(first, last - 1)

        await asyncio.to_thread(
            store.update_clip,
            clip_id,
            start_s=new_start_s,
            end_s=new_end_s,
            start_word=start_word,
            end_word=end_word,
            title=new_title,
            user_trimmed=True if (new_start_s != clip.start_s or new_end_s != clip.end_s) else None,
        )
        applied = True
        log.info(
            "Applied polish to clip %s: title='%s', trim=[%.2f, %.2f]",
            clip_id,
            new_title,
            new_start_s,
            new_end_s,
        )

    return {
        "clip_id": clip.id,
        "original_title": clip.title,
        "original_hook": clip.hook,
        "original_score": clip.score,
        "tier2_provider": provider.name,
        "applied": applied,
        "new_start_s": new_start_s,
        "new_end_s": new_end_s,
        "new_title": new_title,
        "polish": verdict.model_dump(),
    }
