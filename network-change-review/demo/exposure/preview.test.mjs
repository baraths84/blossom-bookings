import assert from "node:assert/strict";
import { test } from "node:test";
import { previewTitle } from "./preview.ts";

test("renders the selected heading using an offline service", async t => {
  const lines = ["Release checklist", "Internal draft notes"];
  const selection = { start: { line: 0, character: 0 }, end: { line: 0, character: lines[0].length } };
  const editor = {
    selection,
    document: { getText: range => range ? lines[range.start.line] : lines.join("\n") }
  };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://preview.example/render");
    assert.equal(options.method, "POST");
    return new Response(options.body.split("\n")[0]);
  });
  assert.equal(await previewTitle(editor), "Release checklist");
});
