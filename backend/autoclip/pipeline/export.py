"""Export stage — crop path plus captions plus audio normalisation to an MP4.

The whole render is a single ffmpeg pass. Per-shot crop segments are trimmed out
of the source, cropped independently, scaled to a common output size, and
concatenated in the filtergraph — which is what allows a wide two-shot and a
tight single to sit in one clip without a mid-stream frame-size change.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from ..config import ExportSettings
from ..system import report
from . import captions as captions_module
from . import ffmpeg
from .captions import CaptionStyle
from .reframe.croppath import CropPath, CropSegment, segment_crop_filter
from .transcript import Word

log = logging.getLogger(__name__)

#: Output dimensions per aspect ratio. 1080-wide is the platform sweet spot:
#: high enough to avoid re-encode mush, low enough to upload quickly.
RATIOS: dict[str, tuple[int, int]] = {
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "16:9": (1920, 1080),
}

#: Loudness targets. -14 LUFS integrated with -1.5 dBTP is what every major
#: platform normalises toward, so hitting it ourselves avoids their processing.
LOUDNESS_TRUE_PEAK = -1.5
LOUDNESS_RANGE = 11.0

AUDIO_BITRATE = "192k"
AUDIO_SAMPLE_RATE = 48_000


class ExportError(RuntimeError):
    """Rendering a clip failed."""


@dataclass
class ExportRequest:
    source: Path
    destination: Path
    start_s: float
    end_s: float
    crop_path: CropPath
    words: list[Word]
    style: CaptionStyle
    ratio: str = "9:16"
    burn_captions: bool = True

    @property
    def duration_s(self) -> float:
        return self.end_s - self.start_s


def ratio_dimensions(ratio: str) -> tuple[int, int]:
    if ratio not in RATIOS:
        raise ExportError(f"Unknown ratio {ratio!r}. Available: {', '.join(RATIOS)}")
    return RATIOS[ratio]


def slugify_title(title: str, *, max_length: int = 50) -> str:
    """Filename-safe slug for a clip title."""
    slug = re.sub(r"[^\w\s-]", "", title, flags=re.UNICODE).strip().lower()
    slug = re.sub(r"[\s_-]+", "-", slug).strip("-")
    return slug[:max_length] or "clip"


def output_filename(title: str, ratio: str) -> str:
    return f"{slugify_title(title)}_{ratio.replace(':', 'x')}.mp4"


# --------------------------------------------------------------------------
# Filtergraph construction
# --------------------------------------------------------------------------


def build_video_filtergraph(
    request: ExportRequest,
    *,
    subtitle_name: str | None,
    fonts_name: str = "fonts",
    input_label: str = "[0:v]",
    output_label: str = "[vout]",
) -> str:
    """Build the ``-filter_complex`` video chain for one clip."""
    out_w, out_h = ratio_dimensions(request.ratio)
    segments = request.crop_path.segments
    if not segments:
        raise ExportError("The crop path has no segments.")

    parts: list[str] = []
    labels: list[str] = []

    for index, segment in enumerate(segments):
        label = f"v{index}"
        labels.append(f"[{label}]")

        if len(segments) == 1:
            # No trim needed; the input is already seeked to the clip.
            source_label = input_label
            prefix = ""
        else:
            source_label = f"[s{index}]"
            prefix = (
                f"{input_label}trim=start={segment.start_s:.4f}:end={segment.end_s:.4f},"
                f"setpts=PTS-STARTPTS{source_label}"
            )
            parts.append(prefix)

        if segment.fit:
            parts.extend(_fit_chain(source_label, index, out_w, out_h, zoom=segment.zoom))
            continue

        if getattr(segment, "podcast_split", False):
            parts.extend(
                _podcast_split_chain(
                    source_label,
                    index,
                    out_w,
                    out_h,
                    segment,
                    request.crop_path.source_width,
                    request.crop_path.source_height,
                )
            )
            continue

        if getattr(segment, "split", False):
            parts.extend(_split_chain(source_label, index, out_w, out_h, segment))
            continue

        chain = [segment_crop_filter(segment)]
        if segment.zoom > 0:
            chain.append(_zoom_filter(segment.zoom, out_w, out_h))
        chain.append(f"scale={out_w}:{out_h}:flags=lanczos")
        chain.append("setsar=1,format=yuv420p")

        parts.append(f"{source_label}{','.join(chain)}[{label}]")

    if len(segments) == 1:
        current = "[v0]"
    else:
        parts.append(f"{''.join(labels)}concat=n={len(segments)}:v=1:a=0[vcat]")
        current = "[vcat]"

    if request.burn_captions and subtitle_name is not None:
        # Bare relative names — ffmpeg runs with its cwd set to the render
        # workspace, so there is nothing here that needs escaping.
        parts.append(f"{current}ass=filename={subtitle_name}:fontsdir={fonts_name}{output_label}")
    else:
        parts.append(f"{current}null{output_label}")

    return ";".join(parts)


def _podcast_split_chain(
    source_label: str,
    index: int,
    out_w: int,
    out_h: int,
    segment: CropSegment,
    source_w: int,
    source_h: int,
) -> list[str]:
    """Stack two crops 50/50: Top 50% Speaker 1 + Bottom 50% Speaker 2 with a divider."""
    pane_h = out_h // 2
    pane_h = pane_h - (pane_h % 2)

    # In 9:16 target (e.g. 1080x1920), each pane is 1080 x 960 (ratio 9:8).
    # To crop from source (e.g. 1920x1080) maintaining 9:8:
    crop_w = int(source_h * out_w / pane_h)
    crop_w = min(source_w, crop_w - (crop_w % 2))
    crop_h = source_h

    # Centering positions for Speaker 1 and Speaker 2
    s1_center = segment.speaker1_x if segment.speaker1_x is not None else (source_w * 0.30)
    s2_center = segment.speaker2_x if segment.speaker2_x is not None else (source_w * 0.70)

    x1 = int(max(0, min(source_w - crop_w, s1_center - (crop_w / 2))))
    x2 = int(max(0, min(source_w - crop_w, s2_center - (crop_w / 2))))
    x1 = x1 - (x1 % 2)
    x2 = x2 - (x2 % 2)

    top_filter = (
        f"[podtop{index}]crop={crop_w}:{crop_h}:{x1}:0,"
        f"scale={out_w}:{pane_h}:flags=lanczos[top{index}]"
    )
    bottom_filter = (
        f"[podbot{index}]crop={crop_w}:{crop_h}:{x2}:0,"
        f"scale={out_w}:{pane_h}:flags=lanczos[bot{index}]"
    )

    return [
        f"{source_label}split=2[podtop{index}][podbot{index}]",
        top_filter,
        bottom_filter,
        (
            f"[top{index}][bot{index}]vstack=inputs=2,"
            f"drawbox=y={pane_h-2}:h=4:color=black@0.90:t=fill,"
            f"setsar=1,format=yuv420p[v{index}]"
        ),
    ]


def _split_chain(
    source_label: str,
    index: int,
    out_w: int,
    out_h: int,
    segment: CropSegment,
) -> list[str]:
    """Stack two crops: Top 35% Facecam + Bottom 65% Gameplay/Action with a divider."""
    top_h = int(out_h * 0.35)
    top_h = top_h - (top_h % 2)
    bottom_h = out_h - top_h

    # Top: Focus on upper scene / face
    top_filter = (
        f"[splittop{index}]scale={out_w}:{top_h}:force_original_aspect_ratio=increase:"
        f"flags=lanczos,crop={out_w}:{top_h}[top{index}]"
    )

    # Bottom: Focus on wide gameplay / action
    bottom_filter = (
        f"[splitbot{index}]scale={out_w}:{bottom_h}:force_original_aspect_ratio=increase:"
        f"flags=lanczos,crop={out_w}:{bottom_h}[bot{index}]"
    )

    return [
        f"{source_label}split=2[splittop{index}][splitbot{index}]",
        top_filter,
        bottom_filter,
        (
            f"[top{index}][bot{index}]vstack=inputs=2,"
            f"drawbox=y={top_h-2}:h=4:color=black@0.85:t=fill,"
            f"setsar=1,format=yuv420p[v{index}]"
        ),
    ]


def _fit_chain(source_label: str, index: int, out_w: int, out_h: int, zoom: float = 0.0) -> list[str]:
    """Fit the whole frame into the output over a blurred copy of itself.

    Used when the subjects are spread wider than any crop can hold, or for screenshots/slides.
    If zoom > 0, slightly scales the foreground frame so it fills more vertical canvas.
    """
    if zoom > 0:
        scaled_w = int(out_w * (1.0 + zoom))
        scaled_w = scaled_w - (scaled_w % 2)
        scaled_h = int(scaled_w * 9 / 16)
        scaled_h = scaled_h - (scaled_h % 2)
        fg_filter = (
            f"[fitfg{index}]scale={scaled_w}:{scaled_h}:flags=lanczos,"
            f"crop={out_w}:{scaled_h}[fg{index}]"
        )
    else:
        fg_filter = (
            f"[fitfg{index}]scale={out_w}:{out_h}:force_original_aspect_ratio=decrease:"
            f"flags=lanczos[fg{index}]"
        )

    return [
        f"{source_label}split=2[fitbg{index}][fitfg{index}]",
        (
            f"[fitbg{index}]scale={out_w}:{out_h}:force_original_aspect_ratio=increase,"
            f"crop={out_w}:{out_h},boxblur=24:2[bg{index}]"
        ),
        fg_filter,
        (f"[bg{index}][fg{index}]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v{index}]"),
    ]


def _zoom_filter(zoom: float, out_w: int, out_h: int) -> str:
    """A slow push-in over the segment.

    Uses ``zoompan``, which is the only filter that can change apparent scale
    while holding a fixed output size. Off by default — at very small
    increments it can step visibly, and a locked frame beats a stuttering one.
    """
    end_zoom = 1.0 + zoom
    return f"zoompan=z='min(zoom+{zoom / 240:.6f},{end_zoom:.4f})':d=1:s={out_w}x{out_h}:fps=30"


def build_audio_filtergraph(settings: ExportSettings) -> str:
    return f"loudnorm=I={settings.loudness_lufs}:TP={LOUDNESS_TRUE_PEAK}:LRA={LOUDNESS_RANGE}"


def encoder_args(settings: ExportSettings) -> list[str]:
    """Pick the video encoder and its quality settings.

    NVENC is materially faster where available. Its quality knob is ``-cq``
    rather than ``-crf``, and the two scales are close enough that reusing the
    configured value keeps output consistent between machines.
    """
    if settings.prefer_hardware_encoder and report().ffmpeg.nvenc_works:
        return [
            "-c:v",
            "h264_nvenc",
            "-preset",
            "p5",
            "-rc",
            "vbr",
            "-cq",
            str(settings.crf),
            "-b:v",
            "0",
            "-profile:v",
            "high",
        ]
    return [
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        str(settings.crf),
        "-profile:v",
        "high",
    ]


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------


def export_clip(
    request: ExportRequest,
    *,
    work_dir: Path,
    settings: ExportSettings | None = None,
    on_progress: Callable[[float], None] | None = None,
    cancelled: Callable[[], bool] | None = None,
) -> Path:
    """Render one clip to an MP4 and return the output path.

    Preconditions:
        request.source exists; request.crop_path segments span the clip duration
        in clip-relative seconds.
    """
    settings = settings or ExportSettings()
    out_w, out_h = ratio_dimensions(request.ratio)

    # Each clip renders in its own workspace so concurrent exports can't collide
    # on the shared `captions.ass` name that the relative-path scheme requires.
    workspace = work_dir / request.destination.stem
    workspace.mkdir(parents=True, exist_ok=True)

    subtitle_name: str | None = None
    fonts_name = "fonts"
    render_cwd: Path | None = None

    if request.burn_captions and request.words:
        ass_path = captions_module.write_ass(
            workspace / "captions.ass",
            request.words,
            request.style,
            width=out_w,
            height=out_h,
            time_offset_s=request.start_s,
        )
        render_cwd, subtitle_name, fonts_name = ffmpeg.relative_filter_workspace(
            ass_path, captions_module.FONT_DIR
        )

    filtergraph = build_video_filtergraph(
        request, subtitle_name=subtitle_name, fonts_name=fonts_name
    )

    request.destination.parent.mkdir(parents=True, exist_ok=True)

    # Input and output paths are ordinary argv arguments, so they stay absolute
    # and need no escaping regardless of the working directory.
    args = [
        # Seeking before -i decodes from the nearest keyframe and is far faster
        # than an output-side seek; modern ffmpeg keeps it frame-accurate.
        "-ss",
        f"{request.start_s:.4f}",
        "-t",
        f"{request.duration_s:.4f}",
        "-i",
        str(request.source),
        "-filter_complex",
        filtergraph,
        "-map",
        "[vout]",
        "-map",
        "0:a?",
        "-af",
        build_audio_filtergraph(settings),
        *encoder_args(settings),
        "-pix_fmt",
        "yuv420p",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-color_range",
        "tv",
        "-c:a",
        "aac",
        "-b:a",
        AUDIO_BITRATE,
        "-ar",
        str(AUDIO_SAMPLE_RATE),
        "-movflags",
        "+faststart",
        str(request.destination),
    ]

    try:
        ffmpeg.run(
            args,
            total_duration_s=request.duration_s,
            on_progress=on_progress,
            cancelled=cancelled,
            cwd=render_cwd,
        )
    except ffmpeg.FFmpegError as exc:
        raise ExportError(f"Could not render {request.destination.name}.\n{exc}") from exc

    if not request.destination.exists() or request.destination.stat().st_size == 0:
        raise ExportError(f"ffmpeg reported success but {request.destination.name} is empty.")

    if settings.write_srt and request.words:
        captions_module.write_srt(
            request.destination.with_suffix(".srt"),
            request.words,
            time_offset_s=request.start_s,
        )

    log.info(
        "Exported %s (%.1fs, %s)",
        request.destination.name,
        request.duration_s,
        request.ratio,
    )
    return request.destination
