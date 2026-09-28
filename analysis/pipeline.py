"""Reproducible pandas pipeline for the Housing Market Lab portfolio project."""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np
import pandas as pd


NEIGHBORHOODS = pd.DataFrame(
    [
        ("Beverly Hills", "Westside", 1120, 196_000),
        ("Santa Monica", "Westside", 910, 142_000),
        ("Silver Lake", "Central", 760, 126_000),
        ("Pasadena", "San Gabriel Valley", 625, 112_000),
        ("Long Beach", "South Bay", 545, 92_000),
        ("Inglewood", "South LA", 515, 87_000),
        ("North Hollywood", "San Fernando Valley", 570, 97_000),
        ("Culver City", "Westside", 805, 132_000),
    ],
    columns=["neighborhood", "region", "base_ppsf", "base_income"],
)

HOME_TYPES = pd.DataFrame(
    [("Condo", .94, 850), ("Single-family", 1.12, 1580), ("Townhome", 1.02, 1240), ("Multi-family", 1.07, 1840)],
    columns=["home_type", "type_multiplier", "base_sqft"],
)

FEATURE_GROUPS = {
    "core": ["home_type", "bedrooms", "bathrooms", "square_feet"],
    "pricing": ["sale_price", "price_per_sqft", "market_segment"],
    "location": ["neighborhood", "region"],
    "affordability": ["household_income", "affordability_ratio", "affordability_band"],
    "quality": ["property_age", "condition_score", "quality_band"],
}


@dataclass(frozen=True)
class PipelineResult:
    raw: pd.DataFrame
    clean: pd.DataFrame
    views: dict[str, list[dict]]


def generate_raw_data(count: int = 10_385, seed: int = 202_503) -> pd.DataFrame:
    """Create a deterministic stand-in for the unavailable original source data."""
    if count < 136:
        raise ValueError("count must be at least 136 so quality fixtures can be included")
    rng = np.random.default_rng(seed)
    neighborhood_index = np.arange(count) % len(NEIGHBORHOODS)
    type_index = (np.arange(count) * 3 + rng.integers(0, len(HOME_TYPES), count)) % len(HOME_TYPES)
    places = NEIGHBORHOODS.iloc[neighborhood_index].reset_index(drop=True)
    types = HOME_TYPES.iloc[type_index].reset_index(drop=True)
    bedrooms = np.clip(np.rint(types["base_sqft"].to_numpy() / 500 + rng.random(count) * 1.8 - .65), 1, 5).astype(int)
    bathrooms = np.maximum(1, np.round(bedrooms * .62 + rng.random(count) * 1.15, 1))
    square_feet = np.maximum(480, np.rint(types["base_sqft"].to_numpy() * (.72 + rng.random(count) * .67) + bedrooms * 35)).astype(int)
    property_age = np.rint(2 + rng.random(count) * 88).astype(int)
    condition_score = np.round(62 + rng.random(count) * 36, 1)
    price_per_sqft = np.rint(places["base_ppsf"].to_numpy() * types["type_multiplier"].to_numpy() * (.84 + rng.random(count) * .34) * (1 + (condition_score - 80) / 450)).astype(int)
    sale_price = np.rint(price_per_sqft * square_feet / 1000) * 1000
    household_income = np.rint(places["base_income"].to_numpy() * (.72 + rng.random(count) * .72) / 1000) * 1000
    frame = pd.DataFrame(
        {
            "id": [f"LA-{index:05d}" for index in range(1, count + 1)],
            "neighborhood": places["neighborhood"], "region": places["region"], "home_type": types["home_type"],
            "bedrooms": bedrooms, "bathrooms": bathrooms, "square_feet": square_feet,
            "sale_price": sale_price, "household_income": household_income,
            "property_age": property_age, "condition_score": condition_score,
        }
    )
    frame.loc[:79, "sale_price"] = np.nan
    frame.loc[80:134, "square_feet"] = -1
    return frame


def clean_market_data(frame: pd.DataFrame) -> pd.DataFrame:
    """Coerce types, remove incomplete or impossible rows, and derive five feature groups."""
    required = {"id", "neighborhood", "region", "home_type", "bedrooms", "bathrooms", "square_feet", "sale_price", "household_income", "property_age", "condition_score"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")
    clean = frame.copy()
    numeric = ["bedrooms", "bathrooms", "square_feet", "sale_price", "household_income", "property_age", "condition_score"]
    clean[numeric] = clean[numeric].apply(pd.to_numeric, errors="coerce")
    clean = clean.dropna(subset=required).query("square_feet > 0 and sale_price > 0 and household_income > 0").copy()
    clean["price_per_sqft"] = (clean["sale_price"] / clean["square_feet"]).round().astype(int)
    clean["affordability_ratio"] = (clean["sale_price"] / clean["household_income"]).round(2)
    clean["market_segment"] = pd.cut(clean["sale_price"], bins=[0, 750_000, 1_500_000, np.inf], labels=["Entry", "Mid-market", "Premium"], right=False).astype(str)
    clean["affordability_band"] = pd.cut(clean["affordability_ratio"], bins=[0, 5, 8, np.inf], labels=["Accessible", "Stretched", "Highly stretched"], right=False).astype(str)
    clean["quality_band"] = pd.cut(clean["condition_score"], bins=[0, 72, 86, 101], labels=["Needs work", "Good", "Excellent"], right=False).astype(str)
    return clean.reset_index(drop=True)


def build_market_views(frame: pd.DataFrame) -> dict[str, list[dict]]:
    """Return the three neighborhood views used by the dashboard."""
    metrics = {"price": "sale_price", "affordability": "affordability_ratio", "ppsf": "price_per_sqft"}
    views: dict[str, list[dict]] = {}
    for name, metric in metrics.items():
        grouped = frame.groupby("neighborhood", observed=True).agg(value=(metric, "median"), records=("id", "count")).sort_values("value", ascending=False).reset_index()
        views[name] = grouped.to_dict(orient="records")
    return views


def run_pipeline(count: int = 10_385, seed: int = 202_503) -> PipelineResult:
    raw = generate_raw_data(count=count, seed=seed)
    clean = clean_market_data(raw)
    return PipelineResult(raw=raw, clean=clean, views=build_market_views(clean))
