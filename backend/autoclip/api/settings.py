"""Settings, secrets, provider health, and system status."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException

from .. import config, models, system
from ..providers import PROVIDERS, build_provider
from ..providers.base import ProviderStatus
from .schemas import (
    McpConfigOut,
    McpInstallOut,
    ProviderStatusOut,
    SecretIn,
    SettingsIn,
    SettingsOut,
    SystemOut,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["settings"])


def _settings_out(settings: config.Settings) -> SettingsOut:
    payload = settings.model_dump(mode="json")
    return SettingsOut(
        active_provider=payload["active_provider"],
        providers=payload["providers"],
        whisper=payload["whisper"],
        clips=payload["clips"],
        ingest=payload["ingest"],
        export=payload["export"],
        insecure_secret_storage=payload["insecure_secret_storage"],
        keys_present={
            name: config.get_secret(name, settings) is not None for name in config.KEYED_PROVIDERS
        }
        | {config.HF_TOKEN_KEY: config.get_secret(config.HF_TOKEN_KEY, settings) is not None},
    )


@router.get("/settings", response_model=SettingsOut)
async def get_settings() -> SettingsOut:
    return _settings_out(config.load())


@router.put("/settings", response_model=SettingsOut)
async def put_settings(payload: SettingsIn) -> SettingsOut:
    """Merge a partial settings update and persist it."""
    settings = config.load()
    updates = payload.model_dump(exclude_none=True)

    if "active_provider" in updates:
        if updates["active_provider"] not in PROVIDERS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown provider. Available: {', '.join(PROVIDERS)}",
            )
        settings.active_provider = updates["active_provider"]

    for section in ("whisper", "clips", "ingest", "export"):
        if section in updates:
            current = getattr(settings, section)
            try:
                setattr(
                    settings,
                    section,
                    current.model_copy(update=updates[section]).model_validate(
                        current.model_dump() | updates[section]
                    ),
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=400, detail=f"Invalid {section} settings: {exc}"
                ) from exc

    if "providers" in updates:
        for name, values in updates["providers"].items():
            provider_settings = settings.provider(name)
            settings.providers[name] = provider_settings.model_copy(update=values)

    if settings.clips.min_duration_s >= settings.clips.max_duration_s:
        raise HTTPException(
            status_code=400, detail="Minimum clip length must be below the maximum."
        )

    config.save(settings)
    return _settings_out(settings)


@router.put("/settings/secrets", status_code=204)
async def put_secret(payload: SecretIn) -> None:
    """Store an API key or token. Values are write-only — never read back."""
    valid = (*config.KEYED_PROVIDERS, config.HF_TOKEN_KEY)
    if payload.key not in valid:
        raise HTTPException(
            status_code=400, detail=f"Unknown secret. Expected one of: {', '.join(valid)}"
        )
    if not payload.value.strip():
        raise HTTPException(status_code=400, detail="The value cannot be empty.")

    config.set_secret(payload.key, payload.value.strip())


@router.delete("/settings/secrets/{key}", status_code=204)
async def delete_secret(key: str) -> None:
    config.delete_secret(key)


@router.get("/providers/status", response_model=list[ProviderStatusOut])
async def providers_status() -> list[ProviderStatusOut]:
    """Live health for every provider, checked concurrently."""
    settings = config.load()

    async def check(name: str) -> ProviderStatusOut:
        provider_cls = PROVIDERS[name]
        has_key = (
            config.get_secret(name, settings) is not None if provider_cls.requires_key else True
        )
        try:
            provider = build_provider(name, settings)
            status: ProviderStatus = await provider.health_check()
        except Exception as exc:
            status = ProviderStatus(name=name, available=False, detail=str(exc)[:200])

        return ProviderStatusOut(
            name=name,
            available=status.available,
            detail=status.detail,
            models=status.models,
            requires_key=provider_cls.requires_key,
            has_key=has_key,
        )

    return list(await asyncio.gather(*(check(name) for name in PROVIDERS)))


def _get_claude_desktop_config_path() -> tuple[Path, bool]:
    import os
    import sys
    from pathlib import Path

    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        primary = Path(appdata) / "Claude" / "claude_desktop_config.json" if appdata else Path.home() / "AppData" / "Roaming" / "Claude" / "claude_desktop_config.json"
        alt = Path(os.path.expandvars(r"%LOCALAPPDATA%\Claude-Data\claude_pzs8sxrjxfjjc\claude_desktop_config.json"))
        if alt.exists() and not primary.exists():
            return alt, True
        return primary, primary.exists()
    elif sys.platform == "darwin":
        primary = Path.home() / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
        return primary, primary.exists()
    else:
        primary = Path.home() / ".config" / "Claude" / "claude_desktop_config.json"
        return primary, primary.exists()


@router.get("/system/mcp-config", response_model=McpConfigOut)
async def get_mcp_config() -> McpConfigOut:
    import json
    import sys

    config_path, exists = _get_claude_desktop_config_path()
    connected = _check_claude_mcp_connected()
    python_exe = sys.executable
    args = ["-m", "autoclip.mcp.server"]

    snippet_obj = {
        "mcpServers": {
            "clipcut": {
                "command": python_exe,
                "args": args,
            }
        }
    }
    json_snippet = json.dumps(snippet_obj, indent=2)

    return McpConfigOut(
        connected=connected,
        config_path=str(config_path),
        config_exists=exists,
        command=python_exe,
        args=args,
        json_snippet=json_snippet,
    )


@router.post("/system/mcp-install", response_model=McpInstallOut)
async def install_mcp_config() -> McpInstallOut:
    import json
    import sys

    config_path, _ = _get_claude_desktop_config_path()
    python_exe = sys.executable
    args = ["-m", "autoclip.mcp.server"]

    try:
        config_path.parent.mkdir(parents=True, exist_ok=True)
        data: dict = {}
        if config_path.exists():
            try:
                data = json.loads(config_path.read_text(encoding="utf-8"))
            except Exception:
                data = {}
        if not isinstance(data, dict):
            data = {}

        servers = data.setdefault("mcpServers", {})
        if not isinstance(servers, dict):
            servers = {}
            data["mcpServers"] = servers

        servers["clipcut"] = {
            "command": python_exe,
            "args": args,
        }

        config_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return McpInstallOut(
            success=True,
            message="ClipCut MCP successfully configured in Claude Desktop! Please restart Claude Desktop to activate.",
            config_path=str(config_path),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to write Claude Desktop configuration: {exc}")


def _check_claude_mcp_connected() -> bool:
    import json
    import os
    from pathlib import Path

    candidates = [
        Path(os.path.expandvars(r"%APPDATA%\Claude\claude_desktop_config.json")),
        Path(os.path.expandvars(r"%LOCALAPPDATA%\Claude-Data\claude_pzs8sxrjxfjjc\claude_desktop_config.json")),
        Path(os.path.expanduser("~/Library/Application Support/Claude/claude_desktop_config.json")),
        Path(os.path.expanduser("~/.config/Claude/claude_desktop_config.json")),
    ]
    for p in candidates:
        if p.exists():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                servers = data.get("mcpServers", {})
                if any("autoclip" in k.lower() or "clipcut" in k.lower() for k in servers.keys()):
                    return True
            except Exception:
                pass
    return False


@router.get("/system", response_model=SystemOut)
async def system_status() -> SystemOut:
    report = await asyncio.to_thread(system.refresh)
    mcp_active = await asyncio.to_thread(_check_claude_mcp_connected)
    return SystemOut(
        ready=report.ready,
        python_version=report.python_version,
        platform=report.platform,
        ffmpeg_version=report.ffmpeg.version,
        has_libass=report.ffmpeg.has_libass,
        nvenc_works=report.ffmpeg.nvenc_works,
        accel=report.gpu.accel,
        gpu_name=report.gpu.name,
        compute_type=report.gpu.compute_type,
        diarization_available=report.deps.whisperx,
        claude_mcp_connected=mcp_active,
    )


@router.post("/system/models", status_code=204)
async def fetch_models() -> None:
    """Download any missing ML model bundles."""
    for key in models.MODELS:
        if not models.is_available(key):
            try:
                await asyncio.to_thread(models.ensure, key)
            except models.ModelDownloadError as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
