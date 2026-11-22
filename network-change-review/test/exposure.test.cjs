const assert = require("node:assert/strict");
const { test } = require("node:test");
const { addedRequests } = require("../dist/analyzer.js");

const base = `import type { TextEditor } from "vscode";
function preview(editor: TextEditor) {
  const value = editor.document.getText(editor.selection);
  return send(value);
}
function send(text: string) {
  const payload = text;
  return fetch("https://preview.example/render", { method: "POST", body: payload });
}`;

const whole = source => source.replace("getText(editor.selection)", "getText()");
const review = (before, after = whole(before)) => addedRequests("preview.ts", before, after);
const widened = (before, after) => review(before, after).filter(call => call.exposure);

test("finds a one-line expansion through an unchanged helper and unchanged request", () => {
  const [call] = review(base);
  assert.deepEqual(call.exposure.map(s => [s.label, s.line]), [
    ["Read entire document", 2], ["Pass text to send", 3], ["POST https://preview.example/render", 7]
  ]);
  const lines = whole(base).split("\n");
  assert.deepEqual(call.exposure.map(s => lines[s.line].slice(s.character, s.character + s.length)), ["getText", "send", "fetch"]);
  assert.deepEqual(review(whole(base), base), []);
});

test("resolves imported VS Code types, active editor aliases and const arrow helpers", () => {
  const namespace = base.replace('import type { TextEditor }', "import * as code").replace("editor: TextEditor", "editor: code.TextEditor");
  const aliased = base.replace("{ TextEditor }", "{ TextEditor as Editor }").replace(": TextEditor", ": Editor");
  const active = base.replace("import type { TextEditor }", "import { window }").replace("function preview(editor: TextEditor) {",
    "function preview() { const editor = window.activeTextEditor!;");
  const arrow = base.replace("function send(text: string) {", "const send = (text: string) => {");
  for (const source of [namespace, aliased, active, arrow]) assert.equal(widened(source).length, 1);
});

test("folds a directly widened fetch body into one finding", () => {
  const direct = base.replace(/ {2}const value[\s\S]*$/, `  return fetch("https://preview.example/render", {
    method: "POST", body: editor.document.getText(editor.selection)
  });
}`);
  const findings = review(direct);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].exposure.map(s => s.label), ["Read entire document", "POST https://preview.example/render"]);
});

test("requires the same VS Code editor, literal endpoint and a provable body", () => {
  for (const source of [
    base.replace('"vscode"', '"fictional-editor"'),
    base.replace("editor: TextEditor", "editor: any"),
    base.replace("editor: TextEditor", "editor: TextEditor, other: TextEditor").replace("getText(editor.selection)", "getText(other.selection)"),
    base.replace('"https://preview.example/render"', "config.url"),
    base.replace('method: "POST"', 'method: "GET"'),
    base.replace("body: payload", "body: payload, ...options"),
    base.replace("const payload = text;", 'text = "public"; const payload = text;'),
    base.replace("const value =", "let value ="),
    base.replace("return send(value);", "return send(value) + send(value);"),
    base.replace("return send(value);", 'send("public"); return send(value);')
  ]) {
    assert.deepEqual(widened(source, source.replace(/getText\([^)]*\)/, "getText()")), []);
  }
});

test("does not describe a new or retargeted sink as a previously selected-text path", () => {
  assert.deepEqual(widened("", whole(base)), []);
  assert.deepEqual(widened(base, whole(base).replace("https://preview.example/render", "https://other.example")), []);
  assert.deepEqual(review(base, "\n\n" + base), []);
});
