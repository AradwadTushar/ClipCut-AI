"""Reframe stage — 16:9 source to a 9:16 crop path that follows the speaker.

Pipeline for one clip:

1. Split into shots. Crop paths never interpolate across a cut.
2. Sample face landmarks across the clip.
3. Link observations into per-person tracks.
4. Map diarized speakers onto tracks once, then let turn boundaries drive framing.
5. Per shot, pick a strategy — TRACK, WIDE, or GENERAL.
6. Build a raw crop path, smooth it, and emit segments.

The quality bar is "never jarring": no visible jitter, no cut-off faces, the
speaker on screen for essentially all of their speaking time. Every default here
is biased toward stillness — a locked frame that is slightly off-centre beats a
frame that is always correct and always moving.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from .. import ffmpeg
from ..transcript import Transcript
from .croppath import (
    CropKeyframe,
    CropPath,
    CropSegment,
    Strategy,
    centre_crop,
    fit_crop,
    split_crop,
    podcast_split_crop,
    target_crop_size,
)
from .faces import FaceDetectionUnavailable, FaceObservation, sample_faces
from .scenes import Shot, detect_shots
from .smoothing import SmoothingConfig, smooth_series
from .speaker import assign_speakers, map_tracks_to_speakers
from .tracker import FaceTrack, build_tracks

log = logging.getLogger(__name__)

__all__ = [
    "CropPath",
    "CropSegment",
    "ReframeConfig",
    "Strategy",
    "build_crop_path",
    "centre_crop",
    "fit_crop",
    "split_crop",
    "podcast_split_crop",
]

#: Where the eye line sits within the crop, as a fraction of crop height.
#: Portrait convention puts the eyes near the upper third; 0.38 reads as
#: composed without leaving the chin tight to the bottom edge.
EYE_LINE_RATIO = 0.38

#: A face wider than this fraction of the crop is already a close-up; don't
#: track it, lock the frame.
LOCK_IF_FACE_WIDER_THAN = 0.55

#: If detected faces span more than this fraction of the crop width, no crop can
#: hold them and we fall back to a fitted (blurred-background) frame.
FIT_IF_SPREAD_EXCEEDS = 0.95

#: Slow push-in applied to shots with no face at all, to stop a static wide from
#: feeling like a still image. Off by default — see the note in export._zoom_filter.
GENERAL_ZOOM = 0.0


@dataclass
class ReframeConfig:
    aspect_w: int = 9
    aspect_h: int = 16
    sample_fps: float = 5.0
    smoothing: SmoothingConfig | None = None
    #: Skip face detection entirely and centre-crop everything.
    centre_only: bool = False
    #: Framing layout mode:
    #: - "auto": Face track if faces found, else blur_fit (preserves screenshots/gameplay).
    #: - "blur_fit": Always preserve whole 16:9 frame centered over blurred background.
    #: - "face_track": Always attempt face track, fallback to centre crop.
    #: - "centre": Pure static centre crop.
    #: - "podcast_split": Stacked 50/50 dual-speaker split screen (Speaker 1 top + Speaker 2 bottom).
    layout: str = "auto"


def build_crop_path(
    video: Path,
    *,
    start_s: float,
    end_s: float,
    transcript: Transcript | None = None,
    config: ReframeConfig | None = None,
) -> CropPath:
    """Compute the crop path for one clip.

    Falls back to a centred crop or blur_fit whenever face detection is
    unavailable or finds nothing — a valid crop is an acceptable result, an
    exception is not.

    Preconditions:
        video exists; 0 <= start_s < end_s <= source duration.
    """
    config = config or ReframeConfig()
    duration = end_s - start_s

    info = ffmpeg.probe(video)
    if not info.has_video or not info.width or not info.height:
        raise ValueError(f"{video.name} has no video stream to reframe.")

    source_w, source_h = info.width, info.height
    crop_w, crop_h = target_crop_size(source_w, source_h, config.aspect_w, config.aspect_h)

    if config.layout == "podcast_split":
        s1_x, s2_x = None, None
        try:
            obs = sample_faces(video, start_s=start_s, end_s=end_s, sample_fps=config.sample_fps)
            if obs:
                trks = build_tracks(obs)
                if len(trks) >= 2:
                    track_positions = []
                    for t in trks:
                        t_obs = t.observations_between(start_s, end_s)
                        if t_obs:
                            mean_x = sum(o.cx for o in t_obs) / len(t_obs)
                            track_positions.append((mean_x, t))
                    track_positions.sort(key=lambda item: item[0])
                    if len(track_positions) >= 2:
                        s1_x = track_positions[0][0]
                        s2_x = track_positions[-1][0]
        except Exception as e:
            log.warning("Could not detect speakers for podcast_split: %s", e)
        return podcast_split_crop(
            source_w,
            source_h,
            duration,
            aspect_w=config.aspect_w,
            aspect_h=config.aspect_h,
            speaker1_x=s1_x,
            speaker2_x=s2_x,
        )

    if config.layout == "split_screen":
        return split_crop(
            source_w, source_h, duration, aspect_w=config.aspect_w, aspect_h=config.aspect_h
        )

    if config.layout == "zoom_fit":
        return fit_crop(
            source_w, source_h, duration, aspect_w=config.aspect_w, aspect_h=config.aspect_h, zoom=0.35
        )

    if config.layout == "blur_fit":
        return fit_crop(
            source_w, source_h, duration, aspect_w=config.aspect_w, aspect_h=config.aspect_h, zoom=0.0
        )

    if config.centre_only or config.layout == "centre":
        return centre_crop(
            source_w, source_h, duration, aspect_w=config.aspect_w, aspect_h=config.aspect_h
        )

    try:
        observations = sample_faces(
            video, start_s=start_s, end_s=end_s, sample_fps=config.sample_fps
        )
    except FaceDetectionUnavailable as exc:
        log.warning("Face detection unavailable (%s); selecting fallback layout.", exc)
        if config.layout in ("auto", "zoom_fit"):
            return fit_crop(
                source_w, source_h, duration, aspect_w=config.aspect_w, aspect_h=config.aspect_h, zoom=0.35
            )
        if config.layout == "blur_fit":
            return fit_crop(
                source_w, source_h, duration, aspect_w=config.aspect_w, aspect_h=config.aspect_h, zoom=0.0
            )
        return centre_crop(
            source_w,
            source_h,
            duration,
            aspect_w=config.aspect_w,
            aspect_h=config.aspect_h,
            zoom=GENERAL_ZOOM,
        )

    if not observations:
        log.info("No faces detected in %s; using zoom_fit layout.", video.name)
        if config.layout in ("auto", "zoom_fit"):
            return fit_crop(
                source_w,
                source_h,
                duration,
                aspect_w=config.aspect_w,
                aspect_h=config.aspect_h,
                zoom=0.35,
            )
        if config.layout == "blur_fit":
            return fit_crop(
                source_w,
                source_h,
                duration,
                aspect_w=config.aspect_w,
                aspect_h=config.aspect_h,
                zoom=0.0,
            )
        return centre_crop(
            source_w,
            source_h,
            duration,
            aspect_w=config.aspect_w,
            aspect_h=config.aspect_h,
            zoom=GENERAL_ZOOM,
        )

    tracks = build_tracks(observations)
    shots = detect_shots(video, start_s=start_s, end_s=end_s)

    turns = _clip_relative_turns(transcript, start_s, end_s)
    speaker_map = map_tracks_to_speakers(tracks, turns) if turns else {}

    segments: list[CropSegment] = []
    for shot in shots:
        segments.extend(
            _segments_for_shot(
                shot,
                tracks=tracks,
                turns=turns,
                speaker_map=speaker_map,
                source_w=source_w,
                source_h=source_h,
                crop_w=crop_w,
                crop_h=crop_h,
                config=config,
            )
        )

    if not segments:
        return centre_crop(
            source_w, source_h, duration, aspect_w=config.aspect_w, aspect_h=config.aspect_h
        )

    # Guarantee the segments tile the clip exactly; a gap or overlap would
    # desync the concatenated render from the audio.
    segments[0].start_s = 0.0
    segments[-1].end_s = duration
    for index in range(len(segments) - 1):
        segments[index].end_s = segments[index + 1].start_s

    segments = [s for s in segments if s.duration_s > 0.01]

    log.info(
        "Reframed %s into %d segment(s): %s",
        video.name,
        len(segments),
        ", ".join(s.strategy.value for s in segments),
    )
    return CropPath(source_width=source_w, source_height=source_h, segments=segments)


def _clip_relative_turns(
    transcript: Transcript | None, start_s: float, end_s: float
) -> list[tuple[str, float, float]]:
    """Rebase diarization turns onto the clip's timeline, dropping non-overlapping ones."""
    if transcript is None or not transcript.has_diarization:
        return []

    turns: list[tuple[str, float, float]] = []
    for speaker, turn_start, turn_end in transcript.speaker_turns():
        overlap_start = max(turn_start, start_s)
        overlap_end = min(turn_end, end_s)
        if overlap_end > overlap_start:
            turns.append((speaker, overlap_start - start_s, overlap_end - start_s))
    return turns


