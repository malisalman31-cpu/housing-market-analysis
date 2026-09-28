import assert from "node:assert/strict";
import test from "node:test";
import { buildDataset, buildInsights, filterRecords, formatCurrency, formatViewValue, groupMarketView, HOME_TYPES, median, NEIGHBORHOODS, SEGMENTS, summarize, toCsv } from "../dist/analysis.js";

const records = buildDataset();

test("buildDataset creates the documented deterministic record count", () => {
  assert.equal(records.length, 10250);
  assert.deepEqual(buildDataset(3, 10), buildDataset(3, 10));
  assert.notDeepEqual(buildDataset(3, 10), buildDataset(3, 11));
});

test("buildDataset validates count", () => {
  assert.throws(() => buildDataset(0), /positive integer/);
  assert.throws(() => buildDataset(2.5), /positive integer/);
});

test("generated records contain valid identifiers and derived variables", () => {
  assert.equal(records[0].id, "LA-00001");
  assert.equal(records.at(-1).id, "LA-10250");
  for (const record of records.slice(0, 100)) {
    assert.ok(record.salePrice > 0);
    assert.ok(record.pricePerSqft > 0);
    assert.ok(record.affordabilityRatio > 0);
    assert.ok(SEGMENTS.includes(record.segment));
  }
});

test("dataset spans all configured dimensions", () => {
  assert.deepEqual(new Set(records.map(({ neighborhood }) => neighborhood)), new Set(NEIGHBORHOODS.map(({ name }) => name)));
  assert.deepEqual(new Set(records.map(({ homeType }) => homeType)), new Set(HOME_TYPES.map(({ name }) => name)));
  assert.deepEqual(new Set(records.map(({ segment }) => segment)), new Set(SEGMENTS));
});

test("median handles odd, even, missing, and non-finite values", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([Number.NaN, 4]), 4);
  assert.equal(median([]), null);
  assert.equal(median(null), null);
  assert.equal(median([Number.NaN]), null);
});

test("filterRecords applies every dimension independently and together", () => {
  const fixture = records[100];
  for (const [key, value] of Object.entries({ neighborhood: fixture.neighborhood, homeType: fixture.homeType, segment: fixture.segment, bedrooms: fixture.bedrooms })) {
    const result = filterRecords(records, { [key]: value });
    assert.ok(result.length > 0);
    assert.ok(result.every((record) => record[key] === value || (key === "bedrooms" && record.bedrooms === Number(value))));
  }
  const combined = filterRecords(records, { neighborhood: fixture.neighborhood, homeType: fixture.homeType, segment: fixture.segment, bedrooms: String(fixture.bedrooms) });
  assert.ok(combined.length > 0);
  assert.ok(combined.every((record) => record.neighborhood === fixture.neighborhood && record.homeType === fixture.homeType && record.segment === fixture.segment && record.bedrooms === fixture.bedrooms));
  assert.equal(filterRecords(records).length, records.length);
});

test("summarize reports medians, count, and share", () => {
  const summary = summarize(records.slice(0, 100), records.length);
  assert.equal(summary.count, 100);
  assert.equal(summary.share, 100 / 10250);
  assert.ok(summary.medianPrice > 0);
  assert.ok(summary.medianPpsf > 0);
  assert.ok(summary.medianRatio > 0);
  assert.deepEqual(summarize([], 0), { count: 0, share: 0, medianPrice: null, medianPpsf: null, medianRatio: null });
});

for (const view of ["price", "affordability", "ppsf"]) {
  test(`groupMarketView builds and sorts the ${view} view`, () => {
    const grouped = groupMarketView(records, view);
    assert.equal(grouped.view, view);
    assert.equal(grouped.values.length, NEIGHBORHOODS.length);
    assert.ok(grouped.values.every(({ value, count }) => value > 0 && count > 0));
    assert.deepEqual(grouped.values.map(({ value }) => value), [...grouped.values.map(({ value }) => value)].sort((a, b) => b - a));
  });
}

test("groupMarketView rejects unknown views and handles empty data", () => {
  assert.throws(() => groupMarketView(records, "rent"), /Unknown market view/);
  assert.deepEqual(groupMarketView([], "price").values, []);
});

test("buildInsights adapts its labels and handles no rows", () => {
  const price = buildInsights(records, "price");
  assert.equal(price.length, 3);
  assert.equal(price[0].label, "Market leader");
  const affordability = buildInsights(records, "affordability");
  assert.equal(affordability[0].label, "Highest burden");
  assert.equal(affordability[1].label, "Lowest burden");
  assert.deepEqual(buildInsights([]), []);
});

test("formatters cover currency, compact values, ratios, and nulls", () => {
  assert.match(formatCurrency(1250), /1,250/);
  assert.match(formatCurrency(1250000, true), /1\.3M/);
  assert.equal(formatCurrency(null), "—");
  assert.equal(formatViewValue(8.45, "affordability"), "8.4×");
  assert.match(formatViewValue(650, "ppsf"), /650.*ft²/);
  assert.match(formatViewValue(900000, "price"), /900K/);
  assert.equal(formatViewValue(Number.NaN, "price"), "—");
});

test("toCsv includes headers, rows, and escaped text", () => {
  const csv = toCsv([{ ...records[0], neighborhood: 'North "Arts"' }]);
  const lines = csv.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /price_per_sqft/);
  assert.match(lines[1], /North ""Arts""/);
  assert.equal(toCsv([]).split("\n").length, 1);
});
