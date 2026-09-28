# Housing Market Lab

Housing Market Lab is a public, interactive recreation of the housing-market analysis described in Muhammad Ali Salman's portfolio. It lets anyone filter and compare 10,250 cleaned property records across price, affordability, and price-per-square-foot views.

**Live dashboard:** https://housing-market-lab.workspace-016092.chatgpt.site

## What people can do

- filter by neighborhood, housing type, market segment, and bedroom count;
- switch among three market views;
- inspect median sale price, price per square foot, affordability ratio, and sample size;
- download the current filtered records as CSV; and
- use four WebMCP tools from compatible browser agents.

## Data provenance

The original dataset referenced in the resume was not supplied with this project. To avoid presenting invented records as real market data, this repository creates a **deterministic synthetic dataset** for a transparent portfolio recreation. The structure and methodology match the described work: more than 10,000 property records, missing-value and invalid-row handling, five reusable feature groups, derived price-per-square-foot and affordability variables, neighborhood aggregation, and three market views.

The default pandas pipeline begins with 10,385 rows, removes 135 deliberately invalid fixtures, and retains exactly 10,250 clean rows. It always produces the same result from the checked-in seed.

## Reproduce the analysis

```bash
python3 -m pip install -r requirements.txt
python3 analysis/build_dashboard_data.py
python3 analysis/build_dashboard_data.py --check
```

The generated summary is committed at `analysis/output/market_summary.json` so results can be reviewed without running the pipeline.

## Run the dashboard

```bash
npm start
```

Open `http://127.0.0.1:4181`.

## Test

```bash
npm run check
npm run test:coverage
python3 -m unittest discover -s tests -p 'test_*.py'
```

## Project structure

- `analysis/pipeline.py` — pandas-based generation, cleaning, feature engineering, and aggregation;
- `analysis/output/market_summary.json` — deterministic analysis artifact;
- `dist/analysis.js` — dependency-free browser dataset and analytical functions;
- `dist/app.js` — filtering, charting, metrics, and CSV export;
- `dist/webmcp.js` — agent-readable dashboard tools;
- `docs/data-dictionary.md` — field definitions and provenance notes; and
- `tests/` — analytical, contract, WebMCP, and pipeline tests.

## Important limitation

This dashboard is a portfolio demonstration, not a live real-estate feed, appraisal, investment recommendation, or source of current market prices.

## License

MIT