def _segments_for_shot(
    shot: Shot,
    *,
    tracks: list[FaceTrack],
    turns: list[tuple[str, float, float]],
    speaker_map: dict[str, FaceTrack],
    source_w: int,
    source_h: int,
    crop_w: int,
    crop_h: int,
    config: ReframeConfig,
) -> list[CropSegment]:
    assignments = assign_speakers(
        tracks,
        shot_start_s=shot.start_s,
        shot_end_s=shot.end_s,
        turns=turns,
        speaker_map=speaker_map,
    )

    segments: list[CropSegment] = []
    for assignment in assignments:
        visible = [
            t for t in tracks if t.observations_between(assignment.start_s, assignment.end_s)
        ]

        if assignment.track is not None:
            segments.append(
                _track_segment(
                    assignment.track,
                    start_s=assignment.start_s,
                    end_s=assignment.end_s,
                    source_w=source_w,
                    source_h=source_h,
                    crop_w=crop_w,
                    crop_h=crop_h,
                    config=config,
                )
            )
        elif visible:
            segments.append(
                _wide_segment(
                    visible,
                    start_s=assignment.start_s,
                    end_s=assignment.end_s,
                    source_w=source_w,
                    source_h=source_h,
                    crop_w=crop_w,
                    crop_h=crop_h,
                )
            )
        else:
            segments.append(
                _general_segment(
                    start_s=assignment.start_s,
                    end_s=assignment.end_s,
                    source_w=source_w,
                    source_h=source_h,
                    crop_w=crop_w,
                    crop_h=crop_h,
                )
            )

    return segments


