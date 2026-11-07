from autoclip.pipeline.scheduler import calculate_next_optimal_slot, DEFAULT_SLOTS

def test_scheduler_returns_recommendation(initialised_db):
    # Test with standard UTC (offset 0)
    rec = calculate_next_optimal_slot(timezone_offset_minutes=0, daily_cap=3)
    assert rec.recommended_iso is not None
    assert rec.slot_name in [s["name"] for s in DEFAULT_SLOTS]
    assert rec.today_cap == 3
    assert len(rec.upcoming_slots) == 3

def test_scheduler_with_ist_timezone(initialised_db):
    # Test with IST offset (-330 minutes)
    rec = calculate_next_optimal_slot(timezone_offset_minutes=-330, daily_cap=3)
    assert rec.recommended_iso is not None
    assert rec.day_label in ["Today", "Tomorrow"]
    assert rec.today_used >= 0
