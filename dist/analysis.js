export const VIEWS = Object.freeze({
  home_value: { label: "Median home value", short: "Home value", unit: "USD", table: "B25077", explanation: "Owner-reported value of owner-occupied homes. Not sale prices or listings." },
  gross_rent: { label: "Median monthly gross rent", short: "Rent", unit: "USD/month", table: "B25064", explanation: "Cash rent plus estimated utilities for renter-occupied homes paying cash rent." },
  rent_burden: { label: "Median rent share of income", short: "Rent burden", unit: "percent", table: "B25071", explanation: "Median household-level gross-rent-to-income percentage. Not the percentage of renters who are burdened." },
  income: { label: "Median household income", short: "Income", unit: "USD/year", table: "B19013", explanation: "Annual household income in 2024 inflation-adjusted dollars; includes all households, not only renters." },
});
export const DEFAULT_FILTERS = Object.freeze({ geography: "county", search: "", minPopulation: 0, sort: "desc", view: "home_value" });
export const METRIC_KEYS = [...Object.keys(VIEWS), "population"];

export function normalizeFilters(input = {}) {
  const filters = { ...DEFAULT_FILTERS, ...input };
  if (!["county", "place"].includes(filters.geography)) throw new Error("Choose county or place.");
  if (!Object.hasOwn(VIEWS, filters.view)) throw new Error("Unknown analysis view.");
  if (!["asc", "desc"].includes(filters.sort)) throw new Error("Choose asc or desc sorting.");
  if (typeof filters.search !== "string" || filters.search.length > 200) throw new Error("Search must be at most 200 characters.");
  filters.minPopulation = Number(filters.minPopulation);
  if (!Number.isFinite(filters.minPopulation) || filters.minPopulation < 0) throw new Error("Minimum population must be nonnegative.");
  return filters;
}

export function validateDataset(data) {
  if (data?.schema_version !== 2 || !Array.isArray(data.records) || !data.source?.dataset) throw new Error("Invalid public-data snapshot.");
  const ids = new Set();
  const counts = { state: 0, county: 0, place: 0 };
  for (const row of data.records) {
    if (!row.geo_id || ids.has(row.geo_id) || !Object.hasOwn(counts, row.geography)) throw new Error("Invalid or duplicate geography.");
    ids.add(row.geo_id); counts[row.geography]++;
    for (const key of METRIC_KEYS) {
      const m = row.metrics?.[key];
      if (!m || !["estimate", "at_least", "at_most", "unavailable"].includes(m.status)) throw new Error("Invalid metric.");
      if (m.status === "unavailable" ? m.value !== null : !Number.isFinite(m.value) || m.value < 0) throw new Error("Invalid estimate.");
      if (m.moe !== null && (!Number.isFinite(m.moe) || m.moe < 0)) throw new Error("Invalid margin of error.");
    }
  }
  if (counts.state !== 1 || counts.county !== 58 || counts.place < 1500 ||
      Object.keys(counts).some(key => counts[key] !== data.counts?.[key])) throw new Error("Incomplete California coverage.");
  return data;
}

export function filterRecords(records, input = {}) {
  const f = normalizeFilters(input);
  const search = f.search.trim().toLocaleLowerCase("en-US");
  return records.filter(row => row.geography === f.geography && row.name.toLocaleLowerCase("en-US").includes(search) &&
    (f.minPopulation === 0 || (Number.isFinite(row.metrics.population.value) && row.metrics.population.value >= f.minPopulation)));
}

export function sortRecords(records, view = "home_value", sort = "desc") {
  normalizeFilters({ view, sort });
  return [...records].sort((a, b) => {
    const x = a.metrics[view], y = b.metrics[view];
    // A bound is not an exact estimate: place it after exact estimates, before unavailable.
    const order = { estimate: 0, at_least: 1, at_most: 1, unavailable: 2 };
    const category = order[x.status] - order[y.status];
    if (category) return category;
    const difference = x.value === null || y.value === null ? 0 : (x.value - y.value) * (sort === "desc" ? -1 : 1);
    return difference || a.name.localeCompare(b.name, "en-US") || a.geo_id.localeCompare(b.geo_id);
  });
}

export function comparison(records, view = "home_value", sort = "desc", limit = 12) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw new Error("Invalid comparison limit.");
  const sorted = sortRecords(records, view, sort);
  const exact = sorted.filter(row => row.metrics[view].status === "estimate");
  return { rows: exact.slice(0, limit), exact: exact.length,
    bounded: records.filter(row => ["at_least", "at_most"].includes(row.metrics[view].status)).length,
    unavailable: records.filter(row => row.metrics[view].status === "unavailable").length };
}

export function formatValue(value, metric) {
  if (!Number.isFinite(value)) return "—";
  if (metric === "rent_burden") return value.toFixed(1) + "%";
  if (metric === "population") return value.toLocaleString("en-US");
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatMetric(metric, key) {
  if (!metric || metric.status === "unavailable") return "Not available";
  return ({ at_least: "≥ ", at_most: "≤ " }[metric.status] || "") + formatValue(metric.value, key);
}

export function formatMoe(metric, key) {
  if (metric.status === "unavailable") return "Insufficient or unavailable data";
  if (["at_least", "at_most"].includes(metric.status)) return "Open-ended interval · no MOE";
  if (metric.moe_status === "controlled") return "Population-controlled · no sampling MOE";
  if (metric.moe === null) return "Margin of error unavailable";
  return "± " + (key === "rent_burden" ? metric.moe.toFixed(1) + " percentage points" : formatValue(metric.moe, key)) + " · 90% confidence";
}

export function toCsv(records, source) {
  const columns = ["geo_id", "name", "geography", "period", "source_url",
    ...METRIC_KEYS.flatMap(key => [key, key + "_status", key + "_moe90", key + "_moe_status", key + "_raw_estimate", key + "_raw_moe"])];
  const quote = value => {
    let text = value === null || value === undefined ? "" : String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [columns, ...records.map(row => [row.geo_id, row.name, row.geography, source.dataset, source.source_page,
    ...METRIC_KEYS.flatMap(key => {
      const m = row.metrics[key]; return [m.value, m.status, m.moe, m.moe_status, m.raw_estimate, m.raw_moe];
    })])].map(row => row.map(quote).join(",")).join("\r\n");
}
