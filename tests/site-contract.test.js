import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const index = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../dist/styles.css", import.meta.url), "utf8");
const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));

test("document exposes core accessible product controls", () => {
  assert.match(index, /<html lang="en">/);
  assert.match(index, /<meta name="viewport"/);
  assert.match(index, /Skip to analysis/);
  assert.match(index, /aria-label="Market filters"/);
  assert.match(index, /role="tablist"/);
  assert.match(index, /Portfolio recreation/);
});

test("site is dependency-free and references local modules", () => {
  assert.doesNotMatch(index, /(?:src|href)="https?:\/\//);
  assert.match(index, /src="\.\/app\.js"/);
  assert.match(index, /href="\.\/styles\.css"/);
});

test("styles provide responsive and reduced-motion behavior", () => {
  assert.match(styles, /@media \(max-width: 680px\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /focus-visible/);
});

test("hosting config points to the static product output", () => {
  assert.equal(hosting.static.directory, "dist");
  assert.match(hosting.project_id, /^appgprj_/);
});
