"""Build the exact SQL result used by the browser; --check works fully offline."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from pipeline import build_payload, build_summary

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if committed browser data is stale")
    args = parser.parse_args()
    payload = build_payload()
    outputs = {
        ROOT / "dist/data/housing.json": json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n",
        ROOT / "analysis/output/market_summary.json": json.dumps(build_summary(payload), indent=2, sort_keys=True, allow_nan=False) + "\n",
    }
    for path, text in outputs.items():
        if args.check:
            if not path.exists() or path.read_text() != text:
                raise SystemExit(f"{path.relative_to(ROOT)} is stale; run npm run build:data")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
        print(f'{"Verified" if args.check else "Wrote"} {path.relative_to(ROOT)}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
