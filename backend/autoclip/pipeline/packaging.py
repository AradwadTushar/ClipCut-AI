"""YouTube Shorts Publishing Packager.

Generates high-CTR titles, SEO descriptions, trending hashtags, pinned comments,
and transformative fair-use source attribution credits for published clips.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from ..config import Settings, load as load_settings
from ..db import store
from ..pipeline.runner import JobWorkspace
from ..pipeline.transcript import Transcript
from ..providers import build_provider

log = logging.getLogger(__name__)


class PackagingResult(BaseModel):
    """Complete metadata package for uploading to YouTube Shorts."""

    title: str = Field(description="High-CTR YouTube Shorts title under 60 characters with optional emoji")
    description: str = Field(description="2-3 sentence engaging description summarizing the moment")
    hashtags: list[str] = Field(description="4-6 relevant trending hashtags starting with # (including #shorts)")
    pinned_comment: str = Field(description="Engagement question or call-to-action for the pinned comment")
    attribution_credit: str = Field(description="Standardized fair-use source credit to protect against copyright claims")


PACKAGING_PROMPT = """You are an expert YouTube Shorts packaging and SEO specialist.

Your task is to create a high-CTR, algorithm-optimized publishing package for a YouTube Short cut from a long video.

Source Information:
- Source Video: {source_title}
- Channel/Creator: {source_channel}
- Source URL: {source_url}

Clip Details:
- Title: {clip_title}
- Hook: {clip_hook}
- Duration: {duration_s:.1f}s

Spoken Dialogue Excerpt:
\"\"\"
{dialogue}
\"\"\"

Instructions:
1. "title": Punchy, high-CTR title under 60 characters with strong curiosity gap. Include #shorts.
2. "description": 2-3 sentences providing context and building intrigue.
3. "hashtags": 4-6 trending tags (e.g., ["#shorts", "#gta6", "#gaming"]).
4. "pinned_comment": An engaging question asking viewers their opinion to drive comment section activity.
5. "attribution_credit": Professional fair-use attribution credit mentioning the source channel/title.

Respond with strictly valid JSON only:
{{
  "title": "Travis Scott & Kodak Black in GTA 6?! #shorts",
  "description": "Rockstar hidden details reveal real rap legends might be appearing in GTA 6. Look closely at these leaked screenshots!",
  "hashtags": ["#shorts", "#gta6", "#gaming", "#kodakblack", "#travisscott"],
  "pinned_comment": "Did you spot Travis Scott in the trailer? What other artists do you want in GTA 6? 👇",
  "attribution_credit": "Source footage: {source_title} by {source_channel}. Used under transformative fair use for commentary and educational review."
}}
"""


async def package_clip(
    clip_id: str,
    *,
    provider_name: str | None = None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    """Generate high-CTR title, SEO description, hashtags, and fair-use credits for a clip.

    Args:
        clip_id: ID of the clip to package.
        provider_name: Optional LLM provider override ('gemini', 'anthropic', 'ollama').
        settings: Optional application settings.

    Returns:
        Structured packaging dictionary ready to copy-paste into YouTube Studio.
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
    source_channel = getattr(source, "channel", None) or "Original Creator"
    source_url = getattr(source, "url", None) or ""

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

    chosen_provider = provider_name
    if not chosen_provider:
        from ..config import get_secret

        claude_key = get_secret("anthropic", settings)
        chosen_provider = "anthropic" if claude_key else "gemini"

    provider = build_provider(chosen_provider, settings)
    log.info("Generating publishing package for clip %s using %s", clip_id, provider.name)

    prompt = PACKAGING_PROMPT.format(
        source_title=source_title,
        source_channel=source_channel,
        source_url=source_url,
        clip_title=clip.title,
        clip_hook=clip.hook,
        duration_s=clip.end_s - clip.start_s,
        dialogue=dialogue,
    )

    from ..providers.base import DetectionConfig

    config = DetectionConfig(temperature=0.4)
    system = "You are a viral YouTube Shorts packaging assistant. Output strictly valid JSON only."

    raw_response = await provider._complete(system, prompt, config)

    try:
        clean = raw_response.strip()
        if clean.startswith("```json"):
            clean = clean.removeprefix("```json").removesuffix("```").strip()
        elif clean.startswith("```"):
            clean = clean.removeprefix("```").removesuffix("```").strip()
        data = json.loads(clean)
        pkg = PackagingResult(**data)
    except Exception as exc:
        log.warning("Packaging JSON parse failed (%s); raw: %s", exc, raw_response)
        pkg = PackagingResult(
            title=f"{clip.title} #shorts",
            description=f"Interesting breakdown from {source_title}. Check out this moment!",
            hashtags=["#shorts", "#viral", "#highlights"],
            pinned_comment="What do you think about this? Let us know below! 👇",
            attribution_credit=f"Source footage courtesy of {source_channel} ({source_title}). Transformative commentary.",
        )

    # Save to workspace metadata directory if export exists
    package_dict = pkg.model_dump()
    save_path = workspace.root / f"package_{clip.id}.json"
    save_path.write_text(json.dumps(package_dict, indent=2), encoding="utf-8")

    return {
        "clip_id": clip.id,
        "package": package_dict,
        "saved_to": str(save_path),
    }
