// Optional end-to-end checks. Install Playwright or set PLAYWRIGHT_MODULE.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const url = process.env.TEST_URL || "http://127.0.0.1:4181";
const server = process.env.TEST_URL ? null : spawn(process.execPath, ["scripts/serve.mjs"], { stdio: "ignore" });
let browser;
try {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await page.locator("#dashboard").waitFor({ state: "visible" });
  assert.match(await page.locator("#results-count").innerText(), /58 counties/i);
  assert.equal(await page.locator("#metric-home_value").innerText(), "$734,700");
  assert.equal(await page.locator("#table-body tr").count(), 20);
  await page.locator("#next-page").click();
  assert.equal(await page.locator("#page-label").innerText(), "Page 2 of 3");
  await page.locator("#next-page").click();
  assert.equal(await page.locator("#table-body tr").count(), 18);
  assert.equal(await page.locator("#next-page").isDisabled(), true);
  await page.locator("#search-filter").pressSequentially("LOS ANGELES");
  assert.match(await page.locator("#results-count").innerText(), /1 county/i);
  await page.locator(".area-button").click();
  assert.match(await page.locator("#reference-label").innerText(), /Los Angeles County.*selected area/);
  await page.locator("#state-reference").click();
  assert.match(await page.locator("#reference-label").innerText(), /statewide reference/);
  await page.locator("#reset-filters").click();
  await page.locator("#geography-filter").selectOption("place");
  assert.match(await page.locator("#results-count").innerText(), /1,618/);
  for (const view of ["gross_rent", "rent_burden", "income", "home_value"]) {
    await page.locator('[data-view="' + view + '"]').click();
    assert.equal(await page.locator('[data-view="' + view + '"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".comparison-row").count(), 12);
  }
  await page.locator("#search-filter").fill("Atherton");
  assert.match(await page.locator("#table-body").innerText(), /≥ \$2,000,000/);
  assert.equal(await page.locator(".comparison-row").count(), 0);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-csv").click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), "utf8");
  assert.match(csv, /Atherton/);
  assert.match(csv, /at_least/);
  assert.equal(csv.split("\r\n").length, 2);
  await page.reload();
  await page.locator("#dashboard").waitFor({ state: "visible" });
  assert.equal(await page.locator("#search-filter").inputValue(), "Atherton");
  await page.locator("#search-filter").fill("NO_MATCH_123");
  assert.match(await page.locator("#table-body").innerText(), /No areas match/);
  assert.equal(await page.locator("#download-csv").isDisabled(), true);
  await page.locator("#reset-filters").click();
  await page.locator("#population-filter").fill("10000000");
  await page.locator("#population-filter").press("Tab");
  assert.match(await page.locator("#results-count").innerText(), /0 counties/i);
  await page.locator("#reset-filters").click();
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: process.env.SCREENSHOT_DIR + "/housing-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.locator("#geography-filter").selectOption("place");
  await page.locator("#search-filter").fill("San Diego");
  assert.match(await page.locator("#table-body").innerText(), /San Diego city/);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: process.env.SCREENSHOT_DIR + "/housing-mobile.png", fullPage: true });
  const failed = await browser.newPage();
  await failed.route("**/data/housing.json", route => route.abort());
  await failed.goto(url);
  await failed.locator('[role="alert"]').waitFor();
  assert.equal(await failed.locator("#dashboard").isHidden(), true);
  assert.equal(await failed.locator("#download-csv").isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log("Browser checks passed: initial state, pagination, search, area selection, all views, bounds, CSV download, shared URLs, empty results, population filters, mobile layout, failed-data safety, and no JavaScript errors.");
} finally {
  await browser?.close();
  server?.kill();
}
