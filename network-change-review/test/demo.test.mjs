import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { createDemo } from "../demo/create.mjs";
import analyzer from "../dist/analyzer.js";

const run = promisify(execFile);
async function demoWorkspace(t, scenario) {
  const root = await createDemo(scenario);
  t.after(async () => {
    const absolute = await fs.realpath(root);
    assert.equal(path.dirname(absolute), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(absolute).startsWith("network-review-demo-"));
    await fs.rm(absolute, { recursive: true, force: true });
  });
  return root;
}

test("both prepared renderers pass the same offline tests; only the remote version adds a request", async t => {
  const root = await demoWorkspace(t, "network");
  const opts = { cwd: root, windowsHide: true };
  const base = (await run("git", ["show", "HEAD:renderer.js"], opts)).stdout;
  const readRenderer = () => fs.readFile(path.join(root, "renderer.js"), "utf8");
  await run(process.execPath, ["--test"], opts);
  const [call] = analyzer.addedRequests("renderer.js", base, await readRenderer());
  assert.equal(call.destination.text, "https://diagram.example/render");
  assert.equal(call.body.text, "markdown");
  await run("git", ["restore", "--source=local-renderer", "--", "renderer.js"], opts);
  await run(process.execPath, ["--test"], opts);
  assert.deepEqual(analyzer.addedRequests("renderer.js", base, await readRenderer()), []);
});

test("the privacy demo changes one line and keeps the preview test green on both versions", async t => {
  const root = await demoWorkspace(t, "exposure");
  const opts = { cwd: root, windowsHide: true };
  assert.match((await run("git", ["diff", "--numstat"], opts)).stdout, /^1\t1\tpreview.ts/);
  const base = (await run("git", ["show", "HEAD:preview.ts"], opts)).stdout;
  const current = await fs.readFile(path.join(root, "preview.ts"), "utf8");
  assert.equal(analyzer.addedRequests("preview.ts", base, current)[0].exposure.length, 3);
  await run(process.execPath, ["--test"], opts);
  await run("git", ["restore", "--", "preview.ts"], opts);
  await run(process.execPath, ["--test"], opts);
});
