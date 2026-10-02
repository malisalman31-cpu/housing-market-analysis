"""Refresh the checked-in California extract from official ACS bulk files.

No API key or third-party data provider. Network is used only by this explicit
refresh command; builds and the website use the verified local snapshot.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
BASE = "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/"
TABLES = ("B01003", "B19013", "B25064", "B25071", "B25077")
CA_GEO = re.compile(r"(?:0400000US06|0500000US06\d{3}|1600000US06\d{5})$")


def fetch_extract(relative_url: str, target: Path) -> dict:
    url = BASE + relative_url
    digest = hashlib.sha256()
    byte_count = 0
    # Download completely before parsing so transport errors never publish partial data.
    with tempfile.TemporaryFile() as downloaded:
        with urllib.request.urlopen(url, timeout=120) as response:
            while chunk := response.read(1024 * 1024):
                downloaded.write(chunk)
                digest.update(chunk)
                byte_count += len(chunk)
        downloaded.seek(0)
        reader = csv.DictReader(io.TextIOWrapper(downloaded, encoding="utf-8-sig"), delimiter="|")
        if "GEO_ID" not in (reader.fieldnames or []):
            raise ValueError(f"Unexpected Census file: {url}")
        rows = [row for row in reader if CA_GEO.fullmatch(row["GEO_ID"])]
        fields = reader.fieldnames
    if len(rows) < 1500 or len({row["GEO_ID"] for row in rows}) != len(rows):
        raise ValueError(f"Incomplete or duplicate California geography in {url}")
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fields, delimiter="|", lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    content = buffer.getvalue().encode()
    target.write_bytes(content)
    return {"url": url, "source_sha256": digest.hexdigest(), "source_bytes": byte_count,
            "extract_sha256": hashlib.sha256(content).hexdigest(), "rows": len(rows)}


def main() -> None:
    # Only replace the snapshot after every source has downloaded and validated.
    with tempfile.TemporaryDirectory() as temporary:
        staging = Path(temporary)
        sources = {}
        files = {"geography.txt": "documentation/Geos20245YR.txt"}
        files.update({f"{table}.txt": f"data/5YRData/acsdt5y2024-{table.lower()}.dat" for table in TABLES})
        for filename, relative in files.items():
            print(f"Downloading {filename}...", flush=True)
            sources[filename] = fetch_extract(relative, staging / filename)
        manifest = {"publisher": "U.S. Census Bureau", "dataset": "2020–2024 ACS 5-year estimates",
                    "release_date": "2026-01-29", "retrieved_at": datetime.now(timezone.utc).isoformat(),
                    "source_page": "https://www.census.gov/programs-surveys/acs/data/summary-file.2024.html",
                    "geography": "California state, all counties, and all census places (cities and CDPs)",
                    "files": sources}
        output = ROOT / "data"
        output.mkdir(exist_ok=True)
        for filename in files:
            (output / filename).write_bytes((staging / filename).read_bytes())
        (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("California snapshot saved. Run npm run build:data, then npm run check.")


if __name__ == "__main__":
    main()
