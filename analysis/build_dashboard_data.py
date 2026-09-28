"""Generate or verify the compact summary artifact used for reproducibility checks."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from pipeline import FEATURE_GROUPS, run_pipeline


OUTPUT = Path(__file__).parent / "output" / "market_summary.json"


def payload() -> dict:
    result = run_pipeline()
    return {
        "provenance": "Deterministic synthetic portfolio recreation; the original source dataset was not provided.",
        "raw_records": len(result.raw),
        "clean_records": len(result.clean),
        "retention_rate": round(len(result.clean) / len(result.raw), 4),
        "feature_groups": FEATURE_GROUPS,
        "views": result.views,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail when the committed summary is stale")
    args = parser.parse_args()
    rendered = json.dumps(payload(), indent=2, sort_keys=True) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != rendered:
            raise SystemExit("analysis/output/market_summary.json is stale; run the build:data script")
        print("market_summary.json is current")
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(rendered)
    print(f"wrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
