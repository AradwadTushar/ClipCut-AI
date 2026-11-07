"""AutoClip Model Context Protocol (MCP) Server.

Enables Claude Desktop, Antigravity IDE, and other MCP clients to control
the local AutoClip video clipping pipeline through stdio tools.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from mcp.server.mcpserver import MCPServer

from .. import db, paths
from ..config import load as load_settings
from ..db import store
from ..db.models import Clip, Export, Job, Source, Transcript as DbTranscript, new_id
from ..pipeline import captions as captions_module
from ..pipeline import export as export_module
from ..pipeline import highlights, ingest, prepare, runner, transcribe
from ..pipeline.reframe import CropPath, ReframeConfig, build_crop_path
from ..pipeline.runner import JobWorkspace
from ..pipeline.transcript import Transcript, Word
from ..providers import DetectionConfig, build_provider

# CRITICAL: stdio MCP servers must NOT log to stdout as it corrupts JSON-RPC messages.
logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("autoclip.mcp")


def create_mcp_server() -> MCPServer:
    """Construct and configure the AutoClip MCP Server."""
    paths.ensure_layout()
    db.init()

    mcp = MCPServer("autoclip-studio")

    @mcp.tool()
    async def analyze_video(video_path: str) -> dict[str, Any]:
        """Inspect and register a local video file or YouTube URL for clipping.

        Args:
            video_path: Absolute local file path (e.g. 'C:/videos/podcast.mp4')
                or YouTube URL (e.g. 'https://youtu.be/...').

        Returns:
            Video metadata (duration, resolution, fps, audio) and the assigned job_id.
        """
        settings = load_settings()
        is_url = video_path.startswith("http://") or video_path.startswith("https://")

        if is_url:
            log.info("Ingesting YouTube URL: %s", video_path)
            source = await asyncio.to_thread(ingest.ingest_youtube, video_path, settings.ingest)
        else:
            file_path = Path(video_path).resolve()
            if not file_path.exists():
                raise FileNotFoundError(f"Video file not found: {video_path}")
            log.info("Ingesting local file: %s", file_path)
            source = await asyncio.to_thread(ingest.ingest_file, file_path)

        await asyncio.to_thread(store.create_source, source)

        job = Job(
            id=new_id(),
            source_id=source.id,
            provider=settings.active_provider,
            settings=settings.model_dump(mode="json"),
        )
        await asyncio.to_thread(store.create_job, job)

        suggested_clips = max(1, min(10, int(source.duration_s / 60)))

        return {
            "job_id": job.id,
            "source_id": source.id,
            "title": source.title,
            "duration_s": round(source.duration_s, 2),
            "duration_formatted": f"{int(source.duration_s // 60)}m {int(source.duration_s % 60)}s",
            "resolution": f"{source.width}x{source.height}",
            "fps": round(source.fps, 2),
            "has_audio": bool(source.has_audio),
            "has_video": bool(source.has_video),
            "suggested_clips": suggested_clips,
            "status": "ready_for_transcription",
        }

    @mcp.tool()
    async def transcribe_video(job_id: str) -> dict[str, Any]:
        """Transcribe the video audio to word-level timestamps using GPU-accelerated Whisper.

        Args:
            job_id: The job ID returned by analyze_video.

        Returns:
            Transcript summary including language, word count, and segment count.
        """
        job = await asyncio.to_thread(store.get_job, job_id)
        if job is None:
            raise ValueError(f"Job not found: {job_id}")

        source = await asyncio.to_thread(store.get_source, job.source_id)
        if source is None:
            raise ValueError(f"Source not found for job: {job_id}")

        settings = load_settings()
        workspace = JobWorkspace(job.id)

        # 1. Prepare audio
        source_path = Path(source.path)
        if not workspace.audio.exists() or workspace.audio.stat().st_size == 0:
            log.info("Extracting audio for job %s", job_id)
            await asyncio.to_thread(
                prepare.extract_audio,
                source_path,
                workspace.audio,
                duration_s=source.duration_s,
            )

        if source.has_video and not workspace.thumbnails.exists():
            await asyncio.to_thread(prepare.generate_thumbnails, source_path, workspace.thumbnails)

        # 2. Transcribe
        log.info("Transcribing audio for job %s", job_id)
        if workspace.transcript.exists() and workspace.transcript.stat().st_size > 0:
            log.info("Transcript already exists on disk for job %s, loading cached transcript", job_id)
            transcript = await asyncio.to_thread(Transcript.load, workspace.transcript)
        else:
            transcript = await asyncio.to_thread(
                transcribe.transcribe,
                workspace.audio,
                settings.whisper,
                duration_s=source.duration_s,
            )
            transcript.save(workspace.transcript)

        await asyncio.to_thread(
            store.upsert_transcript,
            DbTranscript(
                job_id=job.id,
                json_path=str(workspace.transcript),
                language=transcript.language,
                model=transcript.model,
                has_diarization=transcript.has_diarization,
                word_count=len(transcript.words),
                source=transcript.source,
            ),
        )

        await asyncio.to_thread(store.update_job, job_id, current_stage="transcribe", progress=0.4)

        return {
            "job_id": job.id,
            "language": transcript.language,
            "word_count": len(transcript.words),
            "segment_count": len(transcript.segments),
            "sample_text": " ".join(w.text for w in transcript.words[:40]) + "...",
            "status": "ready_for_candidates",
        }

    @mcp.tool()
    async def generate_candidates(
        job_id: str,
        target_count: int = 5,
        min_duration_s: float = 20.0,
        max_duration_s: float = 60.0,
        provider: str = "",
    ) -> dict[str, Any]:
        """Detect high-retention, viral candidate moments from the transcript.

        Args:
            job_id: The job ID.
            target_count: Desired number of candidate highlights (default: 5).
            min_duration_s: Minimum clip length in seconds (default: 20.0).
            max_duration_s: Maximum clip length in seconds (default: 60.0).
            provider: Optional AI provider override ('gemini', 'anthropic', 'ollama').

        Returns:
            List of candidate clips with hooks, virality scores, rationale, and timestamps.
        """
        job = await asyncio.to_thread(store.get_job, job_id)
        if job is None:
            raise ValueError(f"Job not found: {job_id}")

        workspace = JobWorkspace(job.id)
        if not workspace.transcript.exists():
            raise ValueError(f"No transcript found for job {job_id}. Run transcribe_video first.")

        transcript = await asyncio.to_thread(Transcript.load, workspace.transcript)

        # Detect silences
        silences = []
        if workspace.silences.exists():
            raw = json.loads(workspace.silences.read_text(encoding="utf-8"))
            silences = [prepare.Silence(**item) for item in raw]
        else:
            silences = await asyncio.to_thread(prepare.detect_silences, workspace.audio)
            workspace.silences.write_text(
                json.dumps([{"start": s.start, "end": s.end} for s in silences]),
                encoding="utf-8",
            )

        settings = load_settings()
        active_provider_name = provider or job.provider or settings.active_provider
        prov = build_provider(active_provider_name, settings)

        config = DetectionConfig(
            min_duration_s=min_duration_s,
            max_duration_s=max_duration_s,
            max_clips=target_count,
        )

        log.info("Detecting highlights with provider: %s", prov.name)
        clips = await highlights.detect(
            transcript,
            prov,
            config,
            job_id=job.id,
            silences=silences,
        )

        await asyncio.to_thread(store.replace_clips, job.id, clips)
        await asyncio.to_thread(store.update_job, job.id, current_stage="highlights", progress=0.55)

        candidates = [
            {
                "id": c.id,
                "rank": c.rank,
                "title": c.title,
                "hook": c.hook,
                "score": c.score,
                "start_s": round(c.start_s, 2),
                "end_s": round(c.end_s, 2),
                "duration_s": round(c.end_s - c.start_s, 2),
                "reason": c.reason,
            }
            for c in clips
        ]

        return {
            "job_id": job.id,
            "candidate_count": len(candidates),
            "provider": prov.name,
            "candidates": candidates,
        }

    @mcp.tool()
    async def review_candidates(
        job_id: str,
        candidate_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        """Retrieve detailed candidate clip data, dialogue text, and virality analysis for AI review.

        Args:
            job_id: The job ID.
            candidate_ids: Optional list of clip IDs to inspect. If omitted, returns all candidates.

        Returns:
            Detailed candidate data including spoken words, virality score, and hook rationale.
        """
        all_clips = await asyncio.to_thread(store.list_clips, job_id)
        if not all_clips:
            raise ValueError(f"No clips found for job {job_id}. Run generate_candidates first.")

        workspace = JobWorkspace(job_id)
        transcript = (
            await asyncio.to_thread(Transcript.load, workspace.transcript)
            if workspace.transcript.exists()
            else None
        )

        target_ids = set(candidate_ids) if candidate_ids else None
        selected = [c for c in all_clips if (target_ids is None or c.id in target_ids)]

        reviews = []
        for c in selected:
            words_text = ""
            if transcript:
                words = transcript.slice(c.start_word, c.end_word)
                words_text = " ".join(w.text for w in words)

            reviews.append(
                {
                    "id": c.id,
                    "rank": c.rank,
                    "title": c.title,
                    "hook": c.hook,
                    "score": c.score,
                    "start_s": round(c.start_s, 2),
                    "end_s": round(c.end_s, 2),
                    "duration_s": round(c.end_s - c.start_s, 2),
                    "reason": c.reason,
                    "dialogue": words_text,
                }
            )

        return {"job_id": job_id, "reviews": reviews}

    @mcp.tool()
    async def create_clips(
        job_id: str,
        candidate_ids: list[str] | None = None,
        caption_preset: str = "hormozi",
        ratio: str = "9:16",
        layout: str = "auto",
    ) -> dict[str, Any]:
        """Render selected candidate clips into vertical 1080x1920 Shorts with animated captions.

        Args:
            job_id: The job ID.
            candidate_ids: List of clip IDs to render. If omitted, renders all candidates.
            caption_preset: Caption animation style ('hormozi', 'neon_gold', 'bold_pop', 'karaoke_fill', 'clean_lower', 'boxed'). Defaults to 'hormozi'.
            ratio: Target aspect ratio ('9:16' for YouTube Shorts/TikTok, '1:1', '16:9').
            layout: Visual framing layout ('auto' = face track or zoom_fit if no face, 'split_screen' = Facecam top 35% + Gameplay bottom 65%, 'zoom_fit' = 1.35x immersive zoom over blurred background, 'blur_fit' = unscaled 16:9 over blurred background, 'face_track' = speaker tracking, 'centre' = static center crop).

        Returns:
            List of rendered clips with export file paths, duration, and file size.
        """
        job = await asyncio.to_thread(store.get_job, job_id)
        if job is None:
            raise ValueError(f"Job not found: {job_id}")

        source = await asyncio.to_thread(store.get_source, job.source_id)
        if source is None:
            raise ValueError(f"Source not found for job: {job_id}")

        all_clips = await asyncio.to_thread(store.list_clips, job_id)
        if not all_clips:
            raise ValueError(f"No clips found for job {job_id}. Run generate_candidates first.")

        workspace = JobWorkspace(job_id)
        transcript = await asyncio.to_thread(Transcript.load, workspace.transcript)

        target_ids = set(candidate_ids) if candidate_ids else None
        clips_to_render = [c for c in all_clips if (target_ids is None or c.id in target_ids)]

        if not clips_to_render:
            raise ValueError("No matching clips found to render.")

        settings = load_settings()
        style = captions_module.PRESETS.get(caption_preset, captions_module.PRESETS["bold_pop"])

        config = ReframeConfig(
            aspect_w=9 if ratio == "9:16" else (16 if ratio == "16:9" else 1),
            aspect_h=16 if ratio == "9:16" else (9 if ratio == "16:9" else 1),
            layout=layout,
        )

        source_path = Path(source.path)
        rendered_results = []

        for clip in clips_to_render:
            log.info("Reframing and rendering clip: %s (%s) with layout=%s", clip.id, clip.title, layout)

            # Reframe
            cached_crop = workspace.crop_path(clip.id)
            if cached_crop.exists() and layout == "auto":
                crop_path = await asyncio.to_thread(CropPath.load, cached_crop)
            else:
                crop_path = await asyncio.to_thread(
                    build_crop_path,
                    source_path,
                    start_s=clip.start_s,
                    end_s=clip.end_s,
                    transcript=transcript,
                    config=config,
                )
                crop_path.save(cached_crop)

            # Output destination
            filename = export_module.output_filename(clip.title or f"clip-{clip.rank}", ratio)
            destination = paths.exports_dir() / job_id / filename

            # Words
            words = transcript.slice(clip.start_word, clip.end_word)

            req = export_module.ExportRequest(
                source=source_path,
                destination=destination,
                start_s=clip.start_s,
                end_s=clip.end_s,
                crop_path=crop_path,
                words=words,
                style=style,
                ratio=ratio,
                burn_captions=True,
            )

            await asyncio.to_thread(
                export_module.export_clip,
                req,
                work_dir=workspace.captions_dir,
                settings=settings.export,
            )

            record = Export(
                id=new_id(),
                clip_id=clip.id,
                path=str(destination),
                ratio=ratio,
                style=style.key,
                size_bytes=destination.stat().st_size if destination.exists() else 0,
                job_id=clip.job_id,
                pipeline_type="pipeline_1",
                title=clip.title,
            )
            await asyncio.to_thread(store.create_export, record)
            await asyncio.to_thread(store.update_clip, clip.id, status="exported")

            rendered_results.append(
                {
                    "clip_id": clip.id,
                    "title": clip.title,
                    "path": str(destination),
                    "file_url": f"file:///{destination.as_posix()}",
                    "size_mb": round(destination.stat().st_size / (1024 * 1024), 2),
                    "duration_s": round(clip.end_s - clip.start_s, 2),
                    "style": style.key,
                    "ratio": ratio,
                }
            )

        await asyncio.to_thread(store.update_job, job_id, current_stage="export", status="done", progress=1.0)

        return {
            "job_id": job_id,
            "rendered_count": len(rendered_results),
            "clips": rendered_results,
        }

    @mcp.tool()
    async def check_clips(
        job_id: str,
        clip_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        """Perform automated post-render Quality Assurance (QA) on exported clips.

        Validates file existence, resolution (1080x1920), video/audio streams, duration,
        and returns clickable local file links.

        Args:
            job_id: The job ID.
            clip_ids: Optional list of clip IDs to check. If omitted, checks all exports.

        Returns:
            QA status report with stream info, integrity checks, and file links.
        """
        all_clips = await asyncio.to_thread(store.list_clips, job_id)
        target_ids = set(clip_ids) if clip_ids else None
        selected = [c for c in all_clips if (target_ids is None or c.id in target_ids)]

        qa_results = []
        all_passed = True

        for c in selected:
            exports = await asyncio.to_thread(store.list_exports, c.id)
            if not exports:
                qa_results.append(
                    {
                        "clip_id": c.id,
                        "title": c.title,
                        "status": "not_exported",
                        "error": "No exports found for this clip.",
                    }
                )
                all_passed = False
                continue

            for exp in exports:
                file_path = Path(exp.path)
                if not file_path.exists() or file_path.stat().st_size == 0:
                    qa_results.append(
                        {
                            "clip_id": c.id,
                            "title": c.title,
                            "path": str(file_path),
                            "status": "missing_file",
                            "error": "Export file does not exist or is 0 bytes.",
                        }
                    )
                    all_passed = False
                    continue

                # Run ffprobe check
                cmd = [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration,size,bit_rate:stream=codec_name,width,height,r_frame_rate",
                    "-of",
                    "json",
                    str(file_path),
                ]
                try:
                    probe = await asyncio.to_thread(
                        subprocess.run,
                        cmd,
                        capture_output=True,
                        text=True,
                        check=True,
                    )
                    data = json.loads(probe.stdout)
                    streams = data.get("streams", [])
                    video_stream = next((s for s in streams if s.get("codec_name") in ("h264", "hevc")), {})
                    audio_stream = next((s for s in streams if s.get("codec_name") == "aac"), {})

                    width = video_stream.get("width")
                    height = video_stream.get("height")
                    duration = float(data.get("format", {}).get("duration", 0))

                    is_valid_9x16 = (width == 1080 and height == 1920) or (exp.ratio != "9:16")
                    has_audio = bool(audio_stream)

                    check_passed = is_valid_9x16 and has_audio and duration > 0
                    if not check_passed:
                        all_passed = False

                    qa_results.append(
                        {
                            "clip_id": c.id,
                            "title": c.title,
                            "path": str(file_path),
                            "file_url": f"file:///{file_path.as_posix()}",
                            "status": "passed" if check_passed else "failed",
                            "resolution": f"{width}x{height}",
                            "duration_s": round(duration, 2),
                            "size_mb": round(file_path.stat().st_size / (1024 * 1024), 2),
                            "video_codec": video_stream.get("codec_name"),
                            "audio_codec": audio_stream.get("codec_name"),
                            "is_9x16_standard": is_valid_9x16,
                            "has_audio_track": has_audio,
                        }
                    )
                except Exception as exc:
                    all_passed = False
                    qa_results.append(
                        {
                            "clip_id": c.id,
                            "title": c.title,
                            "path": str(file_path),
                            "status": "probe_error",
                            "error": str(exc),
                        }
                    )

        return {
            "job_id": job_id,
            "overall_status": "PASSED" if all_passed else "FAILED_CHECKS",
            "results": qa_results,
        }

    @mcp.tool()
    async def regenerate_clip(
        clip_id: str,
        start_s: float | None = None,
        end_s: float | None = None,
        caption_preset: str | None = None,
        title: str | None = None,
        ratio: str = "9:16",
        layout: str = "auto",
    ) -> dict[str, Any]:
        """Re-render a specific clip with adjusted start/end boundaries, new caption styling, or layout.

        Args:
            clip_id: The ID of the clip to re-render.
            start_s: Optional new start time in seconds.
            end_s: Optional new end time in seconds.
            caption_preset: Optional caption style ('bold_pop', 'karaoke_fill', 'clean_lower', 'boxed').
            title: Optional updated title for the clip.
            ratio: Target aspect ratio (default: '9:16').
            layout: Visual framing layout ('auto', 'split_screen', 'zoom_fit', 'blur_fit', 'face_track', 'centre').

        Returns:
            Metadata and path of the newly rendered clip.
        """
        clip = await asyncio.to_thread(store.get_clip, clip_id)
        if clip is None:
            raise ValueError(f"Clip not found: {clip_id}")

        new_start = start_s if start_s is not None else clip.start_s
        new_end = end_s if end_s is not None else clip.end_s
        new_title = title if title is not None else clip.title

        if new_end <= new_start:
            raise ValueError(f"end_s ({new_end}) must be greater than start_s ({new_start})")

        # Update clip in database
        await asyncio.to_thread(
            store.update_clip,
            clip_id,
            start_s=new_start,
            end_s=new_end,
            title=new_title,
            user_trimmed=True,
        )

        # Trigger re-render
        result = await create_clips(
            job_id=clip.job_id,
            candidate_ids=[clip_id],
            caption_preset=caption_preset or "bold_pop",
            ratio=ratio,
            layout=layout,
        )

        return {
            "clip_id": clip_id,
            "title": new_title,
            "status": "regenerated",
            "result": result.get("clips", [{}])[0] if result.get("clips") else {},
        }

    @mcp.tool()
    async def polish_candidate(
        clip_id: str,
        provider: str = "",
        apply: bool = True,
    ) -> dict[str, Any]:
        """Run Tier 2 Creative Polish on a candidate clip to optimize its title, hook lines, and trims.

        Generates 3 alternative high-CTR text hooks (curiosity, shock, action), recommends
        micro-trims for dead air, and produces a refined virality verdict. Automatically applies
        the optimized title and dead-air trims to the clip in the database when apply is True.

        Args:
            clip_id: The clip ID to polish.
            provider: Optional AI provider override ('anthropic', 'gemini'). Defaults to Claude if configured, otherwise Gemini.
            apply: Whether to automatically commit the optimized title and micro-trim boundaries to the clip database (default: True).

        Returns:
            Optimized title, 3 viral hooks, suggested trims, refined score, and retention verdict.
        """
        from ..pipeline.reviewer import polish_clip

        return await polish_clip(clip_id, tier2_provider_name=provider or None, apply=apply)

    @mcp.tool()
    async def package_candidate(
        clip_id: str,
        provider: str = "",
    ) -> dict[str, Any]:
        """Generate high-CTR title, SEO description, hashtags, pinned comment, and fair-use attribution credits.

        Creates a complete YouTube Shorts upload kit to protect against copyright claims
        and maximize algorithmic reach.

        Args:
            clip_id: The clip ID to package.
            provider: Optional AI provider override ('anthropic', 'gemini').

        Returns:
            SEO title with #shorts, description, hashtags list, pinned comment, and fair-use credit.
        """
        from ..pipeline.packaging import package_clip

        return await package_clip(clip_id, provider_name=provider or None)

    @mcp.tool()
    async def synthesize_voiceover(
        text: str,
        voice: str = "narrator",
        rate: str = "+0%",
    ) -> dict[str, Any]:
        """Synthesize neural voiceover speech with word-level subtitle timing.

        Uses Microsoft Edge Neural studio voices (zero API cost) to generate broadcast audio
        for video hooks, outro CTAs, and commentary narration.

        Args:
            text: Text to synthesize.
            voice: Voice preset ('narrator' [deep authoritative], 'energetic' [MrBeast style], 'storyteller', 'clear_female', 'vibrant_female').
            rate: Speed modifier (e.g. '+0%', '+10%').

        Returns:
            Path to generated MP3 audio, duration, and list of word-level timestamps.
        """
        import uuid
        from .. import paths
        from ..pipeline import tts

        tts_dir = paths.work_dir() / "tts"
        tts_dir.mkdir(parents=True, exist_ok=True)
        filename = f"tts_{uuid.uuid4().hex[:12]}.mp3"
        dest_path = tts_dir / filename

        result = await tts.synthesize_speech(text, dest_path, voice=voice, rate=rate)
        return {
            "audio_path": str(result.audio_path),
            "file_url": f"file:///{result.audio_path.as_posix()}",
            "duration_s": round(result.duration_s, 2),
            "word_count": len(result.words),
            "voice": result.voice,
            "words": [{"text": w.text, "start": w.start, "end": w.end} for w in result.words],
        }

    @mcp.tool()
    async def get_transcript(job_id: str) -> dict[str, Any]:
        """Retrieve the complete timestamped transcript for a video job.

        Allows Claude Desktop to read the entire dialogue with precise timestamps,
        understand the story arc, and craft viral commentary scripts or hooks.

        Args:
            job_id: The job ID to retrieve transcript for.

        Returns:
            Source video title, duration, word count, formatted timestamped transcript blocks,
            and guidance for crafting custom B-roll scripts.
        """
        from ..pipeline.summarizer import format_transcript_for_prompt

        job = await asyncio.to_thread(store.get_job, job_id)
        if job is None:
            raise ValueError(f"Job not found: {job_id}")

        source = await asyncio.to_thread(store.get_source, job.source_id)
        if source is None:
            raise ValueError(f"Source not found for job: {job_id}")

        workspace = JobWorkspace(job.id)
        if not workspace.transcript.exists():
            raise ValueError(f"Transcript has not been generated for job {job_id} yet.")

        transcript = await asyncio.to_thread(Transcript.load, workspace.transcript)
        formatted = format_transcript_for_prompt(transcript)

        return {
            "job_id": job.id,
            "title": source.title,
            "duration_s": round(source.duration_s, 2),
            "word_count": len(transcript.words),
            "transcript_blocks": formatted,
            "script_format_guidance": {
                "rule": "Write in Third-Person Hype Commentary (never use 'we/I'). Refer to creators by name.",
                "broll_timestamps": "Provide 'broll_start_s' and 'broll_end_s' matching the timestamps above.",
                "schema_example": {
                    "title": "Shocking Yacht Progression! #shorts",
                    "hook": "MrBeast literally tested boats ranging to $1 Billion!",
                    "beats": [
                        {
                            "narration": "First, he bought a yacht for one dollar and it instantly started sinking!",
                            "broll_start_s": 35.0,
                            "broll_end_s": 45.0,
                        }
                    ],
                },
            },
        }

    @mcp.tool()
    async def list_jobs(limit: int = 10) -> list[dict[str, Any]]:
        """List recent AutoClip video jobs, IDs, titles, and clip counts.

        Args:
            limit: Maximum number of jobs to return (default: 10).

        Returns:
            List of recent jobs with job_id, title, duration, status, and clip count.
        """
        jobs = await asyncio.to_thread(store.list_jobs, limit=limit)
        results = []
        for j in jobs:
            source = await asyncio.to_thread(store.get_source, j.source_id)
            clips = await asyncio.to_thread(store.list_clips, j.id)
            results.append({
                "job_id": j.id,
                "title": source.title if source else "Untitled",
                "duration_s": round(source.duration_s, 1) if source else 0.0,
                "status": j.status,
                "clips_count": len(clips),
                "created_at": str(j.created_at) if j.created_at else None,
            })
        return results

    @mcp.tool()
    async def create_hybrid_short(
        clip_id: str,
        hook_text: str | None = None,
        outro_text: str | None = None,
        voice: str = "energetic",
        rate: str = "+15%",
        hook_mode: str = "prepend_broll",
        hook_broll_start_s: float | None = None,
        hook_duck_volume: float = 0.0,
        caption_style: str = "hormozi",
        layout: str = "auto",
        ratio: str = "9:16",
    ) -> dict[str, Any]:
        """Create a Hybrid Short: AI-generated spoken hook + raw clip + optional CTA outro.

        Overlays a high-energy spoken hook in the first 2-4 seconds with source audio ducked to 0%,
        transitioning seamlessly into raw clip audio at 100% volume, with unified animated
        Hormozi captions across the whole video.

        Args:
            clip_id: ID of the clip to render.
            hook_text: Optional custom hook text (e.g. 'Look what happened when Tom Brady threw at MrBeast drone!').
            outro_text: Optional closing CTA voiceover (e.g. 'Follow for more leaks!').
            voice: Voice preset ('energetic', 'narrator', 'storyteller', 'clear_female', 'vibrant_female').
            rate: Speed modifier for voiceover (default '+15%').
            hook_duck_volume: Volume of original video audio during hook (default 0.0 = muted).
            caption_style: Style for animated captions ('hormozi', 'neon_gold', 'bold_pop', etc.).
            layout: Framing layout ('auto', 'split_screen', 'zoom_fit', 'face_track').
            ratio: Aspect ratio (default: '9:16').

        Returns:
            Path to rendered hybrid MP4, duration, file size, and hook details.
        """
        from ..pipeline.hybrid import render_hybrid_clip

        res = await render_hybrid_clip(
            clip_id,
            hook_text=hook_text,
            outro_text=outro_text,
            voice=voice,
            rate=rate,
            hook_mode=hook_mode,
            hook_broll_start_s=hook_broll_start_s,
            hook_duck_volume=hook_duck_volume,
            style_key=caption_style,
            layout=layout,
            ratio=ratio,
        )
        return {
            "export_id": res.export_id,
            "clip_id": res.clip_id,
            "path": str(res.path),
            "file_url": f"file:///{res.path.as_posix()}",
            "filename": res.filename,
            "hook_text": res.hook_text,
            "outro_text": res.outro_text,
            "voice": res.voice,
            "duration_s": round(res.duration_s, 2),
            "size_mb": round(res.size_bytes / (1024 * 1024), 2),
        }

    @mcp.tool()
    async def create_broll_summary_short(
        job_id: str,
        instructions: str = "",
        custom_script: dict[str, Any] | None = None,
        target_duration: int = 60,
        voice: str = "energetic",
        rate: str = "+15%",
        caption_style: str = "hormozi",
        ambient_volume: float = 0.0,
        ratio: str = "9:16",
    ) -> dict[str, Any]:
        """Create a transformative B-roll Short summarizing a long video with AI commentary.

        Extracts relevant visual scenes from the uploaded video as B-roll cuts, overlays an engaging
        neural commentary voiceover with word-accurate Hormozi animated captions, full-bleed 9:16 crop,
        and completely evades Content ID matching.

        Args:
            job_id: The job ID to summarize.
            instructions: Optional guidance (e.g. 'Summarize the yacht progression with hype commentary').
            custom_script: Optional pre-planned script dict matching {"title": ..., "hook": ..., "beats": [{"narration": ..., "broll_start_s": ..., "broll_end_s": ...}]}. If provided by Claude, AutoClip renders this script directly!
            target_duration: Target duration in seconds (60, 90, 120). Default: 60.
            voice: Voice preset ('energetic', 'narrator', 'storyteller', 'clear_female', 'vibrant_female').
            rate: Speed modifier for voiceover (default: '+15%').
            caption_style: Style for animated captions ('hormozi', 'neon_gold', 'bold_pop', etc.).
            ambient_volume: Volume of original video background audio (default 0.0 = completely muted).
            ratio: Target aspect ratio (default: '9:16').

        Returns:
            Rendered MP4 file path, title, script, and duration.
        """
        from ..pipeline.summarizer import SummaryScript, create_broll_short

        parsed_script = None
        if custom_script:
            parsed_script = SummaryScript.model_validate(custom_script)

        res = await create_broll_short(
            job_id,
            instructions=instructions,
            target_duration=target_duration,
            script=parsed_script,
            voice=voice,
            rate=rate,
            caption_style=caption_style,
            ambient_volume=ambient_volume,
            ratio=ratio,
        )
        return {
            "export_id": res.export_id,
            "clip_id": res.clip_id,
            "job_id": res.job_id,
            "title": res.title,
            "hook": res.hook,
            "script": res.script,
            "beats_count": res.beats_count,
            "path": str(res.path),
            "file_url": f"file:///{res.path.as_posix()}",
            "filename": res.filename,
            "voice": res.voice,
            "duration_s": round(res.duration_s, 2),
            "size_mb": round(res.size_bytes / (1024 * 1024), 2),
        }

    @mcp.tool()
    async def get_job_status(job_id: str) -> dict[str, Any]:
        """Get the current processing stage and progress of an AutoClip job.

        Args:
            job_id: The job ID.

        Returns:
            Job status ('queued', 'running', 'done', 'failed'), stage, and progress.
        """
        job = await asyncio.to_thread(store.get_job, job_id)
        if job is None:
            raise ValueError(f"Job not found: {job_id}")

        source = await asyncio.to_thread(store.get_source, job.source_id)
        clips = await asyncio.to_thread(store.list_clips, job_id)

        return {
            "job_id": job.id,
            "status": job.status,
            "current_stage": job.current_stage,
            "progress_percent": round(job.progress * 100, 1),
            "error": job.error,
            "source_title": source.title if source else None,
            "clips_count": len(clips),
            "created_at": str(job.created_at) if job.created_at else None,
            "updated_at": str(job.updated_at) if job.updated_at else None,
        }

    @mcp.tool()
    async def get_clip_results(job_id: str) -> dict[str, Any]:
        """List all candidate clips and exported video files for a given job.

        Args:
            job_id: The job ID.

        Returns:
            All clips, scores, hooks, and paths to any rendered MP4 files.
        """
        all_clips = await asyncio.to_thread(store.list_clips, job_id)
        results = []

        for c in all_clips:
            exports = await asyncio.to_thread(store.list_exports, c.id)
            export_paths = [
                {
                    "path": exp.path,
                    "file_url": f"file:///{Path(exp.path).as_posix()}",
                    "ratio": exp.ratio,
                    "style": exp.style,
                    "size_mb": round(exp.size_bytes / (1024 * 1024), 2),
                }
                for exp in exports
                if Path(exp.path).exists()
            ]

            results.append(
                {
                    "id": c.id,
                    "rank": c.rank,
                    "title": c.title,
                    "hook": c.hook,
                    "score": c.score,
                    "start_s": round(c.start_s, 2),
                    "end_s": round(c.end_s, 2),
                    "duration_s": round(c.end_s - c.start_s, 2),
                    "status": c.status,
                    "exports": export_paths,
                }
            )

        return {"job_id": job_id, "clips": results}

    @mcp.tool()
    async def get_job_exports(job_id: str) -> dict[str, Any]:
        """Get all finished video exports rendered for a job across all pipelines (Pipelines 1, 2, and 3).

        Args:
            job_id: The job ID.

        Returns:
            List of all rendered MP4 files with file paths, sizes, titles, and download URLs.
        """
        exports = await asyncio.to_thread(store.list_exports_for_job, job_id)
        results = []
        for e in exports:
            p = Path(e.path)
            script_data = None
            if e.script_json:
                try:
                    script_data = json.loads(e.script_json)
                except Exception:
                    pass
            results.append(
                {
                    "export_id": e.id,
                    "clip_id": e.clip_id,
                    "pipeline_type": e.pipeline_type,
                    "title": e.title or p.stem.replace("_", " ").title(),
                    "path": str(p),
                    "file_url": f"file:///{p.as_posix()}",
                    "filename": p.name,
                    "size_mb": round(p.stat().st_size / (1024 * 1024), 2) if p.exists() else 0,
                    "ratio": e.ratio,
                    "style": e.style,
                    "script": script_data,
                    "created_at": e.created_at,
                }
            )
        return {"job_id": job_id, "exports_count": len(results), "exports": results}

    @mcp.tool()
    async def get_job_scripts(job_id: str) -> dict[str, Any]:
        """Retrieve all previous script drafts, options, and user feedback iterations saved under a job.

        Args:
            job_id: The job ID.

        Returns:
            List of all saved scripts with versions, angles, beats, and critique history.
        """
        scripts = await asyncio.to_thread(store.list_job_scripts, job_id)
        results = []
        for s in scripts:
            try:
                s_data = json.loads(s.script_json)
            except Exception:
                s_data = {}
            results.append(
                {
                    "id": s.id,
                    "version": s.version,
                    "pipeline_type": s.pipeline_type,
                    "angle_title": s.angle_title,
                    "title": s.title,
                    "hook": s.hook,
                    "script": s_data,
                    "source_agent": s.source_agent,
                    "feedback": s.feedback,
                    "created_at": s.created_at,
                }
            )
        return {"job_id": job_id, "scripts_count": len(results), "scripts": results}

    @mcp.tool()
    async def save_job_script(
        job_id: str,
        title: str,
        hook: str,
        beats: list[dict[str, Any]],
        angle_title: str = "Claude Custom Angle",
        feedback: str = "",
        pipeline_type: str = "pipeline_2",
    ) -> dict[str, Any]:
        """Save a new script draft or refined iteration directly into the job's database history.

        Args:
            job_id: The job ID.
            title: Title for the Short with #shorts.
            hook: Opening curiosity hook sentence.
            beats: List of narrative beats [{'narration': '...', 'broll_start_s': 10.0, 'broll_end_s': 15.0}].
            angle_title: Descriptive angle (e.g. 'Viral Hype Angle', 'Behind the Scenes').
            feedback: User critique or notes that inspired this iteration.
            pipeline_type: 'pipeline_2' (B-roll summary) or 'pipeline_3' (hybrid).

        Returns:
            Saved script record ID and version.
        """
        from ..db.models import JobScript, new_id

        # Determine next version
        existing = await asyncio.to_thread(store.list_job_scripts, job_id, pipeline_type)
        version = (existing[0].version + 1) if existing else 1

        script_dict = {
            "angle_title": angle_title,
            "title": title,
            "hook": hook,
            "beats": beats,
        }

        js = JobScript(
            id=new_id(),
            job_id=job_id,
            version=version,
            pipeline_type=pipeline_type,
            angle_title=angle_title,
            title=title,
            hook=hook,
            script_json=json.dumps(script_dict),
            source_agent="claude",
            feedback=feedback,
        )
        saved = await asyncio.to_thread(store.create_job_script, js)
        return {
            "script_id": saved.id,
            "job_id": job_id,
            "version": saved.version,
            "angle_title": saved.angle_title,
            "title": saved.title,
            "beats_count": len(beats),
        }

    @mcp.tool()
    async def generate_script_options(
        job_id: str,
        instructions: str = "",
        count: int = 3,
        target_duration: int = 60,
    ) -> dict[str, Any]:
        """Generate 3 diverse creative script angles for this video (e.g. Viral Hype, Shock Factor, Storyline).

        Args:
            job_id: The job ID.
            instructions: Optional guidance for topic or tone.
            count: Number of distinct script angles to generate (default 3).
            target_duration: Target duration in seconds (default 60).

        Returns:
            List of generated script options with angles, hooks, and B-roll timestamps.
        """
        from ..pipeline.summarizer import plan_multi_summary_scripts

        scripts = await plan_multi_summary_scripts(
            job_id,
            instructions=instructions,
            count=count,
            target_duration=target_duration,
        )
        return {
            "job_id": job_id,
            "count": len(scripts),
            "options": [s.model_dump() for s in scripts],
        }

    @mcp.tool()
    async def get_youtube_status(channel_profile: str = "default") -> dict[str, Any]:
        """Check YouTube channel connection state and subscriber/view statistics.

        Args:
            channel_profile: Profile name (e.g. 'default', 'gaming', 'viral').

        Returns:
            Connection status, channel title, subscriber count, and video count.
        """
        from ..pipeline import youtube

        status = await asyncio.to_thread(youtube.get_channel_status, channel_profile)
        return {
            "connected": status.connected,
            "channel_id": status.channel_id,
            "title": status.title,
            "custom_url": status.custom_url,
            "profile_name": status.profile_name,
            "subscriber_count": status.subscriber_count,
            "video_count": status.video_count,
            "view_count": status.view_count,
            "message": status.message,
        }

    @mcp.tool()
    async def connect_youtube_channel(
        channel_profile: str = "default",
        client_secrets_path: str | None = None,
    ) -> dict[str, Any]:
        """Trigger local browser OAuth 2.0 flow to connect a YouTube channel.

        Opens a web browser for the user to grant YouTube upload and analytics
        permissions. Automatically detects client_secrets.json in ~/.autoclip or Downloads.

        Args:
            channel_profile: Channel profile name (e.g. 'default', 'gaming', 'viral').
            client_secrets_path: Optional explicit path to client_secrets.json.

        Returns:
            Connection result, channel name, subscriber count, and channel ID.
        """
        from ..pipeline import youtube

        status = await asyncio.to_thread(
            youtube.start_oauth_flow,
            client_secrets_path=client_secrets_path,
            profile_name=channel_profile,
        )
        return {
            "connected": status.connected,
            "channel_id": status.channel_id,
            "title": status.title,
            "custom_url": status.custom_url,
            "profile_name": status.profile_name,
            "subscriber_count": status.subscriber_count,
            "video_count": status.video_count,
            "view_count": status.view_count,
            "message": status.message,
        }

    @mcp.tool()
    async def upload_youtube_short(
        export_id: str,
        title: str,
        description: str,
        tags: list[str] | None = None,
        schedule_time_iso: str | None = None,
        privacy: str = "public",
        channel_profile: str = "default",
    ) -> dict[str, Any]:
        """Upload or schedule an exported video as a YouTube Short.

        SAFETY GUARD (MANDATORY):
        You MUST NEVER call this tool without explicit, interactive confirmation
        from the user in the current conversation. The user must review the export
        first and give clear sign-off before upload.

        Args:
            export_id: ID of the rendered export to upload.
            title: Title for the Short with #shorts.
            description: Description with hashtags and citations.
            tags: Keywords/tags (e.g. ['mrbeast', 'yacht', 'challenge', 'shorts']).
            schedule_time_iso: Optional ISO 8601 timestamp to schedule release (e.g. '2026-11-10T18:00:00Z').
            privacy: 'public', 'unlisted', or 'private' (automatically 'private' when scheduling).
            channel_profile: Target channel profile (e.g. 'default', 'gaming', 'viral').

        Returns:
            YouTube video ID, URL, and scheduled drop time.
        """
        from ..pipeline import youtube

        export = await asyncio.to_thread(store.get_export, export_id)
        if export is None:
            raise ValueError(f"Export not found: {export_id}")

        res = await asyncio.to_thread(
            youtube.upload_youtube_short,
            video_path=export.path,
            title=title,
            description=description,
            tags=tags,
            schedule_time_iso=schedule_time_iso,
            privacy=privacy,
            profile_name=channel_profile,
            export_id=export.id,
            job_id=export.job_id or "unknown",
        )
        return {
            "upload_id": res.upload_id,
            "video_id": res.video_id,
            "channel_id": res.channel_id,
            "title": res.title,
            "status": res.status,
            "youtube_url": res.youtube_url,
            "scheduled_at": res.scheduled_at,
        }

    @mcp.tool()
    async def fetch_youtube_analytics(
        channel_profile: str = "default",
        days: int = 30,
    ) -> dict[str, Any]:
        """Fetch YouTube Analytics: retention rate (APV), views, subscriber growth, and top-performing Shorts.

        Args:
            channel_profile: Channel profile name (default 'default').
            days: Period in days to query (default 30).

        Returns:
            Views, retention percentage, average view duration, and top Shorts performance.
        """
        from ..pipeline import youtube

        data = await asyncio.to_thread(
            youtube.fetch_channel_analytics,
            profile_name=channel_profile,
            days=days,
        )
        return data

    return mcp


def main() -> None:
    """Run the AutoClip stdio MCP server."""
    server = create_mcp_server()
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
