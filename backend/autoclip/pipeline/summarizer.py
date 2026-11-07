"""Summarized B-Roll Creator (Pipeline 2) for AutoClip.

Transforms long-form videos into high-retention, transformative 45-60s Shorts.
Extracts relevant scenes from the uploaded video as visual B-roll cuts, overlays
an engaging neural commentary voiceover with word-accurate Hormozi animated captions,
and evades Content ID matching.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from .. import paths
from ..config import ExportSettings, load as load_settings
from ..db import store
from ..db.models import Clip, Export, new_id
from ..pipeline import captions as captions_module
from ..pipeline import ffmpeg, tts
from ..pipeline.export import (
    AUDIO_BITRATE,
    AUDIO_SAMPLE_RATE,
    ExportError,
    encoder_args,
    ratio_dimensions,
    slugify_title,
)
from ..pipeline.runner import JobWorkspace
from ..pipeline.transcript import Transcript, Word
from ..providers import build_provider

log = logging.getLogger(__name__)


class BrollBeat(BaseModel):
    """One narrative beat with spoken commentary and source video B-roll timestamps."""

    narration: str = Field(description="Spoken commentary for this beat (1-2 sentences)")
    broll_start_s: float = Field(description="Start time in seconds in source video for visual B-roll")
    broll_end_s: float = Field(description="End time in seconds in source video for visual B-roll")


class SummaryScript(BaseModel):
    """Complete structured breakdown script for a B-roll Short."""

    angle_title: str = Field(default="Primary Angle", description="Creative angle (e.g. 'High Hype', 'Shock Factor', 'Story Progression')")
    title: str = Field(description="High-CTR YouTube Shorts title under 60 characters with #shorts")
    hook: str = Field(description="Curiosity opening hook sentence")
    beats: list[BrollBeat] = Field(description="4 to 6 sequential narrative beats")


class MultiScriptResponse(BaseModel):
    scripts: list[SummaryScript] = Field(description="3 distinct creative script angles")


@dataclass
class SummarizeResult:
    """Outcome of a summarized B-roll Short generation."""

    export_id: str
    clip_id: str
    job_id: str
    title: str
    hook: str
    script: str
    beats_count: int
    path: Path
    filename: str
    voice: str
    duration_s: float
    size_bytes: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "export_id": self.export_id,
            "clip_id": self.clip_id,
            "job_id": self.job_id,
            "title": self.title,
            "hook": self.hook,
            "script": self.script,
            "beats_count": self.beats_count,
            "path": str(self.path),
            "filename": self.filename,
            "voice": self.voice,
            "duration_s": round(self.duration_s, 2),
            "size_bytes": self.size_bytes,
            "download_url": f"/api/exports/{self.export_id}/download",
        }


def format_transcript_for_prompt(transcript: Transcript, max_chars: int = 45000) -> str:
    """Group words into ~15-20s timestamped blocks for clear, contextual LLM prompting."""
    if not transcript.words:
        return ""
    blocks: list[str] = []
    current: list[str] = []
    block_start = transcript.words[0].start
    for w in transcript.words:
        current.append(w.text)
        if w.end - block_start >= 20.0 or (w.ends_sentence and w.end - block_start >= 10.0):
            m1, s1 = divmod(int(block_start), 60)
            m2, s2 = divmod(int(w.end), 60)
            blocks.append(f"[{m1:02d}:{s1:02d} - {m2:02d}:{s2:02d}] " + " ".join(current))
            current = []
            block_start = w.end
    if current:
        m1, s1 = divmod(int(block_start), 60)
        m2, s2 = divmod(int(transcript.words[-1].end), 60)
        blocks.append(f"[{m1:02d}:{s1:02d} - {m2:02d}:{s2:02d}] " + " ".join(current))

    joined = "\n".join(blocks)
    if len(joined) > max_chars:
        joined = joined[:max_chars] + "\n... [transcript truncated for length]"
    return joined


def build_summarize_prompt(
    source_title: str,
    source_duration_s: float,
    formatted_transcript: str,
    instructions: str = "",
    target_duration: int = 60,
) -> str:
    """Construct a high-retention 3rd-person hype commentary prompt for Gemini or Claude."""
    user_inst = instructions.strip() or "Extract and summarize the most viral, shocking, or exciting storyline."
    
    # Calculate recommended beats & word count for target duration (60-90s+)
    if target_duration >= 85:
        beats_guidance = "8 to 12 sequential narrative beats"
        word_count = "240 to 300 words total"
    elif target_duration >= 60:
        beats_guidance = "6 to 8 sequential narrative beats"
        word_count = "180 to 240 words total"
    else:
        beats_guidance = "5 to 6 sequential narrative beats"
        word_count = "140 to 180 words total"

    return f"""You are an elite YouTube Shorts storyteller, viral commentator, and video editor.
