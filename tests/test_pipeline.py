import unittest

import pandas as pd

from analysis.pipeline import FEATURE_GROUPS, build_market_views, clean_market_data, generate_raw_data, run_pipeline


class PipelineTests(unittest.TestCase):
    def test_generation_is_deterministic(self):
        first = generate_raw_data(300, 7)
        second = generate_raw_data(300, 7)
        pd.testing.assert_frame_equal(first, second)

    def test_default_pipeline_retains_exact_portfolio_record_count(self):
        result = run_pipeline()
        self.assertEqual(len(result.raw), 20_770)
        self.assertEqual(len(result.clean), 20_500)
        self.assertEqual(set(result.views), {"price", "affordability", "ppsf"})

    def test_cleaning_derives_all_feature_groups(self):
        clean = clean_market_data(generate_raw_data(400))
        expected = {column for columns in FEATURE_GROUPS.values() for column in columns}
        self.assertTrue(expected.issubset(clean.columns))
        self.assertTrue((clean["square_feet"] > 0).all())
        self.assertTrue((clean["sale_price"] > 0).all())

    def test_required_columns_are_validated(self):
        with self.assertRaisesRegex(ValueError, "Missing required columns"):
            clean_market_data(pd.DataFrame({"id": ["x"]}))

    def test_market_views_cover_neighborhoods_and_sort_descending(self):
        clean = clean_market_data(generate_raw_data(500))
        views = build_market_views(clean)
        for rows in views.values():
            self.assertEqual(len(rows), 20)
            values = [row["value"] for row in rows]
            self.assertEqual(values, sorted(values, reverse=True))

    def test_generation_rejects_too_few_rows(self):
        with self.assertRaisesRegex(ValueError, "at least 271"):
            generate_raw_data(50)


if __name__ == "__main__":
    unittest.main()