def _track_segment(
    track: FaceTrack,
    *,
    start_s: float,
    end_s: float,
    source_w: int,
    source_h: int,
    crop_w: int,
    crop_h: int,
    config: ReframeConfig,
) -> CropSegment:
    """Frame a single subject, tracking them or locking on if they barely move."""
    observations = track.observations_between(start_s, end_s)
    if not observations:
        return _general_segment(
            start_s=start_s,
            end_s=end_s,
            source_w=source_w,
            source_h=source_h,
            crop_w=crop_w,
            crop_h=crop_h,
        )

    raw = [
        (
            o.t,
            _clamp(o.cx - crop_w / 2, 0, source_w - crop_w),
            _clamp(o.eye_y - EYE_LINE_RATIO * crop_h, 0, source_h - crop_h),
        )
        for o in observations
    ]

    mean_face_width = sum(o.width for o in observations) / len(observations)
    spread_x = max(x for _, x, _ in raw) - min(x for _, x, _ in raw)

    # A close-up, or a subject who barely moves, is better locked than tracked.
    should_lock = (
        mean_face_width > crop_w * LOCK_IF_FACE_WIDER_THAN
        or spread_x < (config.smoothing or SmoothingConfig()).dead_zone_px
    )

    if should_lock or len(raw) < 3:
        x = sum(item[1] for item in raw) / len(raw)
        y = sum(item[2] for item in raw) / len(raw)
        keyframes = [CropKeyframe(t=start_s, x=x, y=y)]
    else:
        smoothing = config.smoothing or SmoothingConfig()
        xs = smooth_series([(t, x) for t, x, _ in raw], smoothing)
        ys = smooth_series([(t, y) for t, _, y in raw], smoothing)
        keyframes = [CropKeyframe(t=t, x=x, y=y) for (t, x), (_, y) in zip(xs, ys, strict=True)]
        # Anchor the ends so the expression covers the whole segment.
        if keyframes[0].t > start_s:
            keyframes.insert(0, CropKeyframe(start_s, keyframes[0].x, keyframes[0].y))
        if keyframes[-1].t < end_s:
            keyframes.append(CropKeyframe(end_s, keyframes[-1].x, keyframes[-1].y))

    return CropSegment(
        start_s=start_s,
        end_s=end_s,
        width=crop_w,
        height=crop_h,
        keyframes=keyframes,
        strategy=Strategy.TRACK,
    )


