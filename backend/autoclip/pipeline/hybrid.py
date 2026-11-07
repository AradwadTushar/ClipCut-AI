"""Hybrid Hook Machine (Pipeline 3) for AutoClip.

Slices high-retention viral moments from long videos and overlays an AI-generated
spoken hook voiceover during the first 2-4 seconds with source audio ducked to 12%,
transitioning seamlessly into raw clip audio at 100% volume, with unified
animated Hormozi captions across the entire Short.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .. import paths
from ..config import ExportSettings, load as load_settings
from ..db import store
from ..db.models import Export, new_id
from ..pipeline import captions as captions_module
from ..pipeline import ffmpeg, tts
from ..pipeline.export import (
    AUDIO_BITRATE,
    AUDIO_SAMPLE_RATE,
    ExportError,
    ExportRequest,
    build_video_filtergraph,
    encoder_args,
    output_filename,
    ratio_dimensions,
    slugify_title,
)
from ..pipeline.reframe.croppath import CropPath
from ..pipeline.runner import JobWorkspace
from ..pipeline.transcript import Transcript, Word
from ..providers import build_provider

log = logging.getLogger(__name__)


@dataclass
class HybridResult:
    """Outcome of a hybrid clip export."""

    export_id: str
    clip_id: str
    path: Path
    filename: str
    hook_text: str
    outro_text: str | None
    voice: str
    duration_s: float
    size_bytes: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "export_id": self.export_id,
            "clip_id": self.clip_id,
            "path": str(self.path),
            "filename": self.filename,
            "hook_text": self.hook_text,
            "outro_text": self.outro_text,
            "voice": self.voice,
            "duration_s": round(self.duration_s, 2),
            "size_bytes": self.size_bytes,
            "download_url": f"/api/exports/{self.export_id}/download",
        }


async def generate_hook_text(
    clip_title: str,
    clip_reason: str = "",
    dialogue_snippet: str = "",
    existing_hook: str = "",
    provider_name: str | None = None,
) -> str:
    """Generate or refine a 4-8 word spoken hook for the opening 3 seconds."""
    settings = load_settings()
    provider_name = provider_name or settings.active_provider

    prompt = (
        "You are an elite YouTube Shorts viral copywriter.\n"
        "Generate ONE punchy, curiosity-inducing opening hook sentence (4 to 8 words maximum) "
        "spoken by a narrator in the first 3 seconds of a Short.\n\n"
        f"Clip Title: {clip_title}\n"
        f"Context / Reason: {clip_reason}\n"
        f"Dialogue Snippet: {dialogue_snippet[:300]}\n\n"
        "Requirements:\n"
        "- Exactly 4 to 8 words.\n"
        "- High curiosity gap (e.g., 'Look who Rockstar secretly put in GTA 6!' or 'Wait till you see what happens next!').\n"
        "- Conversational and punchy.\n"
        "- Return ONLY the spoken text. Do NOT include quotes, labels, or formatting."
    )

    try:
        provider = build_provider(provider_name, settings)
        status = await provider.health_check()
        if status.available:
            from ..providers.base import DetectionConfig
            config = DetectionConfig(temperature=0.7)
            raw = await provider._complete(
                "You are an elite YouTube Shorts copywriter.",
                prompt,
                config,
            )
            cleaned = raw.strip().strip('"').strip("'").strip()
            # If valid length
            words = cleaned.split()
            if 3 <= len(words) <= 14:
                return cleaned
    except Exception as exc:
        log.warning("AI hook generation failed (%s); using fallback.", exc)

    if existing_hook and len(existing_hook.split()) <= 14:
        return existing_hook

    if clip_title:
        return f"Wait, look what happened in {clip_title}!"
    return "Wait till you see what happens next!"


async def render_hybrid_clip(
    clip_id: str,
    *,
    hook_text: str | None = None,
    outro_text: str | None = None,
    voice: str = "energetic",
    rate: str = "+15%",
    style_key: str = "hormozi",
    layout: str = "auto",
    ratio: str = "9:16",
    hook_mode: str = "prepend_broll",
    hook_broll_start_s: float | None = None,
    hook_duck_volume: float = 0.0,
    export_settings: ExportSettings | None = None,
) -> HybridResult:
    """Render a complete Hybrid Short: Hook VO + Raw Clip + optional Outro CTA.

    Args:
        clip_id: Identifier of the clip to render.
        hook_text: Text for opening voiceover. If None, auto-generated.
        outro_text: Optional text for closing CTA voiceover.
        voice: Voice preset ('energetic', 'narrator', etc.) or Edge-TTS voice ID.
        rate: Speed modifier for voiceover (default '+15%' for high retention).
        style_key: Caption style ('hormozi', 'bold_pop', etc.).
        layout: Framing layout ('auto', 'split_screen', 'zoom_fit', etc.).
        ratio: Target aspect ratio ('9:16', '1:1', '16:9').
        hook_mode: 'prepend_broll' (default: prepends 2-3s B-roll teaser with VO, keeping 100% of clip audio intact) or 'overlay' (ducks first 3s of clip).
        hook_broll_start_s: Optional source timestamp for teaser B-roll cut in 'prepend_broll' mode.
        hook_duck_volume: Relative volume for source audio during hook VO (used only in 'overlay' mode).
        export_settings: Video/audio encoding settings.

    Returns:
        HybridResult with export details and output path.
    """
    settings = load_settings()
    export_cfg = export_settings or settings.export

    clip = await asyncio.to_thread(store.get_clip, clip_id)
    if clip is None:
        raise ValueError(f"Clip {clip_id} not found.")

    job = await asyncio.to_thread(store.get_job, clip.job_id)
    if job is None:
        raise ValueError(f"Job {clip.job_id} not found.")

    source = await asyncio.to_thread(store.get_source, job.source_id)
    if source is None:
        raise ValueError(f"Source for job {clip.job_id} not found.")

    from ..api.clips import _crop_path_for, clip_words

    # 1. Resolve raw clip words
    raw_words = await clip_words(clip_id)
    snippet = " ".join(w.text for w in raw_words[:30])

    # 2. Resolve hook text
    if not hook_text or not hook_text.strip():
        hook_text = await generate_hook_text(
            clip_title=clip.title,
            clip_reason=clip.reason,
            dialogue_snippet=snippet,
            existing_hook=clip.hook,
        )
    hook_text = hook_text.strip()

    # 3. Workspaces & Audio synthesis
    workspace = JobWorkspace(clip.job_id)
    hybrid_work_dir = workspace.captions_dir / f"hybrid_{clip.id}"
    hybrid_work_dir.mkdir(parents=True, exist_ok=True)

    hook_audio_path = hybrid_work_dir / "hook_vo.mp3"
    hook_tts = await tts.synthesize_speech(hook_text, hook_audio_path, voice=voice, rate=rate)
    t_hook = hook_tts.duration_s

    outro_tts = None
    t_outro = 0.0
    if outro_text and outro_text.strip():
        outro_audio_path = hybrid_work_dir / "outro_vo.mp3"
        outro_tts = await tts.synthesize_speech(outro_text.strip(), outro_audio_path, voice=voice, rate=rate)
        t_outro = outro_tts.duration_s

    clip_dur = clip.end_s - clip.start_s
    t_outro_start = max(t_hook, clip_dur - t_outro) if outro_tts else clip_dur

    # 4. Assemble Unified Continuous Caption Words
    if hook_mode == "prepend_broll":
        # Hook words: 0.0 to t_hook
        combined_words: list[Word] = list(hook_tts.words)
        # Raw clip words: shifted by t_hook so 100% of native speech is preserved!
        for w in raw_words:
            combined_words.append(
                Word(
                    text=w.text,
                    start=round(t_hook + (w.start - clip.start_s), 3),
                    end=round(t_hook + (w.end - clip.start_s), 3),
                    speaker=w.speaker,
                )
            )
        # Outro words: shifted to t_hook + clip_dur
        if outro_tts:
            t_outro_start = t_hook + clip_dur
            for w in outro_tts.words:
                combined_words.append(
                    Word(
                        text=w.text,
                        start=round(t_outro_start + w.start, 3),
                        end=round(t_outro_start + w.end, 3),
                    )
                )
    else:
        # Legacy overlay mode: duck first 3s
        combined_words = list(hook_tts.words)
        for w in raw_words:
            rel_start = round(w.start - clip.start_s, 3)
            rel_end = round(w.end - clip.start_s, 3)
            if rel_start >= t_hook and rel_end <= t_outro_start:
                combined_words.append(Word(text=w.text, start=rel_start, end=rel_end, speaker=w.speaker))
        if outro_tts:
            for w in outro_tts.words:
                combined_words.append(
                    Word(
                        text=w.text,
                        start=round(t_outro_start + w.start, 3),
                        end=round(t_outro_start + w.end, 3),
                    )
                )

    combined_words.sort(key=lambda w: w.start)

    # 5. Caption Style & ASS generation
    style = captions_module.get_style(style_key)
    out_w, out_h = ratio_dimensions(ratio)
    ass_path = captions_module.write_ass(
        hybrid_work_dir / "captions.ass",
        combined_words,
        style,
        width=out_w,
        height=out_h,
        time_offset_s=0.0,  # Combined words are already clip-relative
    )
    render_cwd, subtitle_name, fonts_name = ffmpeg.relative_filter_workspace(
        ass_path, captions_module.FONT_DIR
    )

    # 6. Framing Crop Path
    crop_path = await asyncio.to_thread(
        _crop_path_for, workspace, clip, source, ratio, layout
    )

    # 7. Output Destination
    destination = (
        paths.exports_dir()
        / clip.job_id
        / f"{slugify_title(clip.title or f'clip-{clip.rank}')}_hybrid_{ratio.replace(':', 'x')}.mp4"
    )
    destination.parent.mkdir(parents=True, exist_ok=True)

    # 8. Build Filtergraph & FFmpeg Arguments
    if hook_mode == "prepend_broll":
        broll_start = hook_broll_start_s if hook_broll_start_s is not None else (
            1.0 if clip.start_s > 8.0 else min(source.duration_s - t_hook - 1.0, clip.end_s + 4.0)
        )
        total_dur = t_hook + clip_dur + t_outro

        clip_req = ExportRequest(
            source=Path(source.path),
            destination=destination,
            start_s=clip.start_s,
            end_s=clip.end_s,
            crop_path=crop_path,
            words=combined_words,
            style=style,
            ratio=ratio,
            burn_captions=False,
        )
        clip_video_filter = build_video_filtergraph(
            clip_req,
            subtitle_name=None,
            fonts_name=fonts_name,
            input_label="[2:v]",
            output_label="[v_clip]",
        )

        filter_parts = [
            f"[0:v]scale={out_w}:{out_h}:force_original_aspect_ratio=increase:flags=lanczos,crop={out_w}:{out_h},setsar=1,format=yuv420p[v_teaser]",
            clip_video_filter,
            "[v_teaser][v_clip]concat=n=2:v=1:a=0[v_joined]",
            f"[v_joined]ass=filename={subtitle_name}:fontsdir={fonts_name}[vout]",
            "[1:a]aformat=sample_rates=48000:channel_layouts=stereo[a_teaser]",
            "[2:a]aformat=sample_rates=48000:channel_layouts=stereo[a_clip]",
        ]
        if outro_tts:
            filter_parts.append("[3:a]aformat=sample_rates=48000:channel_layouts=stereo[a_outro]")
            filter_parts.append("[a_teaser][a_clip][a_outro]concat=n=3:v=0:a=1[a_joined]")
        else:
            filter_parts.append("[a_teaser][a_clip]concat=n=2:v=0:a=1[a_joined]")
        filter_parts.append(f"[a_joined]loudnorm=I={export_cfg.loudness_lufs}:TP=-1.5:LRA=11[aout]")

        full_filtergraph = ";".join(filter_parts)
        cmd_inputs = [
            "-ss", f"{broll_start:.4f}",
            "-t", f"{t_hook:.4f}",
            "-i", str(source.path),
            "-i", str(hook_audio_path),
            "-ss", f"{clip.start_s:.4f}",
            "-t", f"{clip_dur:.4f}",
            "-i", str(source.path),
        ]
        if outro_tts:
            cmd_inputs.extend(["-i", str(hybrid_work_dir / "outro_vo.mp3")])
    else:
        # Legacy overlay filtergraph
        total_dur = clip_dur
        req = ExportRequest(
            source=Path(source.path),
            destination=destination,
            start_s=clip.start_s,
            end_s=clip.end_s,
            crop_path=crop_path,
            words=combined_words,
            style=style,
            ratio=ratio,
            burn_captions=True,
        )
        video_filtergraph = build_video_filtergraph(
            req, subtitle_name=subtitle_name, fonts_name=fonts_name
        )

        has_audio = source.has_audio
        audio_parts: list[str] = []
        if has_audio:
            if outro_tts:
                audio_parts.append(
                    f"[0:a]volume=enable='between(t,0,{t_hook:.3f})+between(t,{t_outro_start:.3f},{clip_dur:.3f})':"
                    f"volume={hook_duck_volume:.2f}[ducked_a]"
                )
                audio_parts.append(
                    f"[2:a]adelay={int(t_outro_start * 1000)}|{int(t_outro_start * 1000)}[outro_delayed]"
                )
                audio_parts.append(
                    f"[ducked_a][1:a][outro_delayed]amix=inputs=3:duration=first:dropout_transition=0.2[mixed_a]"
                )
            else:
                audio_parts.append(
                    f"[0:a]volume=enable='between(t,0,{t_hook:.3f})':volume={hook_duck_volume:.2f}[ducked_a]"
                )
                audio_parts.append(
                    "[ducked_a][1:a]amix=inputs=2:duration=first:dropout_transition=0.2[mixed_a]"
                )
            audio_parts.append(
                f"[mixed_a]loudnorm=I={export_cfg.loudness_lufs}:TP=-1.5:LRA=11[aout]"
            )
        else:
            if outro_tts:
                audio_parts.append(
                    f"[2:a]adelay={int(t_outro_start * 1000)}|{int(t_outro_start * 1000)}[outro_delayed]"
                )
                audio_parts.append("[1:a][outro_delayed]amix=inputs=2:duration=first[mixed_a]")
                audio_parts.append(f"[mixed_a]loudnorm=I={export_cfg.loudness_lufs}:TP=-1.5:LRA=11[aout]")
            else:
                audio_parts.append(f"[1:a]loudnorm=I={export_cfg.loudness_lufs}:TP=-1.5:LRA=11[aout]")

        full_filtergraph = f"{video_filtergraph};{';'.join(audio_parts)}"
        cmd_inputs = [
            "-ss", f"{clip.start_s:.4f}",
            "-t", f"{clip_dur:.4f}",
            "-i", str(source.path),
            "-i", str(hook_audio_path),
        ]
        if outro_tts:
            cmd_inputs.extend(["-i", str(hybrid_work_dir / "outro_vo.mp3")])

    args = [
        *cmd_inputs,
        "-filter_complex", full_filtergraph,
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
            total_duration_s=total_dur,
            cwd=render_cwd,
        )
    except ffmpeg.FFmpegError as exc:
        raise ExportError(f"Could not render hybrid short {destination.name}.\n{exc}") from exc

    if not destination.exists() or destination.stat().st_size == 0:
        raise ExportError(f"ffmpeg reported success but {destination.name} is empty.")

    # 10. Record Export in Database
    export_record = Export(
        id=new_id(),
        clip_id=clip_id,
        path=str(destination),
        ratio=ratio,
        style=style.key,
        size_bytes=destination.stat().st_size,
        job_id=clip.job_id,
        pipeline_type="pipeline_3",
        title=clip.title,
        script_json=json.dumps({"hook": hook_text, "outro": outro_text}),
    )
    await asyncio.to_thread(store.create_export, export_record)
    await asyncio.to_thread(store.update_clip, clip_id, status="exported")

    log.info(
        "Successfully exported Hybrid Short %s (%.1fs) with hook '%s'",
        destination.name,
        clip_dur,
        hook_text,
    )

    return HybridResult(
        export_id=export_record.id,
        clip_id=clip_id,
        path=destination,
        filename=destination.name,
        hook_text=hook_text,
        outro_text=outro_text,
        voice=voice,
        duration_s=clip_dur,
        size_bytes=destination.stat().st_size,
    )