Your task is to transform this long-form video into an engaging, high-retention {target_duration}-second YouTube Short using visual B-roll cuts and hype commentary.

Source Video Context:
Title: {source_title}
Duration: {source_duration_s:.1f}s

Topic / Focus Guidance:
{user_inst}

Full Timestamped Transcript:
\"\"\"
{formatted_transcript}
\"\"\"

CRITICAL SCRIPTING RULES:
1. MANDATORY ESTABLISHING INTRO HOOK IN BEAT 1 (STRICT):
   - Beat 1 MUST BE THE INTRO HOOK that explains what the video is about and hooks the viewer!
   - NEVER start abruptly with "First..." or jump straight into the middle of the story without context!
   - Beat 1 Narration MUST introduce the creator, the extreme premise, and the massive stakes in high-energy hype commentary.
     * Example: "MrBeast just tested the world's cheapest one-dollar boat against a mind-blowing ONE BILLION dollar mega-ship, and what happened is completely insane!"
   - Beat 1 B-Roll: MUST use the most visually stunning establishing shot from the video (e.g. wide exterior of the mega yacht or opening spectacle).
   - Subsequent Beats (Beats 2, 3, 4...): Then take the viewer through the narrative progression step-by-step.
   - Final Beat: End with a punchy conclusion or call to action.
2. NARRATOR PERSPECTIVE (STRICT):
   - You MUST speak from a THIRD-PERSON HYPE COMMENTARY / VIDEO ESSAYIST PERSPECTIVE (like a high-energy documentary host or viral reaction commentator).
   - NEVER speak in first-person ("I", "we", "our", "us"). The creators/hosts are the subjects of the story, NOT the narrator!
   - BAD (FORBIDDEN): "We bought a boat for one dollar then we upgraded to a yacht."
   - GOOD: "MrBeast literally just bought a one dollar yacht, and look how fast it started sinking!"
   - GOOD: "Watch what happens when he steps onto this luxury mega ship with its own helicopter pad!"
3. PACING & DURATION:
   - Target total duration: ~{target_duration} seconds ({beats_guidance}).
   - Spoken narration must be fast-paced, punchy, and curiosity-driven ({word_count}).
4. ACCURATE B-ROLL TIMESTAMPS:
   - For every beat, specify the EXACT "broll_start_s" and "broll_end_s" in seconds from the transcript above where that visual actually occurs.
   - Each B-roll cut should be between 4 and 10 seconds long.
   - Ensure 0.0 <= broll_start_s < broll_end_s <= {source_duration_s:.1f}.

