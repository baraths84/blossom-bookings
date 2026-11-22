const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { log } = require("node:console");
const fs = require("node:fs/promises");
const path = require("node:path");
const process = require("node:process");
const { promisify } = require("node:util");
const vscode = require("vscode");
const { generateExplanation } = require("../dist/extension.js");

exports.run = async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  assert.equal(await fs.realpath(root), await fs.realpath(process.env.NETWORK_REVIEW_TEST_WORKSPACE));
  const git = (...args) => promisify(execFile)("git", args, { cwd: root, windowsHide: true });
  const commitFile = (file, message) => git("-c", "user.name=Network Review Demo", "-c", "user.email=demo@example.invalid",
    "-c", "commit.gpgSign=false", "-c", `core.hooksPath=${path.join(root, ".demo-hooks")}`, "commit", "--only", "-m", message, "--", file);
  const write = (name, source) => fs.writeFile(path.join(root, name), source);
  const review = () => vscode.commands.executeCommand("networkReview.review");
  const findings = report => report.rows.filter(row => row.kind === "finding");

  const api = (await vscode.extensions.getExtension("vscode.git").activate()).getAPI(1);
  await api.openRepository(vscode.Uri.file(root));
  const first = await review();
  assert.deepEqual(findings(first).map(row => [row.file, row.call.destination.text]), [
    ["renderer.js", "https://diagram.example/render"]
  ]);
  assert.equal(first.rows.length, 1);
  const row = first.rows[0];
  await vscode.commands.executeCommand("networkReview.open", row);
  const editor = vscode.window.activeTextEditor;
  assert.equal(editor.document.uri.fsPath, path.join(root, "renderer.js"));
  assert.equal(editor.document.getText(editor.selection), "fetch");
  assert.equal(editor.selection.start.line, 1);

  const token = new vscode.CancellationTokenSource();
  try {
    const explanation = await generateExplanation(row.call, {
      async sendRequest(messages, _options, receivedToken) {
        assert.equal(receivedToken, token.token);
        const fields = JSON.parse(messages[0].content[0].value.split("\n").at(-1));
        assert.deepEqual(Object.keys(fields).sort(), ["body", "destination", "method"]);
        assert.deepEqual(fields.body, { kind: "expression", text: "markdown" });
        return { text: (async function* () { yield "The request "; yield "includes markdown."; })() };
      }
    }, token.token);
    assert.equal(explanation, "The request includes markdown.");
    if (!(await vscode.lm.selectChatModels({})).length) await vscode.commands.executeCommand("networkReview.explain", row);
  } finally {
    token.dispose();
  }

  await editor.edit(edit => edit.insert(new vscode.Position(0, 0), '// Unsaved\nfetch("/editor-only");\n'));
  assert.equal(findings(await review()).length, 1);
  await vscode.commands.executeCommand("workbench.action.files.revert");
  await git("restore", "--source=local-renderer", "--", "renderer.js");
  assert.equal(findings(await review()).length, 0);

  await write("combined.ts", 'fetch("/index");\n');
  await git("add", "--", "combined.ts");
  await write("combined.ts", 'fetch("/saved", {method: "POST", body: selection});\n');
  await write("untracked.jsx", 'const preview = <p>{fetch(settings.renderUrl, {method: "POST", body: selection})}</p>;\n');
  await write("staged.js", 'fetch("/staged");\n');
  await git("add", "--", "staged.js");
  await write("broken.js", 'fetch("incomplete";');
  await write("shadowed.js", 'const fetch = localClient; fetch("/local");');
  await write("ignored.js", 'fetch("/ignored");');
  await write(".gitignore", "ignored.js\n");
  const combined = await review();
  assert.deepEqual(findings(combined).map(item => item.call.destination.text).sort(), ["/saved", "/staged", "settings.renderUrl"]);
  assert.deepEqual(combined.rows.filter(item => item.kind === "skipped").map(item => item.file), ["broken.js"]);

  await write("existing.js", 'fetch("/already-present");\n');
  await git("add", "--", "existing.js");
  await commitFile("existing.js", "Track an existing request");
  await git("mv", "existing.js", "renamed existing.js");
  const renamed = await review();
  assert.deepEqual(renamed.rows.map(item => item.file).sort(), combined.rows.map(item => item.file).sort());

  const selected = await fs.readFile(require.resolve("../demo/exposure/preview.ts"), "utf8");
  await write("preview.ts", selected);
  await git("add", "--", "preview.ts");
  await commitFile("preview.ts", "Preview the selection");
  await write("preview.ts", selected.replace("getText(editor.selection)", "getText()"));
  const flow = findings(await review()).find(item => item.call.exposure);
  assert.equal(flow.file, "preview.ts");
  for (const [index, step] of flow.call.exposure.entries()) {
    await vscode.commands.executeCommand("networkReview.open", { ...flow, kind: "step", step });
    const active = vscode.window.activeTextEditor;
    assert.equal(active.document.getText(active.selection), ["getText", "sendPreview", "fetch"][index]);
  }
  await git("restore", "--", "preview.ts");
  assert.equal(findings(await review()).filter(item => item.call.exposure).length, 0);

  const unborn = path.join(root, "first-commit");
  await fs.mkdir(unborn);
  await git("-C", unborn, "init", "-b", "main");
  await fs.writeFile(path.join(unborn, "first.ts"), 'fetch("/first");');
  await git("-C", unborn, "add", "--", "first.ts");
  await api.openRepository(vscode.Uri.file(unborn));
  await vscode.window.showTextDocument(vscode.Uri.file(path.join(unborn, "first.ts")));
  assert.deepEqual(findings(await review()).map(item => item.call.destination.text), ["/first"]);
  log("Extension Host passed: source navigation, optional explanation, saved edits, local renderer, staged/untracked files, parse failures, rename and initial repository.");
};
