import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { addedRequests, FetchCall, isSourceFile } from "./analyzer";
import type { EvidenceStep } from "./exposure";

interface Change {
  uri: vscode.Uri;
  originalUri: vscode.Uri;
  status: number;
}

// Subset of vscode.git's version 1 API used by the reviewer.
export interface Repository {
  rootUri: vscode.Uri;
  state: { HEAD?: { commit?: string }; mergeChanges: Change[] };
  status(): Promise<void>;
  diffWith(ref: string): Promise<Change[]>;
  show(ref: string, absolutePath: string): Promise<string>;
}

export interface GitAPI {
  git: { path: string };
  repositories: Repository[];
  getRepository(uri: vscode.Uri): Repository | null;
  openRepository(uri: vscode.Uri): Promise<Repository | null>;
}

export type Row =
  | { kind: "finding"; file: string; uri: vscode.Uri; digest: string; call: FetchCall }
  | { kind: "step"; file: string; uri: vscode.Uri; digest: string; step: EvidenceStep }
  | { kind: "skipped"; file: string; reason: string };
export interface ReviewReport {
  rows: Row[];
  reviewed: number;
  repository: string;
}

export function digest(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

const run = promisify(execFile);
const GitStatus = { IndexAdded: 1, Deleted: 6 } as const;

async function candidates(repository: Repository, gitPath: string, commit: string | undefined) {
  const root = repository.rootUri.fsPath;
  const files = new Map<string, string | undefined>();
  const deleted = new Set<string>();
  if (commit) {
    for (const change of await repository.diffWith(commit)) {
      const current = change.uri.fsPath;
      if (!isSourceFile(current)) continue;
      if (change.status === GitStatus.Deleted) deleted.add(current);
      else files.set(current, change.status === GitStatus.IndexAdded ? undefined : change.originalUri.fsPath);
    }
  }
  // The SCM view may hide untracked files. Ask the same Git executable for the full list.
  const args = ["ls-files", "--others", "--exclude-standard", "-z"];
  if (!commit) args.push("--cached");
  const { stdout } = await run(gitPath, args, { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  for (const relative of stdout.split("\0")) {
    if (!isSourceFile(relative)) continue;
    const file = path.join(root, relative);
    if (!files.has(file)) files.set(file, deleted.has(file) ? file : undefined);
  }
  return files;
}

function decode(bytes: Uint8Array) {
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  if (text.includes("\0")) throw new Error("Binary or unsupported text encoding.");
  return text;
}

export async function reviewRepository(repository: Repository, gitPath: string, token: vscode.CancellationToken) {
  await repository.status();
  const root = repository.rootUri.fsPath;
  const realRoot = await fs.realpath(root);
  const commit = repository.state.HEAD?.commit;
  const conflicts = new Set(repository.state.mergeChanges.map(change => change.uri.fsPath));
  const files = await candidates(repository, gitPath, commit);
  for (const file of conflicts) {
    if (isSourceFile(file)) files.set(file, undefined);
  }
  const report: ReviewReport = { rows: [], reviewed: 0, repository: path.basename(root) };
  for (const [file, previous] of files) {
    if (token.isCancellationRequested) throw new vscode.CancellationError();
    const relative = path.relative(root, file).split(path.sep).join("/");
    try {
      if (conflicts.has(file)) throw new Error("Unresolved Git conflict.");
      const info = await fs.lstat(file);
      if (!info.isFile()) throw new Error("Expected a regular source file.");
      const realRelative = path.relative(realRoot, await fs.realpath(file));
      if (realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
        throw new Error("Path resolves outside the repository.");
      }
      const currentText = decode(await fs.readFile(file));
      const previousText = commit && previous && isSourceFile(previous) ? await repository.show(commit, previous) : "";
      const previousName = previous ? path.relative(root, previous).split(path.sep).join("/") : relative;
      const calls = addedRequests(relative, previousText, currentText, previousName);
      const hash = calls.length ? digest(currentText) : "";
      for (const call of calls) {
        report.rows.push({ kind: "finding", file: relative, uri: vscode.Uri.file(file), digest: hash, call });
      }
      report.reviewed++;
    } catch (error) {
      report.rows.push({ kind: "skipped", file: relative, reason: (error as Error).message });
    }
  }
  return report;
}