Respond with ONLY a raw JSON object (no markdown code blocks, no explanation text) matching this schema:
{{
  "title": "High-CTR title with #shorts under 60 chars",
  "hook": "Curiosity opening sentence in 3rd person",
  "beats": [
    {{
      "narration": "Third-person hype sentence...",
      "broll_start_s": 15.0,
      "broll_end_s": 22.0
    }}
  ]
}}"""


async def plan_summary_script(
    job_id: str,
    instructions: str = "",
    target_duration: int = 60,
    provider_name: str | None = None,
) -> SummaryScript:
    """Generate an AI breakdown script with visual B-roll citations from the video."""
    settings = load_settings()
    job = await asyncio.to_thread(store.get_job, job_id)
    if job is None:
        raise ValueError(f"Job {job_id} not found.")

    source = await asyncio.to_thread(store.get_source, job.source_id)
    if source is None:
        raise ValueError(f"Source for job {job_id} not found.")

    workspace = JobWorkspace(job_id)
    if not workspace.transcript.exists():
        raise ValueError("Transcript not found for this job.")

    transcript = await asyncio.to_thread(Transcript.load, workspace.transcript)
    formatted_transcript = format_transcript_for_prompt(transcript)

    provider_name = provider_name or settings.active_provider

    try:
        provider = build_provider(provider_name, settings)
        status = await provider.health_check()
        if status.available:
            from ..providers.base import DetectionConfig
            config = DetectionConfig(temperature=0.4)
            prompt = build_summarize_prompt(
                source_title=source.title,
                source_duration_s=source.duration_s,
                formatted_transcript=formatted_transcript,
                instructions=instructions,
                target_duration=target_duration,
            )
            raw = await provider._complete(
                "You are an expert YouTube Shorts creator.",
                prompt,
                config,
            )
            from ..providers.base import extract_json_object
            data = extract_json_object(raw)
            parsed = SummaryScript.model_validate(data)
            if parsed.beats:
                return parsed
    except Exception as exc:
        log.warning("AI summary script planning failed (%s); using heuristic fallback", exc)

    # Heuristic fallback: create beats from transcript quarters
    dur = source.duration_s or 60.0
    quarter = dur / 4.0
    return SummaryScript(
        title=f"The Truth About {source.title[:35]} #shorts",
        hook=f"Look what happened during {source.title[:30]}!",
        beats=[
            BrollBeat(
                narration=f"Notice how the entire situation started in {source.title[:25]}.",
                broll_start_s=round(quarter * 0.2, 1),
                broll_end_s=round(quarter * 0.2 + 8.0, 1),
            ),
            BrollBeat(
                narration="Watch closely as things suddenly escalate out of control.",
                broll_start_s=round(quarter * 1.2, 1),
                broll_end_s=round(quarter * 1.2 + 8.0, 1),
            ),
            BrollBeat(
                narration="Nobody on set expected this next reveal to actually happen.",
                broll_start_s=round(quarter * 2.2, 1),
                broll_end_s=round(quarter * 2.2 + 8.0, 1),
            ),
            BrollBeat(
                narration="Drop a comment if you caught this crazy moment!",
                broll_start_s=round(quarter * 3.1, 1),
                broll_end_s=round(quarter * 3.1 + 8.0, 1),
            ),
        ],
    )


async def create_broll_short(
    job_id: str,
    *,
    instructions: str = "",
    target_duration: int = 60,
    script: SummaryScript | None = None,
    provider_name: str | None = None,
    voice: str = "narrator",
    rate: str = "+15%",
    caption_style: str = "hormozi",
    ambient_volume: float = 0.0,
    ratio: str = "9:16",
    export_settings: ExportSettings | None = None,
) -> SummarizeResult:
    """Create a high-retention B-roll Short from a source video.

    Args:
        job_id: Identifier of the processed job.
        instructions: User prompt/guidance for summary (e.g. '5 biggest changes').
        script: Optional pre-planned SummaryScript. If None, generated via AI.
        voice: Voice preset ('narrator', 'energetic', 'storyteller', etc.).
        rate: Speed modifier for voiceover (default '+15%').
        caption_style: Caption style preset ('hormozi', 'neon_gold', 'bold_pop').
        ambient_volume: Volume of original video background audio (default 0.0 = completely muted).
        ratio: Target aspect ratio ('9:16', '1:1', '16:9').
        export_settings: Video/audio settings.

    Returns:
        SummarizeResult with the new clip ID, export record, and rendered MP4.
    """
    settings = load_settings()
    export_cfg = export_settings or settings.export

    job = await asyncio.to_thread(store.get_job, job_id)
    if job is None:
        raise ValueError(f"Job {job_id} not found.")

    source = await asyncio.to_thread(store.get_source, job.source_id)
    if source is None:
        raise ValueError(f"Source for job {job_id} not found.")

    workspace = JobWorkspace(job_id)
    broll_work_dir = workspace.root / "broll_summaries" / new_id()
    broll_work_dir.mkdir(parents=True, exist_ok=True)

    # 1. Script Planning
    if script is None:
        script = await plan_summary_script(
            job_id,
            instructions=instructions,
            target_duration=target_duration,
            provider_name=provider_name,
        )

    if not script.beats:
        raise ValueError("Script contains no narrative beats.")

    # 2. Voiceover Synthesis
    # Synthesize each beat to get individual beat durations and words
    beat_durations: list[float] = []
    combined_words: list[Word] = []
    full_narration_parts = []
    current_time_offset = 0.0

    beat_audio_files: list[Path] = []
    for idx, beat in enumerate(script.beats):
        clean_text = beat.narration.strip()
        full_narration_parts.append(clean_text)
        beat_audio_path = broll_work_dir / f"beat_{idx}.mp3"
        tts_res = await tts.synthesize_speech(clean_text, beat_audio_path, voice=voice, rate=rate)
        beat_durations.append(tts_res.duration_s)
        beat_audio_files.append(tts_res.audio_path)

        for w in tts_res.words:
            combined_words.append(
                Word(
                    text=w.text,
                    start=round(current_time_offset + w.start, 3),
                    end=round(current_time_offset + w.end, 3),
                )
            )
        current_time_offset += tts_res.duration_s

    total_duration_s = current_time_offset

    # Concatenate all beat audio files into one voiceover track
    full_vo_path = broll_work_dir / "full_voiceover.mp3"
    concat_list_file = broll_work_dir / "audio_concat.txt"
    with open(concat_list_file, "w", encoding="utf-8") as f:
        for p in beat_audio_files:
            f.write(f"file '{p.resolve().as_posix()}'\n")

    ffmpeg.run([
        "-f", "concat",
        "-safe", "0",
        "-i", str(concat_list_file),
        "-c", "copy",
        "-y",
        str(full_vo_path),
    ])

    # 3. Generate Animated ASS Subtitles
    out_w, out_h = ratio_dimensions(ratio)
    style = captions_module.get_style(caption_style)
    ass_path = captions_module.write_ass(
        broll_work_dir / "captions.ass",
        combined_words,
        style,
        width=out_w,
        height=out_h,
        time_offset_s=0.0,
    )
    render_cwd, subtitle_name, fonts_name = ffmpeg.relative_filter_workspace(
        ass_path, captions_module.FONT_DIR
    )

    # 4. Construct Multi-Beat B-Roll Video Filtergraph
    # Edge-to-edge native vertical framing (1080x1920 full bleed, no letterboxing or blur bars)
    input_args: list[str] = []
    filter_parts: list[str] = []
    v_labels: list[str] = []

    # Input 0: Full voiceover audio
    input_args.extend(["-i", str(full_vo_path)])

    # Inputs 1 to N: Source video slices for each beat
    source_path = Path(source.path)
    for idx, beat in enumerate(script.beats):
        beat_dur = beat_durations[idx]
        b_start = max(0.0, min(source.duration_s - 1.0, beat.broll_start_s))
        input_index = idx + 1

        input_args.extend([
            "-ss", f"{b_start:.3f}",
            "-t", f"{beat_dur:.3f}",
            "-i", str(source_path),
        ])

        # Full-screen edge-to-edge 9:16 crop for this beat (Zero letterboxing)
        lbl = f"v{idx}"
        v_labels.append(f"[{lbl}]")
        filter_parts.append(
            f"[{input_index}:v]scale={out_w}:{out_h}:force_original_aspect_ratio=increase:flags=lanczos,"
            f"crop={out_w}:{out_h},setsar=1,format=yuv420p[{lbl}]"
        )

    # Concat all B-roll video segments
    filter_parts.append(f"{''.join(v_labels)}concat=n={len(script.beats)}:v=1:a=0[vcat]")
    # Burn animated captions
    filter_parts.append(f"[vcat]ass=filename={subtitle_name}:fontsdir={fonts_name}[vout]")

    # Audio Filter: Voiceover is primary, ambient background from first beat or muted
    if source.has_audio and ambient_volume > 0.0:
        filter_parts.append(
            f"[1:a]volume={ambient_volume:.2f}[ambient_a];"
            f"[0:a][ambient_a]amix=inputs=2:duration=first:dropout_transition=0.2,"
            f"loudnorm=I={export_cfg.loudness_lufs}:TP=-1.5:LRA=11[aout]"
        )
    else:
        filter_parts.append(f"[0:a]loudnorm=I={export_cfg.loudness_lufs}:TP=-1.5:LRA=11[aout]")

    filter_complex = ";".join(filter_parts)

    # 5. Output Destination
    destination = (
        paths.exports_dir()
        / job_id
        / f"{slugify_title(script.title)}_broll_summary_{ratio.replace(':', 'x')}.mp4"
    )
    destination.parent.mkdir(parents=True, exist_ok=True)

    args = [
        *input_args,
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-map", "[aout]",
        *encoder_args(export_cfg),
        "-pix_fmt", "yuv420p",
        "-colorspace", "bt709",
        "-color_primaries", "bt709",
        "-color_trc", "bt709",
        "-color_range", "tv",
        "-c:a", "aac",
        "-b:a", AUDIO_BITRATE,
        "-ar", str(AUDIO_SAMPLE_RATE),
        "-movflags", "+faststart",
        "-y",
        str(destination),
    ]

    try:
        await asyncio.to_thread(
            ffmpeg.run,
            args,
            total_duration_s=total_duration_s,
            cwd=render_cwd,
        )
    except ffmpeg.FFmpegError as exc:
        raise ExportError(f"Could not render B-roll Short {destination.name}.\n{exc}") from exc

    if not destination.exists() or destination.stat().st_size == 0:
        raise ExportError(f"ffmpeg reported success but {destination.name} is empty.")

    # 6. Create Database Clip & Export Records
    clip_id = new_id()
    new_clip = Clip(
        id=clip_id,
        job_id=job_id,
        start_s=0.0,
        end_s=total_duration_s,
        rank=99,
        title=script.title,
        hook=script.hook,
        score=95,
        reason=f"Summarized B-Roll Short ({len(script.beats)} visual beats)",
        status="exported",
    )
    await asyncio.to_thread(store.create_clip, new_clip)

    export_record = Export(
        id=new_id(),
        clip_id=clip_id,
        path=str(destination),
        ratio=ratio,
        style=style.key,
        size_bytes=destination.stat().st_size,
        job_id=job_id,
        pipeline_type="pipeline_2",
        title=script.title,
        script_json=script.model_dump_json(),
    )
    await asyncio.to_thread(store.create_export, export_record)

    log.info(
        "Successfully generated B-Roll Short '%s' (%.1fs, %d beats) -> %s",
        script.title,
        total_duration_s,
        len(script.beats),
        destination.name,
    )

    return SummarizeResult(
        export_id=export_record.id,
        clip_id=clip_id,
        job_id=job_id,
        title=script.title,
        hook=script.hook,
        script=" ".join(full_narration_parts),
        beats_count=len(script.beats),
        path=destination,
        filename=destination.name,
        voice=voice,
        duration_s=total_duration_s,
        size_bytes=destination.stat().st_size,
    )

async def plan_multi_summary_scripts(
    job_id: str,
    instructions: str = "",
    target_duration: int = 60,
    count: int = 3,
    provider_name: str | None = None,
) -> list[SummaryScript]:
    """Generate multiple distinct creative script angles for a job (default 3 options)."""
    settings = load_settings()
    job = await asyncio.to_thread(store.get_job, job_id)
    if job is None:
        raise ValueError(f"Job {job_id} not found.")

    source = await asyncio.to_thread(store.get_source, job.source_id)
    if source is None:
        raise ValueError(f"Source for job {job_id} not found.")

    workspace = JobWorkspace(job_id)
    if not workspace.transcript.exists():
        raise ValueError("Transcript not found for this job.")

    transcript = await asyncio.to_thread(Transcript.load, workspace.transcript)
    formatted_transcript = format_transcript_for_prompt(transcript)

    provider_name = provider_name or settings.active_provider

    prompt = f"""You are an elite YouTube Shorts storyteller and viral director.
