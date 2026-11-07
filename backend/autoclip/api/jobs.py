"""Job lifecycle and the SSE progress stream."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..config import load as load_settings
from ..db import store
from ..db.models import Job, new_id
from ..jobs.events import broker
from ..jobs.queue import queue
from .schemas import JobCreateIn, JobOut, JobSettingsIn, SummarizeJobIn

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _apply_overrides(settings, overrides: JobSettingsIn):
    """Layer per-job overrides on top of saved settings."""
    merged = settings.model_copy(deep=True)

    if overrides.provider:
        merged.active_provider = overrides.provider
    if overrides.whisper_model:
        merged.whisper.model = overrides.whisper_model
    if overrides.language is not None:
        merged.whisper.language = overrides.language
    if overrides.diarization is not None:
        merged.whisper.diarization = overrides.diarization
    if overrides.min_duration_s is not None:
        merged.clips.min_duration_s = overrides.min_duration_s
    if overrides.max_duration_s is not None:
        merged.clips.max_duration_s = overrides.max_duration_s
    if overrides.max_clips is not None:
        merged.clips.max_clips = overrides.max_clips
    if overrides.caption_style:
        merged.export.caption_style = overrides.caption_style
    if overrides.ratio:
        merged.export.ratio = overrides.ratio

    return merged


@router.post("", response_model=JobOut, status_code=201)
async def create_job(payload: JobCreateIn) -> JobOut:
    source = await asyncio.to_thread(store.get_source, payload.source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found.")

    settings = _apply_overrides(load_settings(), payload.settings)
    if settings.clips.min_duration_s >= settings.clips.max_duration_s:
        raise HTTPException(
            status_code=400, detail="Minimum clip length must be below the maximum."
        )

    job = Job(
        id=new_id(),
        source_id=source.id,
        provider=settings.active_provider,
        settings=settings.model_dump(mode="json"),
    )
    await asyncio.to_thread(store.create_job, job)
    queue.notify()

    return JobOut.of(job, source)


@router.get("", response_model=list[JobOut])
async def list_jobs(limit: int = 25) -> list[JobOut]:
    jobs = await asyncio.to_thread(store.list_jobs, limit)
    out: list[JobOut] = []
    for job in jobs:
        source = await asyncio.to_thread(store.get_source, job.source_id)
        out.append(JobOut.of(job, source))
    return out


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: str) -> JobOut:
    job = await asyncio.to_thread(store.get_job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    source = await asyncio.to_thread(store.get_source, job.source_id)
    return JobOut.of(job, source)


@router.get("/{job_id}/events")
async def job_events(job_id: str, request: Request) -> EventSourceResponse:
    """Stream progress for a job as Server-Sent Events."""
    job = await asyncio.to_thread(store.get_job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    async def stream():
        # Send the current state immediately: a client connecting mid-job (or
        # reconnecting) must not wait for the next progress tick to render.
        current = await asyncio.to_thread(store.get_job, job_id)
        if current is not None:
            yield {
                "event": "snapshot",
                "data": JobOut.of(current).model_dump_json(),
            }
            if current.status in ("done", "failed", "cancelled"):
                return

        async for event in broker.subscribe(job_id):
            if await request.is_disconnected():
                break
            yield {"event": event.type, "data": event.to_sse().split("data: ", 1)[-1].strip()}

    return EventSourceResponse(stream())


@router.post("/{job_id}/cancel", response_model=JobOut)
async def cancel_job(job_id: str) -> JobOut:
    job = await asyncio.to_thread(store.get_job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    if not queue.cancel(job_id):
        raise HTTPException(
            status_code=409, detail=f"Job is already {job.status}; nothing to cancel."
        )

    updated = await asyncio.to_thread(store.get_job, job_id)
    return JobOut.of(updated or job)


@router.post("/{job_id}/retry", response_model=JobOut)
async def retry_job(job_id: str) -> JobOut:
    """Requeue a failed or cancelled job.

    Completed stages left their artifacts in ``work/{job_id}/``, so the retry
    resumes at the stage that failed rather than starting over.
    """
    job = await asyncio.to_thread(store.get_job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status not in ("failed", "cancelled"):
        raise HTTPException(
            status_code=409,
            detail=f"Only failed or cancelled jobs can be retried (this one is {job.status}).",
        )

    await asyncio.to_thread(store.update_job, job_id, status="queued", error=None, progress=0.0)
    queue.notify()

    updated = await asyncio.to_thread(store.get_job, job_id)
    return JobOut.of(updated or job)


@router.get("/{job_id}/clips")
async def job_clips(job_id: str):
    from .clips import list_clips_for_job

    return await list_clips_for_job(job_id)


@router.get("/{job_id}/transcript")
async def get_job_transcript(job_id: str) -> dict:
    """Retrieve full transcript, formatted timestamp blocks, and pre-engineered Claude prompt."""
    from ..pipeline.runner import JobWorkspace
    from ..pipeline.summarizer import build_summarize_prompt, format_transcript_for_prompt
    from ..pipeline.transcript import Transcript

    job = await asyncio.to_thread(store.get_job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    source = await asyncio.to_thread(store.get_source, job.source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found.")

    workspace = JobWorkspace(job_id)
    if not workspace.transcript.exists():
        raise HTTPException(status_code=404, detail="Transcript has not been generated for this job yet.")

    transcript = await asyncio.to_thread(Transcript.load, workspace.transcript)
    formatted_text = format_transcript_for_prompt(transcript)
    claude_prompt = build_summarize_prompt(
        source_title=source.title,
        source_duration_s=source.duration_s,
        formatted_transcript=formatted_text,
        instructions="",
        target_duration=60,
    )

    return {
        "job_id": job_id,
        "source_title": source.title,
        "source_duration_s": round(source.duration_s, 2),
        "word_count": len(transcript.words),
        "text": transcript.text,
        "formatted_text": formatted_text,
        "claude_prompt": claude_prompt,
    }


@router.get("/{job_id}/transcript/download")
async def download_job_transcript(job_id: str, format: str = "txt"):
    """Download transcript file as text or raw JSON."""
    from ..pipeline.runner import JobWorkspace
    from ..pipeline.summarizer import format_transcript_for_prompt
    from ..pipeline.transcript import Transcript

    job = await asyncio.to_thread(store.get_job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    workspace = JobWorkspace(job_id)
    if not workspace.transcript.exists():
        raise HTTPException(status_code=404, detail="Transcript has not been generated for this job yet.")

    if format == "json":
        data = workspace.transcript.read_text(encoding="utf-8")
        return Response(
            content=data,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{job_id}_transcript.json"'},
        )

    transcript = await asyncio.to_thread(Transcript.load, workspace.transcript)
    formatted_text = format_transcript_for_prompt(transcript)
    return PlainTextResponse(
        content=formatted_text,
        headers={"Content-Disposition": f'attachment; filename="{job_id}_transcript.txt"'},
    )


@router.post("/{job_id}/summarize")
async def summarize_job_endpoint(job_id: str, payload: SummarizeJobIn | None = None) -> dict:
    """Create a high-retention B-roll Short summarizing the video with AI commentary."""
    from ..pipeline.summarizer import SummaryScript, create_broll_short

    payload = payload or SummarizeJobIn()
    parsed_script = None
    if payload.custom_script:
        try:
            parsed_script = SummaryScript.model_validate(payload.custom_script)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Invalid custom script schema: {exc}") from exc

    try:
        res = await create_broll_short(
            job_id,
            instructions=payload.instructions,
            target_duration=payload.target_duration,
            script=parsed_script,
            provider_name=payload.provider,
            voice=payload.voice,
            rate=payload.rate,
            caption_style=payload.caption_style,
            ambient_volume=payload.ambient_volume,
            ratio=payload.ratio,
        )
        return res.to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("Summarize B-roll short failed for job %s", job_id)
        raise HTTPException(status_code=500, detail=f"B-roll summary short failed: {exc}") from exc

class GenerateScriptsIn(BaseModel):
    instructions: str = ""
    target_duration: int = 75
    count: int = 3
    provider: str | None = None


class IterateScriptIn(BaseModel):
    previous_script_id: str | None = None
    previous_script: dict[str, Any] | None = None
    feedback: str
    target_duration: int = 75
    provider: str | None = None


@router.get("/{job_id}/exports")
async def list_job_exports(job_id: str) -> list[dict[str, Any]]:
    """List all finished video exports for this job (Pipelines 1, 2, and 3)."""
    job = await asyncio.to_thread(store.get_job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    exports = await asyncio.to_thread(store.list_exports_for_job, job_id)
    results = []
    for e in exports:
        p = Path(e.path)
        exists = p.exists()
        size_bytes = p.stat().st_size if exists else e.size_bytes
        script_data = None
        if e.script_json:
            try:
                script_data = json.loads(e.script_json)
            except Exception:
                pass
        results.append({
            "id": e.id,
            "clip_id": e.clip_id,
            "job_id": e.job_id or job_id,
            "pipeline_type": e.pipeline_type,
            "title": e.title or p.stem.replace("_", " ").title(),
            "path": e.path,
            "filename": p.name,
            "ratio": e.ratio,
            "style": e.style,
            "size_bytes": size_bytes,
            "size_mb": round(size_bytes / (1024 * 1024), 2),
            "download_url": f"/api/exports/{e.id}/download",
            "stream_url": f"/api/exports/{e.id}/stream",
            "exists": exists,
            "script": script_data,
            "created_at": e.created_at,
        })
    return results


@router.get("/{job_id}/scripts")
async def list_job_scripts_endpoint(job_id: str, pipeline: str | None = None) -> list[dict[str, Any]]:
    """List all saved scripts and iteration history for this job."""
    scripts = await asyncio.to_thread(store.list_job_scripts, job_id, pipeline)
    results = []
    for s in scripts:
        try:
            s_data = json.loads(s.script_json)
        except Exception:
            s_data = {}
        results.append({
            "id": s.id,
            "job_id": s.job_id,
            "version": s.version,
            "pipeline_type": s.pipeline_type,
            "angle_title": s.angle_title,
            "title": s.title,
            "hook": s.hook,
            "script": s_data,
            "source_agent": s.source_agent,
            "feedback": s.feedback,
            "created_at": s.created_at,
        })
    return results


@router.post("/{job_id}/scripts/generate")
async def generate_scripts_endpoint(job_id: str, payload: GenerateScriptsIn | None = None) -> list[dict[str, Any]]:
    """Generate 3 distinct creative script angles for this job."""
    from ..pipeline.summarizer import plan_multi_summary_scripts
    payload = payload or GenerateScriptsIn()
    scripts = await plan_multi_summary_scripts(
        job_id,
        instructions=payload.instructions,
        target_duration=payload.target_duration,
        count=payload.count,
        provider_name=payload.provider,
    )
    return [s.model_dump() for s in scripts]


@router.post("/{job_id}/scripts/iterate")
async def iterate_script_endpoint(job_id: str, payload: IterateScriptIn) -> dict[str, Any]:
    """Generate an improved script iteration incorporating user feedback."""
    from ..pipeline.summarizer import iterate_summary_script
    revised = await iterate_summary_script(
        job_id,
        previous_script_id=payload.previous_script_id,
        previous_script_data=payload.previous_script,
        feedback=payload.feedback,
        target_duration=payload.target_duration,
        provider_name=payload.provider,
    )
    return revised.model_dump()
