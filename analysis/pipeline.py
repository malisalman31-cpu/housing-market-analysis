"""Official ACS California extract -> validated SQLite views -> one browser dataset."""
from __future__ import annotations

import csv
import hashlib
import json
import math
import sqlite3
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "data"
METRICS = {
    "home_value": {"table": "B25077", "label": "Median home value", "unit": "USD",
                   "universe": "Owner-occupied housing units", "codes": (9999, 10000, 2000001, 2000000)},
    "gross_rent": {"table": "B25064", "label": "Median monthly gross rent", "unit": "USD/month",
                  "universe": "Renter-occupied housing units paying cash rent", "codes": (99, 100, 3501, 3500)},
    "income": {"table": "B19013", "label": "Median household income", "unit": "USD/year",
               "universe": "Households; past 12 months, in 2024 inflation-adjusted dollars", "codes": (2499, 2500, 250001, 250000)},
    "rent_burden": {"table": "B25071", "label": "Median rent share of income", "unit": "percent",
                    "universe": "Renter-occupied housing units paying cash rent; computable income ratios", "codes": (9, 10, 51, 50)},
    "population": {"table": "B01003", "label": "Population", "unit": "people",
                   "universe": "Total population", "codes": (None, None, None, None)},
}


def read_rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream, delimiter="|"))


def verify_snapshot(directory: Path = DATA) -> dict:
    manifest = json.loads((directory / "manifest.json").read_text())
    expected = {"geography.txt", *(f'{m["table"]}.txt' for m in METRICS.values())}
    if set(manifest["files"]) != expected:
        raise ValueError("Snapshot source files do not match the configured tables")
    for filename, source in manifest["files"].items():
        content = (directory / filename).read_bytes()
        if hashlib.sha256(content).hexdigest() != source["extract_sha256"]:
            raise ValueError(f"Checksum mismatch: {filename}")
    return manifest


def create_database(directory: Path = DATA) -> sqlite3.Connection:
    verify_snapshot(directory)
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript((ROOT / "schema.sql").read_text())
    kinds = {"040": "state", "050": "county", "160": "place"}
    geographies = read_rows(directory / "geography.txt")
    for geo in geographies:
        if geo["STATE"] != "06" or geo["COMPONENT"] != "00" or geo["SUMLEVEL"] not in kinds:
            raise ValueError("Unexpected geography in California extract")
        connection.execute("INSERT INTO geographies VALUES (?, ?, ?)",
                           (geo["GEO_ID"], geo["NAME"].removesuffix(", California"), kinds[geo["SUMLEVEL"]]))
    geo_ids = {g["GEO_ID"] for g in geographies}
    for metric, definition in METRICS.items():
        table = definition["table"]
        connection.execute("INSERT INTO metric_definitions VALUES (?, ?, ?, ?, ?, ?)",
                           (metric, table, *definition["codes"]))
        rows = read_rows(directory / f"{table}.txt")
        if {row["GEO_ID"] for row in rows} != geo_ids or len(rows) != len(geo_ids):
            raise ValueError(f"Missing or duplicate geographic joins in {table}")
        for row in rows:
            values = (float(row[f"{table}_E001"]), float(row[f"{table}_M001"]))
            if not all(math.isfinite(value) for value in values):
                raise ValueError(f"Non-finite Census value in {table}")
            connection.execute("INSERT INTO raw_estimates VALUES (?, ?, ?, ?)",
                               (row["GEO_ID"], metric, *values))
    connection.executescript((ROOT / "queries.sql").read_text())
    connection.commit()
    return connection


def build_payload(directory: Path = DATA) -> dict:
    manifest = verify_snapshot(directory)
    connection = create_database(directory)
    try:
        counts = {row["geography"]: row["count"] for row in connection.execute(
            "SELECT geography, COUNT(*) AS count FROM geographies GROUP BY geography")}
        if counts.get("county") != 58 or counts.get("state") != 1 or counts.get("place", 0) < 1500:
            raise ValueError(f"Incomplete statewide coverage: {counts}")
        records = {row["geo_id"]: {**dict(row), "metrics": {}} for row in connection.execute(
            "SELECT * FROM geographies ORDER BY geography, name, geo_id")}
        for row in connection.execute("SELECT * FROM estimates ORDER BY geo_id, metric"):
            value = dict(row)
            geo_id, metric = value.pop("geo_id"), value.pop("metric")
            records[geo_id]["metrics"][metric] = value
        if any(len(row["metrics"]) != len(METRICS) for row in records.values()):
            raise ValueError("Incomplete metric coverage")
        metadata = {key: {k: v for k, v in definition.items() if k != "codes"}
                    for key, definition in METRICS.items()}
        return {"schema_version": 2, "source": manifest, "counts": counts, "metrics": metadata,
                "records": list(records.values())}
    finally:
        connection.close()


def build_summary(payload: dict) -> dict:
    return {"source": payload["source"]["dataset"], "counts": payload["counts"],
            "state": next(row for row in payload["records"] if row["geography"] == "state"),
            "quality": {metric: {status: sum(r["metrics"][metric]["status"] == status for r in payload["records"])
                                 for status in ("estimate", "at_least", "at_most", "unavailable")}
                        for metric in METRICS}}