Transform this long-form video into {count} DISTINCT creative YouTube Short script options ({target_duration}s each).

Source Video:
Title: {source.title}
Duration: {source.duration_s:.1f}s

User Guidance:
{instructions.strip() or 'Create 3 diverse, high-retention storytelling angles.'}

CRITICAL DURATION & WORD COUNT REQUIREMENT (MANDATORY):
- Target duration is {target_duration} seconds (YouTube Shorts allows 60 to 90+ seconds).
- Each script MUST contain between 180 and 240 spoken words total across all beats!
- Each script MUST have 6 to 8 distinct narrative beats (DO NOT generate only 3 or 4 beats!).
- Beat 1 MUST be an establishing INTRO HOOK explaining what the video is about in high-energy 3rd person commentary.
- Thoroughly cover 6 to 8 escalating moments across the video so the Short runs a full 60 to 90 seconds!

Transcript:
[TRANSCRIPT START]
{formatted_transcript}
[TRANSCRIPT END]

Create {count} distinct angles:
1. Option 1: "Viral Hype & Extreme Energy" (fast paced, crazy stakes)
2. Option 2: "Shock Factor & Numbers" (unbelievable contrasts, prices, escalation)
3. Option 3: "Story Progression & Mystery" (narrative arc, build-up, punchy reveal)

