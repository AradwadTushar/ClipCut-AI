"""Unit tests for the Summarized B-Roll Creator (Pipeline 2)."""

from __future__ import annotations

import pytest
from autoclip.pipeline.summarizer import BrollBeat, SummaryScript


def test_summary_script_validation() -> None:
    beat = BrollBeat(
        narration="Look at the realistic physics engine in action.",
        broll_start_s=12.5,
        broll_end_s=18.0,
    )
    assert beat.narration.startswith("Look at")
    assert beat.broll_end_s > beat.broll_start_s

    script = SummaryScript(
        title="5 Insane GTA 6 Features! #shorts",
        hook="Rockstar changed everything in this new build!",
        beats=[beat],
    )
    assert len(script.beats) == 1
    assert script.title.endswith("#shorts")

