"""REST API Router for YouTube Channel Connection, Auto-Upload, Scheduling, and Analytics."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from ..db import store
from ..pipeline import youtube, scheduler

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/youtube", tags=["youtube"])


class ConnectRequest(BaseModel):
    profile_name: str = "default"
    client_secrets_json: str | None = None


class UploadRequest(BaseModel):
    export_id: str
    title: str
    description: str
    tags: list[str] = Field(default_factory=list)
    schedule_time_iso: str | None = None
    privacy: Literal["public", "unlisted", "private"] = "public"
    profile_name: str = "default"



@router.get("/schedule/recommendation")
async def get_schedule_recommendation(
    timezone_offset_minutes: int = Query(0),
    daily_cap: int = Query(3),
    profile: str = Query("default"),
    custom_slots: str | None = Query(None),
) -> dict[str, Any]:
    """Calculate optimal high-retention publishing slot for the next YouTube Short."""
    slots_list = [s.strip() for s in custom_slots.split(",") if s.strip()] if custom_slots else None
    rec = await asyncio.to_thread(
        scheduler.calculate_next_optimal_slot,
        timezone_offset_minutes=timezone_offset_minutes,
        daily_cap=daily_cap,
        channel_profile=profile,
        custom_slots=slots_list,
    )
    return {
        "recommended_iso": rec.recommended_iso,
        "recommended_local": rec.recommended_local,
        "slot_name": rec.slot_name,
        "day_label": rec.day_label,
        "today_used": rec.today_used,
        "today_cap": rec.today_cap,
        "status_message": rec.status_message,
        "upcoming_slots": rec.upcoming_slots,
    }

@router.get("/status")
async def get_status(profile: str = Query("default")) -> dict[str, Any]:
    """Check if YouTube account is connected for a channel profile."""
    status = await asyncio.to_thread(youtube.get_channel_status, profile)
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


@router.get("/channels")
async def list_channels() -> list[dict[str, Any]]:
    """List all connected multi-channel profiles."""
    channels = await asyncio.to_thread(store.list_youtube_channels)
    return [
        {
            "id": ch.id,
            "title": ch.title,
            "custom_url": ch.custom_url,
            "profile_name": ch.profile_name,
            "is_default": ch.is_default,
            "updated_at": ch.updated_at,
        }
        for ch in channels
    ]


@router.post("/connect")
async def connect_channel(req: ConnectRequest) -> dict[str, Any]:
    """Trigger OAuth 2.0 connection flow for a channel profile."""
    secrets_path = youtube.get_client_secrets_path()

    if req.client_secrets_json and req.client_secrets_json.strip():
        secrets_path.parent.mkdir(parents=True, exist_ok=True)
        secrets_path.write_text(req.client_secrets_json, encoding="utf-8")

    if not secrets_path.exists():
        raise HTTPException(
            status_code=400,
            detail=f"client_secrets.json not found at {secrets_path}. Please supply your Google Cloud OAuth Client Secrets.",
        )

    try:
        status = await asyncio.to_thread(
            youtube.start_oauth_flow,
            client_secrets_path=secrets_path,
            profile_name=req.profile_name,
        )
        return {
            "connected": status.connected,
            "channel_id": status.channel_id,
            "title": status.title,
            "profile_name": status.profile_name,
            "message": status.message,
        }
    except Exception as exc:
        log.exception("YouTube OAuth flow failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"OAuth connection failed: {exc}") from exc


@router.post("/upload")
async def upload_short(req: UploadRequest) -> dict[str, Any]:
    """Upload or schedule an exported video as a YouTube Short."""
    export = await asyncio.to_thread(store.get_export, req.export_id)
    if export is None:
        raise HTTPException(status_code=404, detail="Export not found.")

    try:
        res = await asyncio.to_thread(
            youtube.upload_youtube_short,
            video_path=export.path,
            title=req.title,
            description=req.description,
            tags=req.tags,
            schedule_time_iso=req.schedule_time_iso,
            privacy=req.privacy,
            profile_name=req.profile_name,
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
    except Exception as exc:
        log.exception("YouTube upload failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"YouTube upload failed: {exc}") from exc


@router.get("/analytics")
async def get_analytics(
    profile: str = Query("default"),
    days: int = Query(30, ge=1, le=365),
) -> dict[str, Any]:
    """Fetch channel growth, retention, and viewer trends."""
    try:
        data = await asyncio.to_thread(
            youtube.fetch_channel_analytics,
            profile_name=profile,
            days=days,
        )
        return data
    except Exception as exc:
        log.exception("Fetching YouTube analytics failed: %s", exc)
        # Try returning cached snapshot if available
        status = await asyncio.to_thread(youtube.get_channel_status, profile)
        if status.channel_id:
            cached = await asyncio.to_thread(store.get_latest_youtube_analytics, status.channel_id)
            if cached:
                import json
                return json.loads(cached.data_json)
        raise HTTPException(status_code=500, detail=f"Failed fetching analytics: {exc}") from exc


@router.get("/uploads/{job_id}")
async def list_job_uploads(job_id: str) -> list[dict[str, Any]]:
    """List all YouTube uploads and scheduled drops for a job."""
    uploads = await asyncio.to_thread(store.list_youtube_uploads_for_job, job_id)
    return [
        {
            "id": u.id,
            "export_id": u.export_id,
            "job_id": u.job_id,
            "video_id": u.video_id,
            "channel_title": u.channel_title,
            "title": u.title,
            "status": u.status,
            "scheduled_at": u.scheduled_at,
            "published_at": u.published_at,
            "youtube_url": f"https://youtube.com/shorts/{u.video_id}",
            "created_at": u.created_at,
        }
        for u in uploads
    ]

