const assert = require("node:assert/strict");
const { test } = require("node:test");
const { addedRequests, isSourceFile } = require("../dist/analyzer.js");

function review(before, after, name = "src/preview.js") {
  return addedRequests(name, before, after);
}

test("reports a POST with its body expression and exact callee position", () => {
  const [call] = review("", '\n  fetch("https://diagram.example/render", {method: "POST", body: markdown});');
  assert.equal(call.method.text, "POST");
  assert.equal(call.destination.text, "https://diagram.example/render");
  assert.equal(call.body.text, "markdown");
  assert.deepEqual([call.line, call.character], [1, 2]);
});

test("reports the default GET and omitted body for a literal URL", () => {
  const [call] = review("", 'fetch("https://assets.example/icons.json");');
  assert.equal(call.method.text, "GET");
  assert.equal(call.body.kind, "omitted");
});

test("preserves a runtime destination and relative URL", () => {
  const [dynamic, relative] = review("", 'fetch(settings.renderUrl, {method: "POST", body: selection}); fetch("/api");');
  assert.equal(dynamic.destination.kind, "expression");
  assert.equal(dynamic.destination.text, "settings.renderUrl");
  assert.equal(dynamic.body.text, "selection");
  assert.equal(relative.destination.text, "/api");
});

test("ignores moves, comments, indentation and quote changes", () => {
  const before = `fetch('/x', { method: 'post', body: JSON.stringify({ label: 'draft' }) });`;
  const after = `function helper() {}\nfetch ("/x", {body: JSON.stringify({ /* note */ label: "draft"}), method: "POST"});`;
  assert.deepEqual(review(before, after), []);
});

test("matches duplicate requests by count and ignores removed calls", () => {
  const request = 'fetch("/icons");';
  assert.equal(review(request, `${request}\n${request}`).length, 1);
  assert.deepEqual(review(`${request}\n${request}`, request), []);
});

test("finds retargeted requests and a changed body at the same destination", () => {
  const before = 'fetch("/render", { method: "POST", body: title });';
  assert.equal(review(before, before.replace("title", "markdown"))[0].body.text, "markdown");
  assert.equal(review(before, before.replace("/render", "/other"))[0].destination.text, "/other");
});

test("excludes local declarations, parameters, imports and property calls", () => {
  for (const source of [
    'const fetch = client; fetch("/x");',
    'import { fetch } from "client"; fetch("/x");',
    'function work(fetch) { fetch("/x"); }',
    'function work() { fetch("/x"); var fetch = client; }',
    'client.fetch("/x"); globalThis.fetch("/x");',
    'try {} catch (fetch) { fetch("/x"); }'
  ]) assert.deepEqual(review("", source), []);
  assert.equal(review("", 'function work(fetch) { fetch("/x"); } fetch("/global");').length, 1);
});

test("preserves unknown options, spread precedence and inherited Request fields", () => {
  const [dynamic, lastSpread, override, request] = review("", `
    fetch("/x", options);
    fetch("/x", {method: "POST", ...defaults});
    fetch("/x", {...defaults, ["method"]: "POST", body});
    fetch(request);
  `);
  assert.equal(dynamic.method.kind, "unknown");
  assert.equal(dynamic.body.kind, "unknown");
  assert.equal(lastSpread.method.kind, "unknown");
  assert.equal(override.method.text, "POST");
  assert.equal(override.body.text, "body");
  assert.equal(request.method.kind, "unknown");
  assert.equal(request.body.kind, "unknown");
});

test("supports JS, JSX, TS, TSX and their module extensions", () => {
  for (const ext of ["js", "mjs", "cjs", "ts", "mts", "cts", "jsx", "tsx"]) {
    assert.ok(isSourceFile(`main.${ext}`));
    assert.equal(review("", 'fetch("/x");', `nested/main.${ext}`).length, 1);
  }
  assert.equal(review("", 'const v = <p>{fetch("/x")}</p>;', "preview.tsx").length, 1);
  assert.equal(review("", 'fetch("/x" as string);', "preview.ts").length, 1);
  assert.equal(review("", '(fetch!)("/x");', "preview.ts")[0].character, 1);
  assert.ok(!isSourceFile("image.svg"));
});

test("reports syntax errors in the current file or its baseline", () => {
  assert.throws(() => review("", 'fetch("x";'), /Line 1/);
  assert.throws(() => review('fetch("x";', 'fetch("x");'), /parse HEAD/);
});
