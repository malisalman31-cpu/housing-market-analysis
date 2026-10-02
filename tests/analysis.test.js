import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DEFAULT_FILTERS, VIEWS, normalizeFilters, validateDataset, filterRecords, sortRecords, comparison, formatValue, formatMetric, formatMoe, toCsv } from "../dist/analysis.js";
const data = JSON.parse(readFileSync(new URL("../dist/data/housing.json", import.meta.url)));
const records = data.records;
const state = records.find(row => row.geography === "state");

test("the browser consumes real SQL output with all counties and places", () => {
  assert.equal(validateDataset(data), data);
  assert.equal(filterRecords(records).length, 58);
  assert.equal(filterRecords(records, { geography: "place" }).length, 1618);
  assert.equal(state.metrics.home_value.value, 734700);
});
test("malformed, negative and incomplete datasets fail closed", () => {
  for (const changed of [
    null, { ...data, schema_version: 1 }, { ...data, records: records.slice(1) },
    { ...data, records: [...records, records[0]] },
    { ...data, records: [{ ...records[0], metrics: {} }, ...records.slice(1)] },
    { ...data, records: [{ ...records[0], metrics: { ...records[0].metrics, home_value: { ...records[0].metrics.home_value, value: -1 } } }, ...records.slice(1)] },
  ]) assert.throws(() => validateDataset(changed));
});
test("filters normalize, search case-insensitively, and handle no matches", () => {
  assert.deepEqual(normalizeFilters(), DEFAULT_FILTERS);
  assert.equal(normalizeFilters({ search: "Los " }).search, "Los ");
  assert.equal(filterRecords(records, { search: "  LOS ANGELES  " })[0].name, "Los Angeles County");
  assert.equal(filterRecords(records, { search: "zzzz-no-area" }).length, 0);
  const places = filterRecords(records, { geography: "place", minPopulation: "500000" });
  assert.ok(places.length > 0);
  assert.ok(places.every(row => row.metrics.population.value >= 500000));
  assert.equal(filterRecords(records, { minPopulation: 1e10 }).length, 0);
});
test("invalid filters and inherited object keys are rejected", () => {
  for (const input of [{ geography: "state" }, { view: "sale_price" }, { view: "toString" }, { sort: "random" }, { search: null }, { search: "a".repeat(201) }, { minPopulation: -1 }, { minPopulation: "NaN" }]) {
    assert.throws(() => normalizeFilters(input));
  }
});
for (const view of Object.keys(VIEWS)) {
  test(view + " supports both orderings without mutating the dataset", () => {
    const rows = filterRecords(records, { geography: "place" });
    const original = rows.map(row => row.geo_id);
    for (const sort of ["asc", "desc"]) {
      const result = comparison(rows, view, sort);
      assert.equal(result.rows.length, 12);
      assert.equal(result.exact + result.bounded + result.unavailable, rows.length);
      assert.ok(result.rows.every(row => row.metrics[view].status === "estimate"));
      const values = result.rows.map(row => row.metrics[view].value);
      assert.deepEqual(values, [...values].sort((a, b) => sort === "asc" ? a - b : b - a));
      assert.equal(sortRecords(rows, view, sort).at(-1).metrics[view].status, "unavailable");
    }
    assert.deepEqual(rows.map(row => row.geo_id), original);
  });
}
test("comparison handles empty filters and invalid limits", () => {
  assert.deepEqual(comparison([], "income"), { rows: [], exact: 0, bounded: 0, unavailable: 0 });
  assert.throws(() => comparison(records, "income", "desc", 0));
  assert.throws(() => comparison(records, "income", "desc", 2.5));
});
test("formatters preserve bounds, zero, missing values, and uncertainty", () => {
  assert.equal(formatValue(null, "income"), "—");
  assert.equal(formatValue(NaN, "income"), "—");
  assert.equal(formatValue(0, "population"), "0");
  assert.equal(formatValue(32.8, "rent_burden"), "32.8%");
  assert.equal(formatMetric({ status: "at_least", value: 2000000 }, "home_value"), "≥ $2,000,000");
  assert.equal(formatMetric({ status: "at_most", value: 10 }, "rent_burden"), "≤ 10.0%");
  assert.equal(formatMetric({ status: "unavailable", value: null }, "income"), "Not available");
  assert.equal(formatMetric(null, "income"), "Not available");
  assert.match(formatMoe(state.metrics.home_value, "home_value"), /1,307.*90%/);
  assert.match(formatMoe(state.metrics.rent_burden, "rent_burden"), /0.2 percentage points/);
  assert.match(formatMoe(state.metrics.population, "population"), /controlled/);
  assert.match(formatMoe({ status: "at_least" }, "income"), /Open-ended/);
  assert.match(formatMoe({ status: "estimate", moe: null }, "income"), /unavailable/);
  assert.match(formatMoe({ status: "unavailable" }, "income"), /Insufficient/);
});
test("CSV exports all filtered rows, uncertainty, raw codes and provenance", () => {
  const csv = toCsv(filterRecords(records), data.source);
  assert.equal(csv.split("\r\n").length, 59);
  assert.match(csv, /home_value_moe90/);
  assert.match(csv, /source_url/);
  assert.match(csv, /2020–2024 ACS/);
  assert.equal(toCsv([], data.source).split("\r\n").length, 1);
});
test("CSV escapes quotes and formula-like names but preserves numeric raw sentinels", () => {
  const csv = toCsv([{ ...state, name: '=HYPERLINK("test")' }], data.source);
  assert.ok(csv.includes("'="));
  assert.ok(csv.includes('HYPERLINK(""test"")'));
  assert.match(csv, /-555555555/);
});
