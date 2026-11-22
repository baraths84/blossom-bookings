const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./support.js");
require("./renderer.js");

test("renders the flow diagram as ordered steps", async () => {
  const preview = await globalThis.renderMarkdown("# Release checklist\n\n```flow\nPlan -> Build -> Review\n```");
  assert.deepEqual(preview.steps, ["Plan", "Build", "Review"]);
});
