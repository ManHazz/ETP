"""
Sensor Fusion Engine
====================
Computes an 'effective fill' score by cross-referencing
all three sensor inputs instead of relying on fill level alone.

Logic:
  1. Start with the raw fill % from ToF/ultrasonic as the base.
  2. Compare against weight to detect hollow bulky waste.
     - If fill is high but weight is disproportionately low,
       the bin is likely full of air (boxes, bags). Reduce score.
  3. Gas readings can bump priority regardless of fill/weight.
     - High gas means decomposition or hazardous fumes —
       the bin needs attention even if it's only half full.

The output is a 0–100 score where:
  - 0–49  = normal, no action needed
  - 50–79 = warning, schedule for next route
  - 80+   = critical, prioritize collection
"""


def compute_effective_fill(
    fill_level_pct: float | None,
    weight_kg: float | None,
    gas_ppm: float | None,
    capacity_liters: float = 120.0,
) -> float | None:
    """
    Returns an effective fill score (0–100) combining all sensor inputs.
    Returns None if fill_level_pct is unavailable.
    """
    if fill_level_pct is None:
        return None

    score = fill_level_pct

    # ── Weight cross-check ────────────────────────────
    # Estimate expected weight based on fill level.
    # A typical 120L bin at 100% fill weighs roughly 40–60 kg.
    # We use 0.4 kg per 1% as a rough baseline.
    if weight_kg is not None and fill_level_pct > 30:
        expected_weight = (fill_level_pct / 100) * capacity_liters * 0.4
        weight_ratio = weight_kg / max(expected_weight, 0.1)

        if weight_ratio < 0.3:
            # Fill is high but weight is very low → bulky hollow waste
            # Reduce effective fill significantly
            score *= 0.5
        elif weight_ratio < 0.6:
            # Somewhat lighter than expected → moderate reduction
            score *= 0.75
        elif weight_ratio > 1.5:
            # Heavier than expected for this fill level → dense waste
            # Bump score up slightly since weight limit may hit first
            score = min(100, score * 1.15)

    # ── Gas priority boost ────────────────────────────
    # High gas readings indicate odor or hazardous decomposition.
    # This bumps the effective fill to ensure the bin gets collected
    # even if it's not physically full.
    if gas_ppm is not None:
        if gas_ppm > 300:
            # Severe — treat as critical regardless of fill
            score = max(score, 85)
        elif gas_ppm > 200:
            # High odor — boost priority
            score = max(score, 70)
        elif gas_ppm > 150:
            # Moderate — gentle nudge upward
            score = max(score, score + 10)

    return round(min(100, max(0, score)), 1)
