import unittest

from analysis.pipeline import (
    FEATURE_GROUPS,
    create_database,
    generate_raw_data,
    median_view,
    run_pipeline,
)


class SqlPipelineTests(unittest.TestCase):
    def test_generation_is_deterministic(self):
        self.assertEqual(generate_raw_data(300, 7), generate_raw_data(300, 7))

    def test_default_pipeline_retains_exact_portfolio_record_count(self):
        result = run_pipeline()
        self.assertEqual(len(result.raw), 20_770)
        self.assertEqual(len(result.clean), 20_500)
        self.assertEqual(result.validation["invalid_rows_removed"], 270)

    def test_sql_derives_all_feature_groups(self):
        result = run_pipeline(400)
        expected = {column for columns in FEATURE_GROUPS.values() for column in columns}
        self.assertTrue(expected.issubset(result.clean[0]))
        self.assertTrue(all(row["square_feet"] > 0 for row in result.clean))
        self.assertTrue(all(row["sale_price"] > 0 for row in result.clean))

    def test_required_columns_are_validated_before_sql_load(self):
        with self.assertRaisesRegex(ValueError, "Missing required columns"):
            create_database([{"id": "x"}])

    def test_market_views_cover_neighborhoods_and_sort_descending(self):
        result = run_pipeline(500)
        for rows in result.views.values():
            self.assertEqual(len(rows), 20)
            values = [row["value"] for row in rows]
            self.assertEqual(values, sorted(values, reverse=True))

    def test_generation_rejects_too_few_rows(self):
        with self.assertRaisesRegex(ValueError, "at least 271"):
            generate_raw_data(50)

    def test_sql_classification_boundaries(self):
        rows = generate_raw_data(300)
        rows[270]["sale_price"] = 749_999
        rows[271]["sale_price"] = 750_000
        rows[272]["sale_price"] = 1_500_000
        connection = create_database(rows)
        try:
            segments = {
                row["id"]: row["market_segment"]
                for row in connection.execute(
                    "SELECT id, market_segment FROM clean_properties WHERE id IN (?, ?, ?)",
                    (rows[270]["id"], rows[271]["id"], rows[272]["id"]),
                )
            }
        finally:
            connection.close()
        self.assertEqual(segments[rows[270]["id"]], "Entry")
        self.assertEqual(segments[rows[271]["id"]], "Mid-market")
        self.assertEqual(segments[rows[272]["id"]], "Premium")

    def test_database_constraints_reject_bad_clean_rows(self):
        connection = create_database(generate_raw_data(300))
        try:
            with self.assertRaises(Exception):
                connection.execute(
                    "INSERT INTO clean_properties VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ("bad", "Test", "Test", "Condo", 2, 1, -1, 500_000, 100_000, 10, 80, 500, 5, "Entry", "Stretched", "Good"),
                )
        finally:
            connection.close()

    def test_declared_indexes_exist_and_filter_plan_uses_one(self):
        validation = run_pipeline(500).validation
        self.assertTrue(validation["all_indexes_present"])
        self.assertTrue(validation["filter_query_uses_index"])
        self.assertEqual(len(validation["indexes"]), 4)

    def test_median_view_rejects_unapproved_identifier(self):
        connection = create_database(generate_raw_data(300))
        try:
            with self.assertRaisesRegex(ValueError, "Unsupported metric"):
                median_view(connection, "sale_price; DROP TABLE clean_properties")
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