def _wide_segment(
    visible: list[FaceTrack],
    *,
    start_s: float,
    end_s: float,
    source_w: int,
    source_h: int,
    crop_w: int,
    crop_h: int,
) -> CropSegment:
    """Hold several faces at once — locked, never panning.

    Panning between two people who are both on screen is the most obviously
    robotic thing an auto-reframer does. If they fit, lock on their centroid; if
    they don't, fit the whole frame rather than cutting someone out.
    """
    observations: list[FaceObservation] = [
        o for track in visible for o in track.observations_between(start_s, end_s)
    ]
    if not observations:
        return _general_segment(
            start_s=start_s,
            end_s=end_s,
            source_w=source_w,
            source_h=source_h,
            crop_w=crop_w,
            crop_h=crop_h,
        )

    left = min(o.left for o in observations)
    right = max(o.right for o in observations)
    spread = right - left

    if spread > crop_w * FIT_IF_SPREAD_EXCEEDS:
        return CropSegment(
            start_s=start_s,
            end_s=end_s,
            width=source_w,
            height=source_h,
            keyframes=[CropKeyframe(t=start_s, x=0.0, y=0.0)],
            strategy=Strategy.WIDE,
            fit=True,
        )

    # Avoid centering on the empty dead space between two people!
    # If subjects are separated across > 50% of crop width, frame the active or prominent speaker.
    if len(visible) >= 2 and spread > crop_w * 0.50:
        scored = [(t, t.mouth_activity(start_s, end_s)) for t in visible]
        scored.sort(key=lambda s: s[1], reverse=True)
        if scored[0][1] >= 0.0004:
            return _track_segment(
                scored[0][0],
                start_s=start_s,
                end_s=end_s,
                source_w=source_w,
                source_h=source_h,
                crop_w=crop_w,
                crop_h=crop_h,
                config=ReframeConfig(),
            )
        prom_tracks = []
        for t in visible:
            t_obs = t.observations_between(start_s, end_s)
            if t_obs:
                prom_tracks.append((sum(o.width for o in t_obs) / len(t_obs), t))
        if prom_tracks:
            prom_tracks.sort(key=lambda item: item[0], reverse=True)
            return _track_segment(
                prom_tracks[0][1],
                start_s=start_s,
                end_s=end_s,
                source_w=source_w,
                source_h=source_h,
                crop_w=crop_w,
                crop_h=crop_h,
                config=ReframeConfig(),
            )

    centre_x = (left + right) / 2
    eye_y = sum(o.eye_y for o in observations) / len(observations)

    return CropSegment(
        start_s=start_s,
        end_s=end_s,
        width=crop_w,
        height=crop_h,
        keyframes=[
            CropKeyframe(
                t=start_s,
                x=_clamp(centre_x - crop_w / 2, 0, source_w - crop_w),
                y=_clamp(eye_y - EYE_LINE_RATIO * crop_h, 0, source_h - crop_h),
            )
        ],
        strategy=Strategy.WIDE,
    )


def _general_segment(
    *,
    start_s: float,
    end_s: float,
    source_w: int,
    source_h: int,
    crop_w: int,
    crop_h: int,
) -> CropSegment:
    """No usable face — centre crop."""
    return CropSegment(
        start_s=start_s,
        end_s=end_s,
        width=crop_w,
        height=crop_h,
        keyframes=[CropKeyframe(t=start_s, x=(source_w - crop_w) / 2, y=(source_h - crop_h) / 2)],
        strategy=Strategy.GENERAL,
        zoom=GENERAL_ZOOM,
    )


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high)) if high > low else max(0.0, low)
