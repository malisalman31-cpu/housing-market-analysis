import hashlib
import json
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path
from analysis.pipeline import DATA, METRICS, ROOT, build_payload, create_database, read_rows, verify_snapshot
from analysis.fetch_public_data import CA_GEO

class PublicDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = build_payload()

    def test_all_california_geographies(self):
        self.assertEqual(self.payload["counts"], {"county": 58, "place": 1618, "state": 1})
        self.assertEqual(len(self.payload["records"]), 1677)
        self.assertEqual(len({r["geo_id"] for r in self.payload["records"]}), 1677)

    def test_bulk_filter_rejects_other_states_and_geographic_components(self):
        for geo in ("0400000US06", "0500000US06001", "1600000US0644000"):
            self.assertTrue(CA_GEO.fullmatch(geo))
        for geo in ("0400000US01", "0500000US01001", "1600089US0644000", "1400000US06001000100"):
            self.assertFalse(CA_GEO.fullmatch(geo))

    def test_official_state_values_not_medians_of_local_medians(self):
        state = next(r for r in self.payload["records"] if r["geography"] == "state")
        expected = {"home_value": 734700, "gross_rent": 2036, "income": 99122, "rent_burden": 32.8, "population": 39287377}
        self.assertEqual({k: m["value"] for k, m in state["metrics"].items()}, expected)
        self.assertEqual(state["metrics"]["home_value"]["moe"], 1307)
        self.assertEqual(state["metrics"]["population"]["moe_status"], "controlled")

    def test_every_displayed_value_traces_to_source(self):
        for metric, definition in METRICS.items():
            table = definition["table"]
            source = {r["GEO_ID"]: r for r in read_rows(DATA / f"{table}.txt")}
            for area in self.payload["records"]:
                estimate = area["metrics"][metric]
                raw = source[area["geo_id"]]
                self.assertEqual(estimate["raw_estimate"], float(raw[f"{table}_E001"]))
                self.assertEqual(estimate["raw_moe"], float(raw[f"{table}_M001"]))
                if estimate["status"] == "estimate":
                    self.assertEqual(estimate["value"], estimate["raw_estimate"])
                elif estimate["status"] == "unavailable":
                    self.assertIsNone(estimate["value"])

    def test_sql_special_values_and_bounds(self):
        connection = create_database()
        try:
            for metric, raw, moe, expected, status in (
                ("home_value", 2000001, -333333333, 2000000, "at_least"),
                ("home_value", 9999, -333333333, 10000, "at_most"),
                ("gross_rent", 3501, -333333333, 3500, "at_least"),
                ("rent_burden", 51, -333333333, 50, "at_least"),
                ("rent_burden", 9, -333333333, 10, "at_most"),
                ("income", 250001, -333333333, 250000, "at_least"),
                ("income", -666666666, -222222222, None, "unavailable"),
                ("income", -999999999, -999999999, None, "unavailable"),
                ("income", -888888888, -888888888, None, "unavailable"),
                ("home_value", 12345, -333333333, None, "unavailable"),
                ("population", 0, 12, 0, "estimate"),
            ):
                connection.execute("UPDATE raw_estimates SET raw_estimate=?, raw_moe=? WHERE geo_id='0400000US06' AND metric=?", (raw, moe, metric))
                row = connection.execute("SELECT * FROM estimates WHERE geo_id='0400000US06' AND metric=?", (metric,)).fetchone()
                self.assertEqual((row["value"], row["status"]), (expected, status))
                if moe < 0:
                    self.assertIsNone(row["moe"])
        finally:
            connection.close()

    def test_source_hashes_and_urls(self):
        manifest = verify_snapshot()
        self.assertTrue(all(f["url"].startswith("https://www2.census.gov/") for f in manifest["files"].values()))
        self.assertTrue(all(f["rows"] == 1677 for f in manifest["files"].values()))

    def test_tampered_snapshot_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)
            for file in DATA.iterdir():
                shutil.copy(file, target / file.name)
            (target / "B25077.txt").write_text("corrupt")
            with self.assertRaisesRegex(ValueError, "Checksum mismatch"):
                build_payload(target)

    def test_missing_join_fails_even_with_updated_checksum(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)
            for file in DATA.iterdir():
                shutil.copy(file, target / file.name)
            file = target / "B25077.txt"
            file.write_text("\n".join(file.read_text().splitlines()[:-1]) + "\n")
            manifest = json.loads((target / "manifest.json").read_text())
            manifest["files"]["B25077.txt"]["extract_sha256"] = hashlib.sha256(file.read_bytes()).hexdigest()
            (target / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "Missing or duplicate"):
                create_database(target)

    def test_foreign_keys_and_unique_constraints(self):
        connection = create_database()
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("INSERT INTO raw_estimates VALUES ('unknown', 'income', 1, 1)")
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("INSERT INTO raw_estimates VALUES ('0400000US06', 'income', 1, 1)")
        finally:
            connection.close()

    def test_sql_rankings_exclude_bounded_and_missing_estimates(self):
        connection = create_database()
        try:
            invalid = connection.execute("SELECT COUNT(*) FROM comparisons c JOIN estimates e USING (geo_id, metric) WHERE e.status <> 'estimate'").fetchone()[0]
            self.assertEqual(invalid, 0)
            rows = list(connection.execute("SELECT value FROM comparisons WHERE geography='county' AND metric='home_value' ORDER BY position"))
            values = [r["value"] for r in rows]
            self.assertEqual(values, sorted(values, reverse=True))
            self.assertEqual(len(values), 58)
        finally:
            connection.close()

    def test_browser_artifact_matches_sql_exactly(self):
        browser = json.loads((ROOT.parent / "dist/data/housing.json").read_text())
        self.assertEqual(browser, self.payload)

    def test_offline_build_is_deterministic(self):
        self.assertEqual(build_payload(), self.payload)

if __name__ == "__main__":
    unittest.main()