Output JSON format:
{{
  "scripts": [
    {{
      "angle_title": "Viral Hype & Extreme Energy",
      "title": "Viral YouTube Shorts Title #shorts",
      "hook": "Spoken curiosity opening hook",
      "beats": [
        {{"narration": "Intro hook commentary...", "broll_start_s": 10.0, "broll_end_s": 15.0}},
        {{"narration": "Next beat commentary...", "broll_start_s": 25.0, "broll_end_s": 32.0}}
      ]
    }}
  ]
}}
    """

    scripts: list[SummaryScript] = []
    try:
        provider = build_provider(provider_name, settings)
        status = await provider.health_check()
        if status.available:
            from ..providers.base import DetectionConfig, extract_json_object
            config = DetectionConfig(temperature=0.6)
            raw = await provider._complete("You are an expert YouTube Shorts creator.", prompt, config)
            data = extract_json_object(raw)
            parsed = MultiScriptResponse.model_validate(data)
            if parsed.scripts:
                scripts = parsed.scripts
    except Exception as exc:
        log.warning("Multi-script generation failed (%s); falling back to single script.", exc)

    if not scripts:
        single = await plan_summary_script(job_id, instructions, target_duration, provider_name)
        scripts = [single]

    # Save all scripts to database under job_id
    from ..db.models import JobScript, new_id
    for idx, s in enumerate(scripts):
        js = JobScript(
            id=new_id(),
            job_id=job_id,
            version=1,
            pipeline_type="pipeline_2",
            angle_title=s.angle_title or f"Option {idx+1}",
            title=s.title,
            hook=s.hook,
            script_json=s.model_dump_json(),
            source_agent=provider_name or "gemini",
            feedback="",
        )
        await asyncio.to_thread(store.create_job_script, js)

    return scripts


async def iterate_summary_script(
    job_id: str,
    previous_script_id: str | None = None,
    previous_script_data: dict[str, Any] | None = None,
    feedback: str = "",
    target_duration: int = 60,
    provider_name: str | None = None,
) -> SummaryScript:
    """Generate an improved script iteration incorporating user feedback."""
    settings = load_settings()
    job = await asyncio.to_thread(store.get_job, job_id)
    if job is None:
        raise ValueError(f"Job {job_id} not found.")

    source = await asyncio.to_thread(store.get_source, job.source_id)
    workspace = JobWorkspace(job_id)
    transcript = await asyncio.to_thread(Transcript.load, workspace.transcript)
    formatted_transcript = format_transcript_for_prompt(transcript)

    prev_script_dict = previous_script_data
    prev_version = 1
    if previous_script_id:
        stored_script = await asyncio.to_thread(store.get_job_script, previous_script_id)
        if stored_script:
            import json
            prev_script_dict = json.loads(stored_script.script_json)
            prev_version = stored_script.version

    if not prev_script_dict:
        # Fallback to generating a fresh one
        return await plan_summary_script(job_id, instructions=feedback, target_duration=target_duration, provider_name=provider_name)

    provider_name = provider_name or settings.active_provider

    prompt = f"""You are an elite YouTube Shorts storyteller and video editor.
