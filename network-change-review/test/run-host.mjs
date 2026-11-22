import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";
import { createDemo } from "../demo/create.mjs";

const extensionRoot = fileURLToPath(new URL("../", import.meta.url));
const demo = await createDemo();
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "network-review-test-"));

async function installedCode() {
  if (process.env.VSCODE_EXECUTABLE_PATH) return process.env.VSCODE_EXECUTABLE_PATH;
  if (process.platform !== "win32") return;
  for (const root of [process.env.ProgramFiles, path.join(process.env.LOCALAPPDATA ?? "", "Programs")]) {
    if (!root) continue;
    const executable = path.join(root, "Microsoft VS Code", "Code.exe");
    if (await fs.stat(executable).then(s => s.isFile(), () => false)) return executable;
  }
}

try {
  await runTests({
    vscodeExecutablePath: await installedCode(),
    extensionDevelopmentPath: extensionRoot,
    extensionTestsPath: path.join(extensionRoot, "test", "host.cjs"),
    launchArgs: [demo, "--disable-extensions", "--disable-gpu", `--user-data-dir=${profile}`, `--extensions-dir=${path.join(profile, "extensions")}`],
    extensionTestsEnv: { NETWORK_REVIEW_TEST_WORKSPACE: demo }
  });
} finally {
  for (const [directory, prefix] of [[profile, "network-review-test-"], [demo, "network-review-demo-"]]) {
    const absolute = await fs.realpath(directory);
    assert.equal(path.dirname(absolute), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(absolute).startsWith(prefix));
    await fs.rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
