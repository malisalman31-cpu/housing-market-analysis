"""SQL-first Housing Market Lab pipeline with a small Python orchestrator."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import random
import sqlite3


NEIGHBORHOODS = [
    ("San Francisco", "Bay Area", 1180, 184_000),
    ("Oakland", "Bay Area", 710, 126_000),
    ("San Jose", "Bay Area", 890, 171_000),
    ("Palo Alto", "Bay Area", 1420, 225_000),
    ("Los Angeles", "Greater Los Angeles", 760, 124_000),
    ("Santa Monica", "Greater Los Angeles", 980, 151_000),
    ("Pasadena", "Greater Los Angeles", 650, 116_000),
    ("Long Beach", "Greater Los Angeles", 565, 96_000),
    ("San Diego", "San Diego County", 720, 121_000),
    ("La Jolla", "San Diego County", 1040, 166_000),
    ("Chula Vista", "San Diego County", 510, 93_000),
    ("Sacramento", "Central Valley", 390, 88_000),
    ("Fresno", "Central Valley", 275, 72_000),
    ("Bakersfield", "Central Valley", 245, 69_000),
    ("Stockton", "Central Valley", 310, 76_000),
    ("Santa Barbara", "Central Coast", 930, 134_000),
    ("San Luis Obispo", "Central Coast", 690, 105_000),
    ("Monterey", "Central Coast", 745, 111_000),
    ("Riverside", "Inland Empire", 385, 86_000),
    ("Palm Springs", "Inland Empire", 455, 82_000),
]

HOME_TYPES = [
    ("Condo", 0.94, 850),
    ("Single-family", 1.12, 1580),
    ("Townhome", 1.02, 1240),
    ("Multi-family", 1.07, 1840),
]

FEATURE_GROUPS = {
    "core": ["home_type", "bedrooms", "bathrooms", "square_feet"],
    "pricing": ["sale_price", "price_per_sqft", "market_segment"],
    "location": ["neighborhood", "region"],
    "affordability": ["household_income", "affordability_ratio", "affordability_band"],
    "quality": ["property_age", "condition_score", "quality_band"],
}

ROOT = Path(__file__).resolve().parent
SCHEMA = ROOT / "schema.sql"
TRANSFORMATIONS = ROOT / "queries.sql"
RAW_COLUMNS = (
    "id", "neighborhood", "region", "home_type", "bedrooms", "bathrooms",
    "square_feet", "sale_price", "household_income", "property_age",
    "condition_score",
)


@dataclass(frozen=True)
class PipelineResult:
    raw: list[dict]
    clean: list[dict]
    views: dict[str, list[dict]]
    validation: dict


def generate_raw_data(count: int = 20_770, seed: int = 202_503) -> list[dict]:
    """Create deterministic input rows; SQL performs every analytical transform."""
    if count < 271:
        raise ValueError("count must be at least 271 so quality fixtures can be included")

    rng = random.Random(seed)
    rows: list[dict] = []
    for index in range(count):
        neighborhood, region, base_ppsf, base_income = NEIGHBORHOODS[index % len(NEIGHBORHOODS)]
        home_type, type_multiplier, base_sqft = HOME_TYPES[(index * 3 + rng.randrange(len(HOME_TYPES))) % len(HOME_TYPES)]
        bedrooms = min(5, max(1, round(base_sqft / 500 + rng.random() * 1.8 - 0.65)))
        bathrooms = max(1, round(bedrooms * 0.62 + rng.random() * 1.15, 1))
        square_feet = max(480, round(base_sqft * (0.72 + rng.random() * 0.67) + bedrooms * 35))
        property_age = round(2 + rng.random() * 88)
        condition_score = round(62 + rng.random() * 36, 1)
        price_per_sqft = round(base_ppsf * type_multiplier * (0.84 + rng.random() * 0.34) * (1 + (condition_score - 80) / 450))
        sale_price = round(price_per_sqft * square_feet / 1000) * 1000
        household_income = round(base_income * (0.72 + rng.random() * 0.72) / 1000) * 1000
        if index < 160:
            sale_price = None
        elif index < 270:
            square_feet = -1
        rows.append(
            {
                "id": f"CA-{index + 1:05d}",
                "neighborhood": neighborhood,
                "region": region,
                "home_type": home_type,
                "bedrooms": bedrooms,
                "bathrooms": bathrooms,
                "square_feet": square_feet,
                "sale_price": sale_price,
                "household_income": household_income,
                "property_age": property_age,
                "condition_score": condition_score,
            }
        )
    return rows


def create_database(rows: list[dict]) -> sqlite3.Connection:
    """Load raw rows and execute the checked-in SQL model in an isolated database."""
    missing = set(RAW_COLUMNS).difference(rows[0] if rows else {})
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")

    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA.read_text())
    connection.executemany(
        """
        INSERT INTO raw_properties (
            id, neighborhood, region, home_type, bedrooms, bathrooms, square_feet,
            sale_price, household_income, property_age, condition_score
        ) VALUES (
            :id, :neighborhood, :region, :home_type, :bedrooms, :bathrooms, :square_feet,
            :sale_price, :household_income, :property_age, :condition_score
        )
        """,
        rows,
    )
    connection.executescript(TRANSFORMATIONS.read_text())
    return connection


def fetch_clean_rows(connection: sqlite3.Connection) -> list[dict]:
    return [dict(row) for row in connection.execute("SELECT * FROM clean_properties ORDER BY id")]


def median_view(connection: sqlite3.Connection, metric: str) -> list[dict]:
    """Compute exact grouped medians using SQLite window functions."""
    allowed_metrics = {"sale_price", "affordability_ratio", "price_per_sqft"}
    if metric not in allowed_metrics:
        raise ValueError(f"Unsupported metric: {metric}")
    query = f"""
        WITH ranked AS (
            SELECT
                neighborhood,
                {metric} AS metric,
                ROW_NUMBER() OVER (PARTITION BY neighborhood ORDER BY {metric}) AS row_number,
                COUNT(*) OVER (PARTITION BY neighborhood) AS records
            FROM clean_properties
        )
        SELECT neighborhood, AVG(metric) AS value, MAX(records) AS records
        FROM ranked
        WHERE row_number IN ((records + 1) / 2, (records + 2) / 2)
        GROUP BY neighborhood
        ORDER BY value DESC, neighborhood ASC
    """
    return [dict(row) for row in connection.execute(query)]


def build_market_views(connection: sqlite3.Connection) -> dict[str, list[dict]]:
    return {
        "price": median_view(connection, "sale_price"),
        "affordability": median_view(connection, "affordability_ratio"),
        "ppsf": median_view(connection, "price_per_sqft"),
    }


def validate_sql_pipeline(connection: sqlite3.Connection) -> dict:
    """Expose row-quality, index, and query-plan checks as a reviewable artifact."""
    raw_records = connection.execute("SELECT COUNT(*) FROM raw_properties").fetchone()[0]
    clean_records = connection.execute("SELECT COUNT(*) FROM clean_properties").fetchone()[0]
    index_names = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_schema WHERE type = 'index' AND name LIKE 'idx_clean_%'"
        )
    }
    expected_indexes = {
        "idx_clean_region_neighborhood",
        "idx_clean_home_type",
        "idx_clean_market_segment",
        "idx_clean_bedrooms",
    }
    plan_rows = connection.execute(
        "EXPLAIN QUERY PLAN SELECT * FROM clean_properties WHERE region = ? AND neighborhood = ?",
        ("Bay Area", "San Francisco"),
    )
    query_plan = " | ".join(str(row[3]) for row in plan_rows)
    return {
        "raw_records": raw_records,
        "clean_records": clean_records,
        "invalid_rows_removed": raw_records - clean_records,
        "indexes": sorted(index_names),
        "all_indexes_present": expected_indexes.issubset(index_names),
        "filter_query_uses_index": "idx_clean_region_neighborhood" in query_plan,
        "filter_query_plan": query_plan,
    }


def run_pipeline(count: int = 20_770, seed: int = 202_503) -> PipelineResult:
    raw = generate_raw_data(count=count, seed=seed)
    connection = create_database(raw)
    try:
        return PipelineResult(
            raw=raw,
            clean=fetch_clean_rows(connection),
            views=build_market_views(connection),
            validation=validate_sql_pipeline(connection),
        )
    finally:
        connection.close()
