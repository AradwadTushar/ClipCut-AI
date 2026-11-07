"""Google Gemini provider."""

from __future__ import annotations

import asyncio
import logging

from .base import DetectionConfig, LLMProvider, ProviderError, ProviderStatus

log = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-3.6-flash"

SUGGESTED_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3-flash-preview",
]


class GeminiProvider(LLMProvider):
    name = "gemini"
    requires_key = True

    def __init__(self, model: str = "", *, api_key: str | None = None, base_url: str | None = None):
        super().__init__(model or DEFAULT_MODEL, api_key=api_key, base_url=base_url)

    def _client(self):
        try:
            from google import genai
        except ImportError as exc:  # pragma: no cover - google-genai is a core dep
            raise ProviderError(
                "The google-genai package is not installed.", provider=self.name
            ) from exc

        if not self.api_key:
            raise ProviderError(
                "No Gemini API key is set.",
                provider=self.name,
                hint="Add one with `autoclip config set-secret gemini`.",
            )
        return genai.Client(api_key=self.api_key)

    async def _complete(self, system: str, user: str, config: DetectionConfig) -> str:
        from google.genai import types

        client = self._client()
        request_config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=config.temperature,
            # Gemini enforces JSON natively, which removes most parse failures.
            response_mime_type="application/json",
            max_output_tokens=8192,
        )

        fallback_models = [self.model]
        for alt in (
            "gemini-3.5-flash-lite",
            "gemini-flash-lite-latest",
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash",
            "gemini-3-flash-preview",
        ):
            if alt not in fallback_models:
                fallback_models.append(alt)

        last_exc: Exception | None = None
        for model_candidate in fallback_models:
            max_retries = 2
            backoff = 1.5
            for attempt in range(1, max_retries + 1):
                try:
                    response = await asyncio.to_thread(
                        client.models.generate_content,
                        model=model_candidate,
                        contents=user,
                        config=request_config,
                    )
                    return getattr(response, "text", "") or ""
                except Exception as exc:
                    last_exc = exc
                    msg = str(exc).lower()
                    if "limit exceeded" in msg or "quota exceeded" in msg or "daily limit" in msg:
                        log.warning(
                            "Gemini model '%s' quota exceeded. Switching to fallback model...",
                            model_candidate,
                        )
                        break

                    is_transient = (
                        "503" in msg
                        or "unavailable" in msg
                        or "spikes in demand" in msg
                        or "high demand" in msg
                        or "429" in msg
                    )
                    if is_transient and attempt < max_retries:
                        log.warning(
                            "Gemini model '%s' hit transient demand (%s). Retrying in %.1fs...",
                            model_candidate,
                            exc,
                            backoff,
                        )
                        await asyncio.sleep(backoff)
                        backoff *= 2
                    else:
                        break

        raise _translate(last_exc, self.name, self.model) from last_exc

    async def health_check(self) -> ProviderStatus:
        if not self.api_key:
            return ProviderStatus(
                name=self.name, available=False, detail="No API key set", models=SUGGESTED_MODELS
            )
        try:
            client = self._client()
            models = await asyncio.to_thread(lambda: list(client.models.list()))
            names = sorted(
                m.name.removeprefix("models/") for m in models if getattr(m, "name", None)
            )[:50]
        except Exception as exc:
            return ProviderStatus(name=self.name, available=False, detail=str(exc)[:200])
        return ProviderStatus(
            name=self.name, available=True, detail=self.model, models=names or SUGGESTED_MODELS
        )


def _translate(exc: Exception, provider: str, model: str) -> ProviderError:
    message = str(exc)
    lowered = message.lower()

    if "api key" in lowered or "401" in lowered or "permission" in lowered:
        return ProviderError(
            "Google rejected the API key.",
            provider=provider,
            hint="Re-add it with `autoclip config set-secret gemini`.",
        )
    if "429" in lowered or "quota" in lowered or "resource_exhausted" in lowered:
        return ProviderError(
            "Gemini rate limit or quota reached.",
            provider=provider,
            hint="Wait and retry, or switch providers.",
        )
    if "404" in lowered or "not found" in lowered:
        return ProviderError(
            f"Gemini does not recognise the model '{model}'.",
            provider=provider,
            hint=f"Try one of: {', '.join(SUGGESTED_MODELS)}",
        )
    if "safety" in lowered or "blocked" in lowered:
        return ProviderError(
            "Gemini blocked the response under its safety filters.",
            provider=provider,
            hint="This can happen on transcripts with strong language. Try another provider.",
        )
    return ProviderError(f"Gemini request failed: {message}", provider=provider)
