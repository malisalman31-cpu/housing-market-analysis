# Public-data dictionary

## Provenance and geography

Source: U.S. Census Bureau, 2020–2024 ACS 5-year Summary File, released January 29, 2026. Snapshot URLs and SHA-256 hashes are in analysis/data/manifest.json.

Each record is one **geographic area**, not a property or household. There are 1,677 records: 1 state, 58 counties, and 1,618 places.

- geo_id: full Census GEO_ID, retained as a string with leading zeroes.
- name: official Census NAME with the redundant ", California" suffix removed.
- geography: state (040), county (050), or place (160), component 00, state FIPS 06.
- Places include incorporated cities/towns and census-designated places (CDPs). Not all places are cities. Places and counties overlap.

## Metrics

| JSON key | Summary-file estimate / MOE columns | Units and universe |
|---|---|---|
| home_value | B25077_E001 / B25077_M001 | USD; owner-occupied housing units |
| gross_rent | B25064_E001 / B25064_M001 | USD/month; renter-occupied units paying cash rent, including estimated utilities |
| income | B19013_E001 / B19013_M001 | USD/year in 2024 inflation-adjusted dollars; households |
| rent_burden | B25071_E001 / B25071_M001 | Percent; median gross-rent-to-income ratio for applicable cash-rent households |
| population | B01003_E001 / B01003_M001 | People; total population |

API notation uses B25077_001E, for example; the bulk file's equivalent is B25077_E001. This project downloads the bulk files, not the API.

Each metric contains:
- value: published estimate or interval boundary; null when unavailable.
- status: estimate, at_least, at_most, or unavailable.
- moe: nonnegative published margin of error, or null.
- moe_status: published, controlled, bounded, or unavailable.
- raw_estimate and raw_moe: the unaltered numeric source values, including Census sentinel codes.

## Special-value rules (SQLite)

Negative estimate sentinel values become null/unavailable, not zero. Published nonnegative MOEs are retained. A controlled population MOE (-555555555) is labeled controlled, not presented as a measured margin. Other negative MOEs remain null with a status.

When MOE = -333333333, the estimate is an open-ended median interval. These table-specific codes are translated to boundaries:

| Metric | Raw lower code → displayed upper bound | Raw upper code → displayed lower bound |
|---|---|---|
| home_value | 9999 → ≤ $10,000 | 2000001 → ≥ $2,000,000 |
| gross_rent | 99 → ≤ $100 | 3501 → ≥ $3,500 |
| income | 2499 → ≤ $2,500 | 250001 → ≥ $250,000 |
| rent_burden | 9 → ≤ 10% | 51 → ≥ 50% |

An unrecognized bounded code fails closed as unavailable. Bounded values never enter exact-value chart comparisons. Their original codes remain in JSON and CSV.

[Official Census annotation guidance](https://www.census.gov/data/developers/data-sets/acs-1year/notes-on-acs-estimate-and-annotation-values.html).

## Interpretation

MOEs are at 90% confidence. Rent-share MOEs are percentage points, not percent changes. Small areas can have wide uncertainty or suppressed estimates. Rankings only sort reported values and are not tests of statistically significant differences.

Statewide cards are the published state estimate, not a median of county/place medians. Rent burden is B25071 directly, never a ratio of aggregate rent and income medians. No totals are computed across overlapping geographies. All four housing/income metrics are medians of their respective universes, not minimum budgets or a personal affordability assessment.

## CSV

Exports contain geo_id, name, geography, period, source_url, then estimate/status/MOE/MOE-status/raw-estimate/raw-MOE for each metric. Missing values are blank with status unavailable. Fields are quoted, embedded quotes escaped, and formula-like text prefixed with an apostrophe. Numeric raw sentinel codes remain numeric source evidence.

## Removed legacy fields

Simulated sale_price, square_feet, bedrooms, property_age, home_type, condition_score, affordability_ratio, and derived price_per_sqft/segments no longer exist. They cannot be recovered from these official aggregate tables and are not fabricated.
