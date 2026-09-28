import { buildDataset, buildInsights, filterRecords, formatCurrency, formatViewValue, groupMarketView, HOME_TYPES, NEIGHBORHOODS, SEGMENTS, summarize, toCsv } from "./analysis.js";
import { registerHousingTools } from "./webmcp.js";

const records = buildDataset();
const elements = {
  region: document.querySelector("#region-filter"), neighborhood: document.querySelector("#neighborhood-filter"), type: document.querySelector("#type-filter"), segment: document.querySelector("#segment-filter"), bedrooms: document.querySelector("#bedroom-filter"),
  metricPrice: document.querySelector("#metric-price"), metricPpsf: document.querySelector("#metric-ppsf"), metricRatio: document.querySelector("#metric-ratio"), metricCount: document.querySelector("#metric-count"), metricShare: document.querySelector("#metric-share"),
  title: document.querySelector("#view-title"), axis: document.querySelector("#axis-label"), chart: document.querySelector("#bar-chart"), caption: document.querySelector("#chart-caption"), insights: document.querySelector("#insights"), tabs: document.querySelector(".view-tabs"), toast: document.querySelector("#toast"),
};
let view = "price";
let filtered = records;
let toastTimer;

function addOptions(select, values) { for (const value of values) select.add(new Option(value, value)); }
addOptions(elements.region, [...new Set(NEIGHBORHOODS.map(({ region }) => region))]);
addOptions(elements.neighborhood, NEIGHBORHOODS.map(({ name }) => name));
addOptions(elements.type, HOME_TYPES.map(({ name }) => name));
addOptions(elements.segment, SEGMENTS);
addOptions(elements.bedrooms, [1, 2, 3, 4, 5]);

function currentFilters() { return { region: elements.region.value, neighborhood: elements.neighborhood.value, homeType: elements.type.value, segment: elements.segment.value, bedrooms: elements.bedrooms.value }; }
function showToast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add("show"); toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2400); }

function render() {
  filtered = filterRecords(records, currentFilters());
  const summary = summarize(filtered, records.length);
  elements.metricPrice.textContent = formatCurrency(summary.medianPrice, true);
  elements.metricPpsf.textContent = summary.medianPpsf == null ? "—" : formatCurrency(summary.medianPpsf);
  elements.metricRatio.textContent = summary.medianRatio == null ? "—" : `${summary.medianRatio.toFixed(1)}×`;
  elements.metricCount.textContent = summary.count.toLocaleString();
  elements.metricShare.textContent = `${(summary.share * 100).toFixed(1)}% of ${records.length.toLocaleString()} properties`;
  const market = groupMarketView(filtered, view);
  elements.title.textContent = market.title; elements.axis.textContent = market.label;
  renderChart(market.values); renderInsights(buildInsights(filtered, view));
  for (const button of elements.tabs.querySelectorAll("button")) { const active = button.dataset.view === view; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); }
  const filterCount = Object.values(currentFilters()).filter((value) => value !== "All").length;
  elements.caption.textContent = summary.count ? `${summary.count.toLocaleString()} records · ${filterCount ? `${filterCount} active filter${filterCount === 1 ? "" : "s"}` : "complete market"} · medians reduce sensitivity to extreme values.` : "No properties match this combination. Reset or widen the filters.";
}

function renderChart(groups) {
  if (!groups.length) { elements.chart.replaceChildren(Object.assign(document.createElement("p"), { className: "no-data", textContent: "No matching records" })); return; }
  const maximum = Math.max(...groups.map(({ value }) => value));
  elements.chart.replaceChildren(...groups.map(({ name, value, count }) => {
    const group = document.createElement("div"); group.className = "bar-group"; group.title = `${name}: ${formatViewValue(value, view)} across ${count.toLocaleString()} records`;
    const valueNode = Object.assign(document.createElement("span"), { className: "bar-value", textContent: formatViewValue(value, view) });
    const bar = document.createElement("div"); bar.className = "bar"; bar.style.height = `${Math.max(2, value / maximum * 78)}%`; bar.setAttribute("aria-hidden", "true");
    const label = Object.assign(document.createElement("span"), { className: "bar-label", textContent: name });
    group.append(valueNode, bar, label); return group;
  }));
}

function renderInsights(insights) {
  elements.insights.replaceChildren(...insights.map((insight) => {
    const article = document.createElement("article"); article.className = "insight";
    article.append(Object.assign(document.createElement("span"), { textContent: insight.label }), Object.assign(document.createElement("strong"), { textContent: insight.title }), Object.assign(document.createElement("small"), { textContent: insight.detail })); return article;
  }));
}

function setFilters(input = {}) {
  const mapping = { region: elements.region, neighborhood: elements.neighborhood, homeType: elements.type, segment: elements.segment, bedrooms: elements.bedrooms };
  for (const [key, select] of Object.entries(mapping)) {
    if (input[key] == null) continue;
    const value = String(input[key]);
    if (![...select.options].some((option) => option.value === value)) throw new Error(`Unsupported ${key}: ${value}`);
    select.value = value;
  }
  if (input.view != null) { if (!["price", "affordability", "ppsf"].includes(input.view)) throw new Error(`Unsupported view: ${input.view}`); view = input.view; }
  render(); return readSummary();
}

function readSummary() { return { filters: currentFilters(), view, ...summarize(filtered, records.length) }; }
function compareMarkets(requestedView = view) { return groupMarketView(filtered, requestedView); }
function exportView(limit = filtered.length) { const safeLimit = Math.max(1, Math.min(100, Math.floor(limit))); return { filters: currentFilters(), returned: Math.min(safeLimit, filtered.length), total: filtered.length, csv: toCsv(filtered.slice(0, safeLimit)) }; }

for (const select of [elements.region, elements.neighborhood, elements.type, elements.segment, elements.bedrooms]) select.addEventListener("change", render);
elements.tabs.addEventListener("click", (event) => { const requested = event.target.closest("button[data-view]")?.dataset.view; if (!requested) return; view = requested; render(); });
document.querySelector("#reset-filters").addEventListener("click", () => { setFilters({ region: "All", neighborhood: "All", homeType: "All", segment: "All", bedrooms: "All", view: "price" }); showToast("Filters reset."); });
document.querySelector("#download-csv").addEventListener("click", () => { const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "housing-market-view.csv"; anchor.click(); URL.revokeObjectURL(url); showToast(`${filtered.length.toLocaleString()} rows downloaded.`); });

render();
registerHousingTools({ modelContext: document.modelContext, setFilters: async (input) => setFilters(input), readSummary: async () => readSummary(), compareMarkets: async (requestedView) => compareMarkets(requestedView), exportView: async (limit) => exportView(limit) });
