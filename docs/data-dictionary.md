# Data dictionary

All fields are synthetic and generated deterministically for this portfolio demonstration.

| Field | Group | Definition |
|---|---|---|
| `id` | Core | Stable synthetic property identifier |
| `home_type` | Core | Condo, single-family, townhome, or multi-family |
| `bedrooms`, `bathrooms` | Core | Simulated room counts |
| `square_feet` | Core | Simulated usable floor area |
| `sale_price` | Pricing | Derived simulated transaction value in USD |
| `price_per_sqft` | Pricing | Sale price divided by usable floor area |
| `market_segment` | Pricing | Entry, mid-market, or premium price band |
| `neighborhood`, `region` | Location | Representative city/market and one of six California regions |
| `household_income` | Affordability | Simulated annual household income in USD |
| `affordability_ratio` | Affordability | Sale price divided by annual household income |
| `affordability_band` | Affordability | Accessible, stretched, or highly stretched |
| `property_age` | Quality | Simulated years since construction |
| `condition_score` | Quality | Simulated 0–100 condition score |
| `quality_band` | Quality | Needs work, good, or excellent |

## Cleaning rules

The raw pandas fixture contains 20,770 rows. One hundred sixty rows have missing sale prices and 110 have impossible negative floor area. The cleaning stage coerces numeric fields, removes incomplete or impossible records, and retains 20,500 rows before deriving the analytical features.
