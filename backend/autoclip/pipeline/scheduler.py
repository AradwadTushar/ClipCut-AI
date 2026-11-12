"""Smart YouTube Shorts Publishing Cadence & Time-Slot Scheduler.

Prevents spamming the YouTube algorithm with bulk uploads and enforces high-retention
audience posting windows (Midday lunch, Evening rush, Night prime time).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from ..db import store

# Standard High-Retention YouTube Shorts Windows (in local time)
DEFAULT_SLOTS = [
    {"hour": 12, "minute": 0, "name": "Midday Lunch Peak (12:00 PM)", "key": "lunch"},
    {"hour": 17, "minute": 30, "name": "Post-Work / Commute Rush (5:30 PM)", "key": "rush"},
    {"hour": 20, "minute": 30, "name": "Night Prime Leisure (8:30 PM)", "key": "prime"},
    {"hour": 9, "minute": 0, "name": "Morning Scroll (9:00 AM)", "key": "morning"},
    {"hour": 15, "minute": 0, "name": "Afternoon Coffee Break (3:00 PM)", "key": "afternoon"},
]


@dataclass
class SlotRecommendation:
    recommended_iso: str
    recommended_local: str
    slot_name: str
    day_label: str
    today_used: int
    today_cap: int
    status_message: str
    upcoming_slots: list[dict[str, Any]] = field(default_factory=list)


def calculate_next_optimal_slot(
    timezone_offset_minutes: int = 0,
    daily_cap: int = 3,
    channel_profile: str = "default",
    custom_slots: list[str] | None = None,
) -> SlotRecommendation:
    """Calculate the next available high-retention publishing slot.

    Args:
        timezone_offset_minutes: Difference between UTC and client local time in minutes.
            e.g., India IST (+5:30) is -330 in JS Date.getTimezoneOffset().
            We invert it to get positive offset: tz_delta = timedelta(minutes=-timezone_offset_minutes).
        daily_cap: Maximum recommended Shorts to publish per 24h window (default: 3).
        channel_profile: Target channel profile.
        custom_slots: Optional list of custom slot times in "HH:MM" 24h format.
    """
    tz_delta = timedelta(minutes=-timezone_offset_minutes)
    client_tz = timezone(tz_delta)
    now_local = datetime.now(client_tz)

    # Resolve active slots (from custom_slots or defaults)
    active_slots: list[dict[str, Any]] = []
    if custom_slots:
        for idx, cs in enumerate(custom_slots[:daily_cap]):
            try:
                parts = cs.strip().split(":")
                h, m = int(parts[0]), int(parts[1])
                am_pm = "AM" if h < 12 else "PM"
                disp_h = h % 12 or 12
                active_slots.append({
                    "hour": h,
                    "minute": m,
                    "name": f"Slot {idx + 1} ({disp_h}:{m:02d} {am_pm})",
                    "key": f"slot_{idx + 1}",
                })
            except Exception:
                pass

    if not active_slots:
        active_slots = DEFAULT_SLOTS[:daily_cap]
    else:
        # Sort chronologically by hour and minute
        active_slots.sort(key=lambda s: s["hour"] * 60 + s["minute"])

    # 1. Inspect existing uploads from DB
    existing_uploads = store.list_all_youtube_uploads(limit=100)

    # Map existing uploads into scheduled dates & hours
    booked_times: list[datetime] = []
    for u in existing_uploads:
        time_str = u.scheduled_at or u.published_at or u.created_at
        if not time_str:
            continue
        try:
            # Parse ISO time
            dt_utc = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
            dt_local = dt_utc.astimezone(client_tz)
            booked_times.append(dt_local)
        except Exception:
            pass

    # Count today's booked slots
    today_date = now_local.date()
    today_booked = [t for t in booked_times if t.date() == today_date]
    today_used = len(today_booked)

    # 2. Iterate through days (Today, Tomorrow, Day + 2, up to 7 days)
    recommended_dt: datetime | None = None
    recommended_slot_name = ""
    day_label = ""
    status_msg = ""

    for day_offset in range(7):
        target_date = today_date + timedelta(days=day_offset)
        day_booked = [t for t in booked_times if t.date() == target_date]

        # If day is already at cap, skip to next day
        if len(day_booked) >= daily_cap:
            continue

        for slot_idx, slot in enumerate(active_slots):
            candidate_dt = datetime(
                year=target_date.year,
                month=target_date.month,
                day=target_date.day,
                hour=slot["hour"],
                minute=slot["minute"],
                second=0,
                tzinfo=client_tz,
            )

            # Must be at least 20 minutes in the future from right now
            if candidate_dt <= now_local + timedelta(minutes=20):
                continue

            # Check if any booked upload is within 100 minutes of this slot
            is_collision = any(
                abs((b - candidate_dt).total_seconds()) < 100 * 60 for b in day_booked
            )
            if not is_collision:
                recommended_dt = candidate_dt
                recommended_slot_name = slot["name"]
                if day_offset == 0:
                    day_label = "Today"
                    status_msg = f"Slot {slot_idx + 1} of {daily_cap} available today."
                elif day_offset == 1:
                    day_label = "Tomorrow"
                    status_msg = f"Today's cadence is full ({today_used}/{daily_cap}). Spacing to tomorrow."
                else:
                    day_label = target_date.strftime("%A, %b %d")
                    status_msg = f"Earlier slots booked. Next open opening on {day_label}."
                break

        if recommended_dt is not None:
            break

    # Fallback if somehow all 7 days were completely saturated
    if recommended_dt is None:
        tomorrow_date = today_date + timedelta(days=1)
        recommended_dt = datetime(
            year=tomorrow_date.year,
            month=tomorrow_date.month,
            day=tomorrow_date.day,
            hour=12,
            minute=0,
            tzinfo=client_tz,
        )
        recommended_slot_name = DEFAULT_SLOTS[0]["name"]
        day_label = "Tomorrow"
        status_msg = "Reserved in tomorrow's primary window."

    # Format output
    iso_str = recommended_dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    local_str = recommended_dt.strftime("%Y-%m-%d %I:%M %p")

    # Build calendar overview for UI
    upcoming_overview: list[dict[str, Any]] = []
    for day_offset in range(3):
        d = today_date + timedelta(days=day_offset)
        booked = [t for t in booked_times if t.date() == d]
        upcoming_overview.append({
            "date": d.isoformat(),
            "label": "Today" if day_offset == 0 else ("Tomorrow" if day_offset == 1 else d.strftime("%A")),
            "slots_used": len(booked),
            "slots_cap": daily_cap,
        })

    return SlotRecommendation(
        recommended_iso=iso_str,
        recommended_local=local_str,
        slot_name=recommended_slot_name,
        day_label=day_label,
        today_used=today_used,
        today_cap=daily_cap,
        status_message=status_msg,
        upcoming_slots=upcoming_overview,
    )

