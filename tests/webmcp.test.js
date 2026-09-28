import assert from "node:assert/strict";
import test from "node:test";
import { registerHousingTools } from "../dist/webmcp.js";

const callbacks = {
  setFilters: async (input) => ({ changed: input }), readSummary: async () => ({ count: 20500 }),
  compareMarkets: async (view) => ({ view }), exportView: async (limit) => ({ limit }),
};

test("returns a graceful result when WebMCP is unavailable", () => {
  assert.deepEqual(registerHousingTools({ modelContext: null, ...callbacks }), { supported: false, count: 0, names: [] });
});

test("requires all dashboard callbacks", () => {
  assert.throws(() => registerHousingTools({ modelContext: { registerTool() {} }, ...callbacks, exportView: undefined }), /requires dashboard callbacks/);
});

test("registers four named tools with schemas and annotations", () => {
  const registered = [];
  const result = registerHousingTools({ modelContext: { registerTool(tool, options) { registered.push({ tool, options }); } }, signal: "demo-signal", ...callbacks });
  assert.equal(result.supported, true);
  assert.equal(result.count, 4);
  assert.deepEqual(result.names, registered.map(({ tool }) => tool.name));
  assert.ok(registered.every(({ tool }) => tool.inputSchema && tool.annotations));
  assert.ok(registered.every(({ options }) => options.signal === "demo-signal"));
});

test("tool executors forward inputs and default export limit", async () => {
  const registered = [];
  registerHousingTools({ modelContext: { registerTool(tool) { registered.push(tool); } }, ...callbacks });
  const byName = Object.fromEntries(registered.map((tool) => [tool.name, tool]));
  assert.deepEqual(await byName.set_housing_market_filters.execute({ segment: "Entry" }), { changed: { segment: "Entry" } });
  assert.deepEqual(await byName.read_housing_market_summary.execute({}), { count: 20500 });
  assert.deepEqual(await byName.compare_housing_markets.execute({ view: "ppsf" }), { view: "ppsf" });
  assert.deepEqual(await byName.export_housing_market_view.execute({}), { limit: 25 });
  assert.deepEqual(await byName.export_housing_market_view.execute({ limit: 7 }), { limit: 7 });
});

test("asynchronous registration rejection is absorbed", async () => {
  const result = registerHousingTools({ modelContext: { registerTool() { return Promise.reject(new Error("not supported")); } }, ...callbacks });
  assert.equal(result.count, 4);
  await new Promise((resolve) => setImmediate(resolve));
});
