export function registerHousingTools({ modelContext, setFilters, readSummary, compareMarkets, exportView, signal }) {
  if (!modelContext?.registerTool) return { supported: false, count: 0, names: [] };
  if (![setFilters, readSummary, compareMarkets, exportView].every((callback) => typeof callback === "function")) throw new Error("WebMCP registration requires dashboard callbacks.");
  const filterProperties = {
    neighborhood: { type: "string" }, homeType: { type: "string" },
    segment: { type: "string", enum: ["All", "Entry", "Mid-market", "Premium"] },
    bedrooms: { anyOf: [{ type: "string", enum: ["All"] }, { type: "number", minimum: 1, maximum: 5 }] },
    view: { type: "string", enum: ["price", "affordability", "ppsf"] },
  };
  const tools = [
    { name: "set_housing_market_filters", title: "Set housing market filters", description: "Update the visible dashboard filters and analysis view.", inputSchema: { type: "object", properties: filterProperties, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { return setFilters(input); } },
    { name: "read_housing_market_summary", title: "Read housing market summary", description: "Read the metrics and active filters currently visible in the dashboard.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute() { return readSummary(); } },
    { name: "compare_housing_markets", title: "Compare housing markets", description: "Compare neighborhood values in the active price, affordability, or price-per-square-foot view.", inputSchema: { type: "object", properties: { view: { type: "string", enum: ["price", "affordability", "ppsf"] } }, required: ["view"], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute(input) { return compareMarkets(input.view); } },
    { name: "export_housing_market_view", title: "Export housing market view", description: "Return the active filtered housing records as CSV text.", inputSchema: { type: "object", properties: { limit: { type: "number", minimum: 1, maximum: 100 } }, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute(input) { return exportView(input?.limit ?? 25); } },
  ];
  for (const tool of tools) void Promise.resolve(modelContext.registerTool(tool, signal ? { signal } : undefined)).catch(() => {});
  return { supported: true, count: tools.length, names: tools.map((tool) => tool.name) };
}
