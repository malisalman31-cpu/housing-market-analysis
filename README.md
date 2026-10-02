# California Housing Market Lab

A public housing-data explorer powered by **Python and SQLite**, with official U.S. Census Bureau statistics covering **all 58 California counties, 1,618 census places, and the statewide reference**.

[Open the live dashboard](https://housing-market-lab.workspace-016092.chatgpt.site)

## What you can do

- Search counties or cities/census-designated places; filter by population.
- Compare median home values, monthly gross rents, household incomes, and rent-to-income percentages.
- Select an area to see its published estimates and 90% margins of error.
- Explore every area in a paginated table, including unavailable and bounded estimates.
- Download all filtered rows as CSV with source, period, uncertainty, and raw Census codes.
- Share the current filter URL or use four compatible WebMCP tools.

## Real public data, not simulated properties

The earlier synthetic dataset has been replaced completely. This release uses the **2020–2024 American Community Survey 5-year estimates**, released January 29, 2026. These are geographic survey statistics, **not individual property sale records, current listings, deeds, or 2026 market prices**.

The official Census bulk files are downloaded directly, without an API key or a paid service:

- [Summary File and documentation](https://www.census.gov/programs-surveys/acs/data/summary-file.2024.html)
- [Official 5-year bulk tables](https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/)
- [Special values and annotation meanings](https://www.census.gov/data/developers/data-sets/acs-1year/notes-on-acs-estimate-and-annotation-values.html)

Checked-in California extracts preserve the original column names and raw values. The manifest records original download URLs, retrieval time, full-source hashes, extract hashes and row counts. The browser uses **one generated SQL output**, not a separate browser-generated dataset. There are no data keys or visitor API calls.

## Reproduce offline

Requires Python 3.10+ and Node.js 20+. The application and analytical tests have no third-party runtime dependencies.

```bash
python3 analysis/build_dashboard_data.py
python3 analysis/build_dashboard_data.py --check
npm run check
npm run test:coverage
npm start
```

Open http://127.0.0.1:4181. The committed snapshot works offline; serving local files over HTTP is required.

To intentionally refresh the public snapshot (downloads roughly 180 MB of national source files; only California extracts are retained):

```bash
python3 analysis/fetch_public_data.py
npm run build:data
npm run check
```

The refresh command stages every download before replacing the snapshot. It does not silently substitute fake data or scrape private records.

## Browser tests

The optional browser suite exercises filters, pagination, selection, all four views, capped estimates, CSV downloads, shared URLs, no-result states, mobile layout, and failed-data safety:

```bash
npm install --no-save playwright@1.62.1
npx playwright install chromium
node scripts/browser-check.mjs
```

Set TEST_URL to test an already running deployment. BROWSER_CHANNEL=chrome can use an installed Chrome; PLAYWRIGHT_MODULE can point to an existing Playwright module. SCREENSHOT_DIR optionally saves desktop/mobile screenshots.

## Data model and limitations

| Metric | ACS table | Meaning |
|---|---|---|
| Home value | B25077 | Median owner-reported value of owner-occupied homes |
| Gross rent | B25064 | Median monthly cash rent plus estimated utilities |
| Rent burden | B25071 | Median household-level gross-rent-to-income percentage |
| Household income | B19013 | Median annual household income in 2024 dollars |
| Population | B01003 | Total population estimate |

SQLite joins by GEO_ID, handles missing values and open-ended median intervals, and provides descriptive comparison ranks. The dashboard never averages local medians into a statewide figure. State cards use the state's published estimate directly.

- Bounds such as $2,000,000+ are displayed as ≥ $2,000,000, not as precise prices. Bounded and unavailable values stay in exports but are excluded from the exact-value chart.
- ± values are **90% margins of error**, not forecasts. Ordering estimates is not a significance test.
- Cities and counties overlap. Do not sum them. Census places include incorporated cities/towns and unincorporated CDPs; county-place membership is not inferred.
- Rent share of income is a median ratio among applicable rental households, not the proportion of residents who are rent-burdened.
- No address, owner/renter identity, home-size, bedroom, sale-price, or price-per-square-foot data is claimed.

See [the data dictionary](docs/data-dictionary.md).

## Structure

- analysis/fetch_public_data.py — official download, geographic extraction, provenance manifest.
- analysis/data/ — verified California source extracts.
- analysis/schema.sql / queries.sql — typed tables, joins, special-value rules and comparison views.
- analysis/pipeline.py — standard-library Python validation and SQLite orchestration.
- dist/data/housing.json — generated locally and in CI from the committed extracts; bundled with the published website, not duplicated in Git.
- analysis/output/market_summary.json — reviewable coverage and quality summary.
- dist/ — accessible dependency-free browser interface.
- tests/ — source, SQL, browser-analysis, contract and WebMCP tests.
- scripts/browser-check.mjs — optional end-to-end browser checks.

Independent project; not affiliated with the Census Bureau. MIT license for project code.
