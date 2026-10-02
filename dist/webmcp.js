export function registerHousingTools({ modelContext, setFilters, readSummary, compareMarkets, exportView, signal }) {
  if (!modelContext?.registerTool) return { supported: false, count: 0, names: [] };
  if (![setFilters, readSummary, compareMarkets, exportView].every((callback) => typeof callback === "function")) throw new Error("WebMCP registration requires dashboard callbacks.");
  const filterProperties = {
    geography: { type: "string", enum: ["county", "place"] },
    search: { type: "string", maxLength: 200 },
    minPopulation: { type: "number", minimum: 0 },
    sort: { type: "string", enum: ["asc", "desc"] },
    view: { type: "string", enum: ["home_value", "gross_rent", "rent_burden", "income"] },
  };
  const tools = [
    { name: "set_housing_market_filters", title: "Set housing market filters", description: "Update the visible dashboard filters and analysis view.", inputSchema: { type: "object", properties: filterProperties, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { return setFilters(input); } },
    { name: "read_housing_market_summary", title: "Read housing market summary", description: "Read the metrics and active filters currently visible in the dashboard.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute() { return readSummary(); } },
    { name: "compare_housing_markets", title: "Compare California housing estimates", description: "Compare published ACS area estimates. Bounded and unavailable values are excluded; differences are not significance tests.", inputSchema: { type: "object", properties: { view: filterProperties.view }, required: ["view"], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute(input) { return compareMarkets(input.view); } },
    { name: "export_housing_market_view", title: "Export housing market view", description: "Return filtered Census area estimates, uncertainty and source as CSV text.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 2000 } }, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute(input) { return exportView(input?.limit ?? 25); } },
  ];
  for (const tool of tools) void Promise.resolve(modelContext.registerTool(tool, signal ? { signal } : undefined)).catch(() => {});
  return { supported: true, count: tools.length, names: tools.map((tool) => tool.name) };
}
