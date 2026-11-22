import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const templates = path.dirname(fileURLToPath(import.meta.url));

export async function createDemo(scenario = "network") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "network-review-demo-"));
  // Use repository-local command options so the demo doesn't depend on a user's identity or hooks.
  const git = (...args) => run("git", ["-c", "user.name=Network Review Demo", "-c", "user.email=demo@example.invalid",
    "-c", "commit.gpgSign=false", "-c", `core.hooksPath=${path.join(root, ".demo-hooks")}`, ...args], { cwd: root, windowsHide: true });
  const renderer = version => fs.copyFile(path.join(templates, "versions", `${version}.js`), path.join(root, "renderer.js"));
  const copyTest = () => fs.copyFile(path.join(templates, "versions", "flow.test.cjs"), path.join(root, "flow.test.cjs"));
  await git("init", "-b", "main");
  if (scenario === "exposure") {
    await fs.cp(path.join(templates, "exposure"), root, { recursive: true });
    await git("add", ".");
    await git("commit", "-m", "Preview only the selected text");
    const source = path.join(root, "preview.ts");
    const before = await fs.readFile(source, "utf8");
    await fs.writeFile(source, before.replace("getText(editor.selection)", "getText()"));
    return root;
  }
  await fs.cp(path.join(templates, "workspace"), root, { recursive: true });
  await renderer("baseline");
  await git("add", ".");
  await git("commit", "-m", "Render Markdown headings locally");
  await git("switch", "-c", "local-renderer");
  await renderer("local");
  await copyTest();
  await git("add", ".");
  await git("commit", "-m", "Render flow diagrams locally");
  await git("switch", "main");
  await renderer("remote");
  await copyTest();
  return root;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exposure = process.argv.includes("--exposure");
  const root = await createDemo(exposure ? "exposure" : "network");
  console.log(`Demo workspace: ${root}`);
  if (exposure) console.log("Open the folder in VS Code. Run node --test, then Review Network Changes.\n" +
    "Follow the three evidence links. Run git restore -- preview.ts and repeat the test and review.");
  else console.log("Open this folder in VS Code and index.html in a browser.\n" +
    "Run node --test, then Review Network Changes in VS Code.\n" +
    "Switch the prepared implementation with git restore --source=local-renderer -- renderer.js.\n" +
    "Refresh the page, run node --test again, and repeat the review.");
}
