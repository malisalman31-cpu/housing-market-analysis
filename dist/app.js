import { VIEWS, DEFAULT_FILTERS, normalizeFilters, validateDataset, filterRecords, sortRecords, comparison, formatMetric, formatMoe, toCsv } from "./analysis.js";
import { registerHousingTools } from "./webmcp.js";

const $ = id => document.getElementById(id);
let data, filters = { ...DEFAULT_FILTERS }, page = 0, selectedId = "0400000US06";
const pageSize = 20;
const controls = ["geography-filter", "search-filter", "population-filter", "sort-filter", "reset-filters", "download-csv"];
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function visibleRows() { return sortRecords(filterRecords(data.records, filters), filters.view, filters.sort); }
function summary() {
  return { source: data.source.dataset, filters, count: visibleRows().length,
    reference: data.records.find(row => row.geo_id === selectedId),
    warning: "Area-level survey estimates, not sale records. Never aggregate medians across areas." };
}
function syncControls() {
  $("geography-filter").value = filters.geography;
  $("search-filter").value = filters.search;
  $("population-filter").value = String(filters.minPopulation);
  $("sort-filter").value = filters.sort;
  for (const button of document.querySelectorAll("[data-view]")) {
    const active = button.dataset.view === filters.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}
function saveUrl() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== DEFAULT_FILTERS[key]) params.set(key, value);
  history.replaceState(null, "", location.pathname + (params.size ? "?" + params : ""));
}
function setFilters(input) {
  filters = normalizeFilters({ ...filters, ...input });
  page = 0; selectedId = "0400000US06";
  syncControls(); saveUrl(); render();
  return summary();
}
function renderReference() {
  const reference = data.records.find(row => row.geo_id === selectedId);
  $("reference-label").textContent = reference.name + (reference.geography === "state" ? " · statewide reference" : " · selected area");
  $("reference-population").textContent = "Population: " + formatMetric(reference.metrics.population, "population");
  $("state-reference").hidden = reference.geography === "state";
  for (const key of Object.keys(VIEWS)) {
    $("metric-" + key).textContent = formatMetric(reference.metrics[key], key);
    $("moe-" + key).textContent = formatMoe(reference.metrics[key], key);
  }
}
function render() {
  const rows = visibleRows();
  renderReference();
  const stats = comparison(rows, filters.view, filters.sort);
  const areaLabel = filters.geography === "county" ? (rows.length === 1 ? " county" : " counties") : (rows.length === 1 ? " city / census place" : " cities & census places");
  $("results-count").textContent = rows.length.toLocaleString() + areaLabel + " in view";
  $("view-title").textContent = (filters.sort === "desc" ? "Higher" : "Lower") + " published " + VIEWS[filters.view].short.toLowerCase() + " estimates";
  $("metric-description").textContent = VIEWS[filters.view].explanation;
  $("chart-caption").textContent = "Showing " + stats.rows.length + " of " + stats.exact + " exact estimates. " + stats.bounded +
    " bounded and " + stats.unavailable + " unavailable values excluded from the chart; retained in the table and CSV. Differences may not be statistically significant.";
  $("bar-chart").replaceChildren();
  const max = Math.max(1, ...stats.rows.map(row => row.metrics[filters.view].value));
  for (const row of stats.rows) {
    const metric = row.metrics[filters.view];
    const button = element("button", undefined, "comparison-row");
    button.type = "button";
    button.setAttribute("aria-label", row.name + ": " + formatMetric(metric, filters.view) + ". " + formatMoe(metric, filters.view) + ". Select area.");
    button.append(element("span", row.name, "comparison-name"), element("strong", formatMetric(metric, filters.view), "comparison-value"));
    const track = element("span", undefined, "comparison-track");
    const fill = element("span", undefined, "comparison-fill");
    fill.style.width = (metric.value / max * 100) + "%";
    track.append(fill); button.append(track);
    button.addEventListener("click", () => selectArea(row.geo_id)); $("bar-chart").append(button);
  }
  if (!stats.rows.length) $("bar-chart").append(element("p", "No exact estimates match. Try another search or check the table for bounded values.", "no-data"));
  $("coverage-exact").textContent = stats.exact.toLocaleString();
  $("coverage-bounded").textContent = stats.bounded.toLocaleString();
  $("coverage-missing").textContent = stats.unavailable.toLocaleString();
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  page = Math.min(page, pages - 1);
  $("table-body").replaceChildren();
  for (const row of rows.slice(page * pageSize, (page + 1) * pageSize)) {
    const tr = element("tr");
    const name = element("th"); name.scope = "row";
    const button = element("button", row.name, "area-button"); button.type = "button";
    button.addEventListener("click", () => selectArea(row.geo_id)); name.append(button); tr.append(name);
    for (const key of [...Object.keys(VIEWS), "population"]) {
      const td = element("td");
      td.append(element("strong", formatMetric(row.metrics[key], key)));
      td.append(element("small", formatMoe(row.metrics[key], key)));
      tr.append(td);
    }
    $("table-body").append(tr);
  }
  if (!rows.length) {
    const tr = element("tr"), td = element("td", "No areas match your filters. Reset filters to see all counties.");
    td.colSpan = 6; tr.append(td); $("table-body").append(tr);
  }
  $("page-label").textContent = "Page " + (page + 1) + " of " + pages;
  $("previous-page").disabled = page === 0;
  $("next-page").disabled = page === pages - 1;
  $("download-csv").disabled = rows.length === 0;
}
function selectArea(id) { selectedId = id; renderReference(); $("reference-label").scrollIntoView({ block: "center", behavior: "smooth" }); }
function showToast(text) {
  $("toast").textContent = text; $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 3500);
}
async function start() {
  controls.forEach(id => $(id).disabled = true);
  document.querySelectorAll("[data-view]").forEach(button => button.disabled = true);
  try {
    const response = await fetch("./data/housing.json");
    if (!response.ok) throw new Error("Data request failed");
    data = validateDataset(await response.json());
    try {
      const params = new URLSearchParams(location.search);
      filters = normalizeFilters(Object.fromEntries(Object.keys(DEFAULT_FILTERS).filter(key => params.has(key)).map(key => [key, params.get(key)])));
    } catch { filters = { ...DEFAULT_FILTERS }; showToast("Invalid link filters were reset."); }
    $("loading-status").hidden = true;
    $("dashboard").hidden = false;
    $("source-date").textContent = data.source.retrieved_at.slice(0, 10);
    $("coverage-note").textContent = data.counts.county + " counties · " + data.counts.place.toLocaleString() + " cities & census places";
    controls.forEach(id => $(id).disabled = false);
    document.querySelectorAll("[data-view]").forEach(button => button.disabled = false);
    syncControls(); render();
    $("geography-filter").addEventListener("change", event => setFilters({ geography: event.target.value }));
    $("search-filter").addEventListener("input", event => setFilters({ search: event.target.value }));
    $("population-filter").addEventListener("input", event => {
      try { setFilters({ minPopulation: event.target.value }); } catch { event.target.value = filters.minPopulation; showToast("Enter a nonnegative population."); }
    });
    $("sort-filter").addEventListener("change", event => setFilters({ sort: event.target.value }));
    $("reset-filters").addEventListener("click", () => setFilters(DEFAULT_FILTERS));
    document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setFilters({ view: button.dataset.view })));
    $("state-reference").addEventListener("click", () => { selectedId = "0400000US06"; renderReference(); });
    $("previous-page").addEventListener("click", () => { page--; render(); });
    $("next-page").addEventListener("click", () => { page++; render(); });
    $("download-csv").addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([toCsv(visibleRows(), data.source)], { type: "text/csv;charset=utf-8" }));
      const link = element("a"); link.href = url; link.download = "california-acs-2020-2024-" + filters.geography + ".csv";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("Export prepared: " + visibleRows().length + (visibleRows().length === 1 ? " area" : " areas") + " with sources and uncertainty.");
    });
    registerHousingTools({ modelContext: navigator.modelContext, setFilters, readSummary: summary,
      compareMarkets: view => comparison(filterRecords(data.records, filters), view, filters.sort),
      exportView: limit => {
        if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw new Error("Export limit must be 1–2000.");
        const rows = visibleRows();
        return { csv: toCsv(rows.slice(0, limit), data.source), total: rows.length, exported: Math.min(limit, rows.length) };
      } });
  } catch {
    $("loading-status").textContent = "The public-data snapshot could not be loaded. Please reload the page. No substitute or simulated data is shown.";
    $("loading-status").setAttribute("role", "alert");
  }
}
start();
