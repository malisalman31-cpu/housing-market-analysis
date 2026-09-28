DELETE FROM clean_properties;

INSERT INTO clean_properties (
    id, neighborhood, region, home_type, bedrooms, bathrooms, square_feet,
    sale_price, household_income, property_age, condition_score,
    price_per_sqft, affordability_ratio, market_segment,
    affordability_band, quality_band
)
SELECT
    id,
    neighborhood,
    region,
    home_type,
    bedrooms,
    bathrooms,
    square_feet,
    sale_price,
    household_income,
    property_age,
    condition_score,
    CAST(ROUND(sale_price / square_feet) AS INTEGER) AS price_per_sqft,
    ROUND(sale_price / household_income, 2) AS affordability_ratio,
    CASE
        WHEN sale_price < 750000 THEN 'Entry'
        WHEN sale_price < 1500000 THEN 'Mid-market'
        ELSE 'Premium'
    END AS market_segment,
    CASE
        WHEN sale_price / household_income < 5 THEN 'Accessible'
        WHEN sale_price / household_income < 8 THEN 'Stretched'
        ELSE 'Highly stretched'
    END AS affordability_band,
    CASE
        WHEN condition_score < 72 THEN 'Needs work'
        WHEN condition_score < 86 THEN 'Good'
        ELSE 'Excellent'
    END AS quality_band
FROM raw_properties
WHERE sale_price IS NOT NULL
  AND square_feet > 0
  AND sale_price > 0
  AND household_income > 0;

PRAGMA optimize;

-- Median market-view pattern used by the Python orchestrator:
-- WITH ranked AS (
--   SELECT neighborhood, sale_price AS metric,
--          ROW_NUMBER() OVER (PARTITION BY neighborhood ORDER BY sale_price) AS row_number,
--          COUNT(*) OVER (PARTITION BY neighborhood) AS records
--   FROM clean_properties
-- )
-- SELECT neighborhood, AVG(metric) AS value, MAX(records) AS records
-- FROM ranked
-- WHERE row_number IN ((records + 1) / 2, (records + 2) / 2)
-- GROUP BY neighborhood
-- ORDER BY value DESC;
