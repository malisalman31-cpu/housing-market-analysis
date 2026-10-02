-- All special-value handling occurs in SQL; the browser consumes this result.
-- -333333333 marks an open-ended median interval, not an exact estimate.
CREATE VIEW estimates AS
SELECT r.geo_id, r.metric, r.raw_estimate, r.raw_moe,
    CASE
      WHEN r.raw_estimate < 0 THEN NULL
      WHEN r.raw_moe = -333333333 AND r.raw_estimate = d.lower_code THEN d.lower_bound
      WHEN r.raw_moe = -333333333 AND r.raw_estimate = d.upper_code THEN d.upper_bound
      WHEN r.raw_moe = -333333333 THEN NULL
      ELSE r.raw_estimate
    END AS value,
    CASE
      WHEN r.raw_estimate < 0 THEN 'unavailable'
      WHEN r.raw_moe = -333333333 AND r.raw_estimate = d.lower_code THEN 'at_most'
      WHEN r.raw_moe = -333333333 AND r.raw_estimate = d.upper_code THEN 'at_least'
      WHEN r.raw_moe = -333333333 THEN 'unavailable'
      ELSE 'estimate'
    END AS status,
    CASE
      WHEN r.raw_estimate < 0 OR r.raw_moe = -333333333 THEN NULL
      WHEN r.raw_moe >= 0 THEN r.raw_moe
      ELSE NULL
    END AS moe,
    CASE
      WHEN r.raw_moe >= 0 THEN 'published'
      WHEN r.raw_moe = -555555555 THEN 'controlled'
      WHEN r.raw_moe = -333333333 THEN 'bounded'
      ELSE 'unavailable'
    END AS moe_status
FROM raw_estimates r JOIN metric_definitions d USING (metric);

-- Descriptive order only; no claim of statistically significant differences.
-- Bounded/missing estimates are explicitly excluded from exact-value comparisons.
CREATE VIEW comparisons AS
SELECT g.geo_id, g.name, g.geography, e.metric, e.value, e.moe,
       DENSE_RANK() OVER (PARTITION BY g.geography, e.metric ORDER BY e.value DESC) AS position
FROM estimates e JOIN geographies g USING (geo_id)
WHERE e.status = 'estimate' AND g.geography <> 'state';
