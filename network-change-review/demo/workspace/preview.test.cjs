const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./support.js");
require("./renderer.js");

test("renders a Markdown heading and paragraph", async () => {
  const preview = await globalThis.renderMarkdown("# Notes\n\nSample text.");
  assert.deepEqual(preview, { heading: "Notes", body: "Sample text.", steps: [] });
});
