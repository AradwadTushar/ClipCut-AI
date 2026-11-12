"""Official YouTube Data API v3 & YouTube Analytics API Engine.

Supports:
1. Multi-channel profile OAuth 2.0 (Gaming channel, Viral channel, Podcast channel).
2. Resumable chunked video uploads with tags, description, and automatic #shorts detection.
3. Automated scheduling via `publishAt` ISO timestamp.
4. Channel growth & retention analytics fetching via YouTube Analytics API.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
except ImportError:  # pragma: no cover
    Request = None  # type: ignore[assignment,misc]
    Credentials = None  # type: ignore[assignment,misc]
    InstalledAppFlow = None  # type: ignore[assignment,misc]
    build = None  # type: ignore[assignment,misc]
    MediaFileUpload = None  # type: ignore[assignment,misc]

from .. import paths
from ..db import store
from ..db.models import YouTubeAnalyticsSnapshot, YouTubeChannel, YouTubeUpload, new_id

log = logging.getLogger(__name__)

# Scopes needed for uploading, managing video metadata, and reading analytics
YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]


@dataclass
class ChannelProfileStatus:
    connected: bool
    channel_id: str | None = None
    title: str | None = None
    custom_url: str | None = None
    profile_name: str = "default"
    subscriber_count: int = 0
    video_count: int = 0
    view_count: int = 0
    message: str = ""


@dataclass
class UploadResult:
    upload_id: str
    video_id: str
    channel_id: str
    title: str
    status: str  # 'scheduled' or 'uploaded'
    youtube_url: str
    scheduled_at: str | None = None


def get_client_secrets_path(custom_path: Path | str | None = None) -> Path:
    """Find location of Google Cloud client_secrets.json.

    Searches in:
    1. Explicit custom path (if provided)
    2. ~/.autoclip/client_secrets.json
    3. Current working directory / client_secrets.json
    4. Project root / client_secrets.json
    5. User Downloads folder for any client_secret*.json
    """
    if custom_path:
        p = Path(custom_path).expanduser().resolve()
        if p.is_file():
            return p

    candidates = [
        paths.root() / "client_secrets.json",
        Path.cwd() / "client_secrets.json",
        Path.cwd().parent / "client_secrets.json",
        Path.home() / ".autoclip" / "client_secrets.json",
    ]
    for c in candidates:
        if c.is_file():
            return c

    downloads = Path.home() / "Downloads"
    if downloads.is_dir():
        matches = sorted(downloads.glob("client_secret*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
        if matches:
            return matches[0]

    return paths.root() / "client_secrets.json"


def _credentials_path(profile_name: str = "default") -> Path:
    """Location where OAuth tokens are cached per profile."""
    dir_path = paths.work_dir().parent / "youtube_profiles"
    dir_path.mkdir(parents=True, exist_ok=True)
    return dir_path / f"{profile_name}_token.json"


def get_profile_credentials(profile_name: str = "default") -> Credentials | None:
    """Retrieve and refresh stored OAuth credentials for a profile."""
    # Check DB first
    channel = store.get_youtube_channel(profile_name)
    token_file = _credentials_path(profile_name)

    creds = None
    if channel and channel.credentials_json:
        try:
            creds = Credentials.from_authorized_user_info(json.loads(channel.credentials_json), YOUTUBE_SCOPES)
        except Exception as e:
            log.warning("Failed parsing DB credentials for profile %s: %s", profile_name, e)

    if not creds and token_file.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(token_file), YOUTUBE_SCOPES)
        except Exception as e:
            log.warning("Failed parsing token file %s: %s", token_file, e)

    if creds:
        if creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                save_profile_credentials(profile_name, creds)
            except Exception as e:
                log.error("Failed refreshing YouTube OAuth token: %s", e)
                return None
        return creds

    return None


def save_profile_credentials(profile_name: str, creds: Credentials) -> None:
    """Save refreshed credentials to disk and DB."""
    creds_json = creds.to_json()
    token_file = _credentials_path(profile_name)
    token_file.write_text(creds_json, encoding="utf-8")

    # Fetch channel details to update DB
    try:
        service = build("youtube", "v3", credentials=creds)
        resp = service.channels().list(part="snippet,statistics", mine=True).execute()
        items = resp.get("items", [])
        if items:
            ch = items[0]
            channel_id = ch["id"]
            title = ch["snippet"]["title"]
            custom_url = ch["snippet"].get("customUrl", "")
            channel_model = YouTubeChannel(
                id=channel_id,
                title=title,
                custom_url=custom_url,
                profile_name=profile_name,
                credentials_json=creds_json,
                is_default=(profile_name == "default"),
            )
            store.upsert_youtube_channel(channel_model)
    except Exception as e:
        log.warning("Could not auto-fetch channel metadata on save: %s", e)


def start_oauth_flow(
    client_secrets_path: Path | str | None = None,
    profile_name: str = "default",
    port: int = 8085,
) -> ChannelProfileStatus:
    """Launch local browser OAuth 2.0 flow to connect a YouTube channel."""
    if InstalledAppFlow is None or build is None:
        return ChannelProfileStatus(
            connected=False,
            profile_name=profile_name,
            message="Google YouTube API packages are not installed. Please run: pip install google-api-python-client google-auth-oauthlib",
        )

    secrets_path = get_client_secrets_path(client_secrets_path)
    if not secrets_path.exists():
        return ChannelProfileStatus(
            connected=False,
            profile_name=profile_name,
            message=f"Missing client_secrets.json (checked {secrets_path} and Downloads folder). Please download your OAuth 2.0 Desktop client credentials from Google Cloud Console.",
        )

    import subprocess
    import sys
    import wsgiref.simple_server
    from google_auth_oauthlib.flow import _ExclusiveWSGIServer, _RedirectWSGIApp, _WSGIRequestHandler

    flow = InstalledAppFlow.from_client_secrets_file(str(secrets_path), YOUTUBE_SCOPES)
    flow.redirect_uri = f"http://localhost:{port}/"
    auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline")

    print(f"\n=======================================================")
    print(f"VISIT THIS URL TO CONNECT YOUTUBE:")
    print(auth_url)
    print(f"=======================================================\n")
    sys.stdout.flush()

    # Try launching native browser on Windows/macOS/Linux
    try:
        if sys.platform == "win32":
            subprocess.run(["powershell.exe", "-NoProfile", "-Command", f'Start-Process "{auth_url}"'], check=False)
        else:
            import webbrowser
            webbrowser.open(auth_url)
    except Exception as e:
        log.warning("Could not auto-launch browser: %s", e)

    wsgi_app = _RedirectWSGIApp("AutoClip YouTube channel connection complete! You may close this tab.")
    local_server = wsgiref.simple_server.make_server(
        "localhost",
        port,
        wsgi_app,
        server_class=_ExclusiveWSGIServer,
        handler_class=_WSGIRequestHandler,
    )

    try:
        local_server.handle_request()
        authorization_response = wsgi_app.last_request_uri.replace("http", "https")
        flow.fetch_token(authorization_response=authorization_response)
        creds = flow.credentials
    finally:
        local_server.server_close()

    save_profile_credentials(profile_name, creds)
    return get_channel_status(profile_name)


def get_channel_status(profile_name: str = "default") -> ChannelProfileStatus:
    """Get current connection state and statistics for a channel profile."""
    creds = get_profile_credentials(profile_name)
    if not creds or not creds.valid:
        return ChannelProfileStatus(
            connected=False,
            profile_name=profile_name,
            message="Channel is not connected. Use start_oauth_flow or connect in Web UI.",
        )

    try:
        service = build("youtube", "v3", credentials=creds)
        resp = service.channels().list(part="snippet,statistics", mine=True).execute()
        items = resp.get("items", [])
        if not items:
            return ChannelProfileStatus(
                connected=False,
                profile_name=profile_name,
                message="OAuth succeeded, but no YouTube channel was found on this Google account.",
            )

        ch = items[0]
        stats = ch.get("statistics", {})
        snippet = ch.get("snippet", {})

        return ChannelProfileStatus(
            connected=True,
            channel_id=ch["id"],
            title=snippet.get("title"),
            custom_url=snippet.get("customUrl"),
            profile_name=profile_name,
            subscriber_count=int(stats.get("subscriberCount", 0)),
            video_count=int(stats.get("videoCount", 0)),
            view_count=int(stats.get("viewCount", 0)),
            message=f"Connected to {snippet.get('title')} ({stats.get('subscriberCount', 0)} subscribers)",
        )
    except Exception as e:
        log.exception("Error checking YouTube channel status: %s", e)
        return ChannelProfileStatus(
            connected=False,
            profile_name=profile_name,
            message=f"Error connecting to YouTube API: {e}",
        )


def upload_youtube_short(
    video_path: Path | str,
    title: str,
    description: str,
    tags: list[str] | None = None,
    *,
    schedule_time_iso: str | None = None,
    privacy: str = "public",  # 'public', 'unlisted', 'private'
    profile_name: str = "default",
    export_id: str = "",
    job_id: str = "",
    on_progress: Callable[[float], None] | None = None,
) -> UploadResult:
    """Upload a video file as a YouTube Short with optional scheduling.

    Args:
        video_path: Absolute path to the MP4 file.
        title: Title of the short (e.g. '$1 vs $1,000,000,000 Yacht! #shorts').
        description: Description including hashtags, citations, and attribution.
        tags: List of keywords/tags.
        schedule_time_iso: Optional ISO 8601 timestamp for scheduled publishing (e.g. '2026-11-10T15:00:00Z').
        privacy: 'public', 'unlisted', or 'private'. When scheduling, privacy is automatically set to 'private'.
        profile_name: Multi-channel profile name (e.g. 'default', 'gaming', 'viral').
        export_id: Associated AutoClip export ID.
        job_id: Associated AutoClip job ID.
        on_progress: Optional callback receiving float progress 0.0 to 1.0.

    Returns:
        UploadResult with YouTube video ID and link.
    """
    path = Path(video_path)
    if not path.exists():
        raise FileNotFoundError(f"Video file not found: {path}")

    creds = get_profile_credentials(profile_name)
    if not creds or not creds.valid:
        raise ValueError(f"YouTube profile '{profile_name}' is not connected or credentials expired.")

    service = build("youtube", "v3", credentials=creds)

    # Ensure title contains #shorts for YouTube algorithm recognition
    if "#shorts" not in title.lower():
        title = f"{title.strip()} #shorts"

    tags = tags or ["shorts", "viral", "clips"]

    status_body: dict[str, Any] = {}
    if schedule_time_iso:
        # Scheduled release requires privacyStatus="private" and publishAt in RFC 3339 format
        status_body["privacyStatus"] = "private"
        # Parse and format to RFC 3339
        dt = datetime.fromisoformat(schedule_time_iso.replace("Z", "+00:00"))
        status_body["publishAt"] = dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        upload_status = "scheduled"
    else:
        status_body["privacyStatus"] = privacy
        upload_status = "uploaded"

    body = {
        "snippet": {
            "title": title[:100],  # YouTube titles max 100 chars
            "description": description[:5000],
            "tags": tags[:50],
            "categoryId": "24",  # Entertainment
        },
        "status": status_body,
    }

    # Resumable upload in 2MB chunks
    media = MediaFileUpload(
        str(path),
        mimetype="video/mp4",
        chunksize=2 * 1024 * 1024,
        resumable=True,
    )

    request = service.videos().insert(part="snippet,status", body=body, media_body=media)

    log.info("Starting YouTube upload for %s (%s)...", title, path.name)
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status and on_progress:
            on_progress(status.progress())
            log.info("YouTube upload progress: %.1f%%", status.progress() * 100)

    video_id = response["id"]
    youtube_url = f"https://youtube.com/shorts/{video_id}"

    # Get channel id
    channel_status = get_channel_status(profile_name)
    channel_id = channel_status.channel_id or "unknown"
    channel_title = channel_status.title or profile_name

    # Record in database
    upload_rec = YouTubeUpload(
        id=new_id(),
        export_id=export_id or new_id(),
        job_id=job_id or "unknown",
        video_id=video_id,
        channel_id=channel_id,
        channel_title=channel_title,
        title=title,
        status=upload_status,
        scheduled_at=schedule_time_iso,
        published_at=None if schedule_time_iso else datetime.now(timezone.utc).isoformat(),
    )
    store.create_youtube_upload(upload_rec)

    log.info("Successfully uploaded YouTube Short: %s -> %s", title, youtube_url)
    return UploadResult(
        upload_id=upload_rec.id,
        video_id=video_id,
        channel_id=channel_id,
        title=title,
        status=upload_status,
        youtube_url=youtube_url,
        scheduled_at=schedule_time_iso,
    )


def fetch_channel_analytics(
    profile_name: str = "default",
    days: int = 30,
) -> dict[str, Any]:
    """Query YouTube Analytics API for channel growth, retention, and viewer data."""
    creds = get_profile_credentials(profile_name)
    if not creds or not creds.valid:
        raise ValueError(f"YouTube profile '{profile_name}' is not connected.")

    analytics_service = build("youtubeAnalytics", "v2", credentials=creds)
    data_service = build("youtube", "v3", credentials=creds)

    # 1. Get channel ID
    ch_resp = data_service.channels().list(part="id,snippet", mine=True).execute()
    items = ch_resp.get("items", [])
    if not items:
        raise ValueError("No channel found for this account.")
    channel_id = items[0]["id"]
    channel_name = items[0]["snippet"]["title"]

    # Calculate date range
    now = datetime.now(timezone.utc)
    start_date = (now - asyncio.timedelta(days=days) if hasattr(asyncio, "timedelta") else datetime.fromtimestamp(now.timestamp() - days * 86400, tz=timezone.utc)).strftime("%Y-%m-%d")
    end_date = now.strftime("%Y-%m-%d")

    # 2. Query aggregate analytics (views, watch time, estimated minutes, average view duration)
    try:
        report = analytics_service.reports().query(
            ids="channel==MINE",
            startDate=start_date,
            endDate=end_date,
            metrics="views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,shares",
            dimensions="day",
            sort="day",
        ).execute()
    except Exception as e:
        log.warning("Could not query daily analytics report: %s", e)
        report = {"rows": []}

    # 3. Query top performing videos / shorts
    try:
        top_vids = analytics_service.reports().query(
            ids="channel==MINE",
            startDate=start_date,
            endDate=end_date,
            metrics="views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes",
            dimensions="video",
            maxResults=10,
            sort="-views",
        ).execute()
    except Exception as e:
        log.warning("Could not query top videos report: %s", e)
        top_vids = {"rows": []}

    result = {
        "channel_id": channel_id,
        "channel_title": channel_name,
        "period_days": days,
        "start_date": start_date,
        "end_date": end_date,
        "daily_trends": report.get("rows", []),
        "column_headers": [col["name"] for col in report.get("columnHeaders", [])],
        "top_videos": top_vids.get("rows", []),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

    # Cache snapshot in database
    snapshot = YouTubeAnalyticsSnapshot(
        id=new_id(),
        channel_id=channel_id,
        period_days=days,
        data_json=json.dumps(result),
    )
    store.save_youtube_analytics_snapshot(snapshot)

    return result