The user reviewed the previous Short script and provided feedback for an improved iteration.

Source Video Context:
Title: {source.title if source else 'Video'}

Full Timestamped Transcript:
[TRANSCRIPT START]
{formatted_transcript}
[TRANSCRIPT END]

PREVIOUS SCRIPT VERSION:
{json.dumps(prev_script_dict, indent=2)}

USER FEEDBACK & CRITIQUE:
"{feedback}"

Generate an IMPROVED, REVISED script addressing the user's feedback precisely.
Maintain accurate visual B-roll timestamps from the transcript, ensure Beat 1 is a viral establishing intro hook, and keep total commentary between 130-170 words ({target_duration}s).

Output JSON format:
{{
  "angle_title": "Revised Iteration",
  "title": "Updated High-CTR Title #shorts",
  "hook": "Revised Spoken Curiosity Hook",
  "beats": [
    {{"narration": "...", "broll_start_s": 0.0, "broll_end_s": 5.0}}
  ]
}}
    """

    provider = build_provider(provider_name, settings)
    from ..providers.base import DetectionConfig, extract_json_object
    config = DetectionConfig(temperature=0.5)
    raw = await provider._complete("You are an expert YouTube Shorts creator.", prompt, config)
    data = extract_json_object(raw)
    revised = SummaryScript.model_validate(data)

    # Save new version to database
    from ..db.models import JobScript, new_id
    import json
    js = JobScript(
        id=new_id(),
        job_id=job_id,
        version=prev_version + 1,
        pipeline_type="pipeline_2",
        angle_title=revised.angle_title or "Revised Iteration",
        title=revised.title,
        hook=revised.hook,
        script_json=revised.model_dump_json(),
        source_agent=provider_name or "claude",
        feedback=feedback,
    )
    await asyncio.to_thread(store.create_job_script, js)

    return revised
