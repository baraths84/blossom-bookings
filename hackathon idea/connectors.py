"""Sandbox integrations. Credentials terminate here, outside the model context."""

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from core import Finding, Revision, Unavailable, request_body


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_json(method, url, token=None, body=None, timeout=25):
    headers = {"Accept": "application/json", "User-Agent": "AppSecReview/1"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with build_opener(NoRedirects()).open(req, timeout=timeout) as response:
            result = json.load(response)
            if not isinstance(result, dict):
                raise ValueError
            return result
    except HTTPError as exc:
        raise Unavailable(f"{urlsplit(url).hostname} returned HTTP {exc.code}.") from None
    except (URLError, OSError, ValueError):
        raise Unavailable(f"Could not read a valid response from {urlsplit(url).hostname}.") from None


class GitHub:
    def __init__(self, repo, pr, token):
        self.repo, self.pr, self.token = repo, pr, token

    def head(self):
        data = request_json("GET", f"https://api.github.com/repos/{self.repo}/pulls/{self.pr}", self.token)
        sha = data.get("head", {}).get("sha", "")
        if not re.fullmatch(r"[0-9a-f]{40}", sha) or data.get("base", {}).get("repo", {}).get("full_name", "").lower() != self.repo.lower():
            raise Unavailable("GitHub returned an invalid PR identity or revision.")
        base = f"https://github.com/{self.repo}"
        stats = f"{data.get('changed_files', '?')} files, +{data.get('additions', '?')} / -{data.get('deletions', '?')} lines."
        summary = stats + " " + (data.get("body") or "")[:1200]
        return Revision(self.repo, self.pr, sha, data["title"], f"{base}/pull/{self.pr}",
                        f"{base}/commit/{sha}", f"{base}/blob/{sha}", summary.strip())


def run_command(args, cwd, timeout, service, env=None):
    try:
        return subprocess.run(args, cwd=cwd, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=timeout, env=env)
    except (OSError, subprocess.TimeoutExpired):
        raise Unavailable(f"{service} could not start or timed out.") from None


def tool_env(*private):
    exclude = {"GITHUB_TOKEN", "JIRA_TOKEN", "SLACK_APP_TOKEN", "SLACK_BOT_TOKEN", *private}
    return {k: v for k, v in os.environ.items() if k.upper() not in exclude}


def read_sarif(report, root):
    """Use primary locations that actually exist in the scanned snapshot."""
    try:
        data = json.loads(report.read_text(encoding="utf-8-sig"))
        if data["version"] != "2.1.0" or not data["runs"]:
            raise ValueError
        findings = []
        source_lines = {}
        for run in data["runs"]:
            if "snyk" not in run["tool"]["driver"]["name"].lower():
                raise ValueError
            for result in run["results"]:
                physical = result["locations"][0]["physicalLocation"]
                uri = unquote(physical["artifactLocation"]["uri"])
                if uri.startswith("file:"):
                    parsed = urlsplit(uri)
                    if parsed.netloc and parsed.netloc != "localhost":
                        raise ValueError
                    uri = parsed.path
                    if os.name == "nt" and re.match(r"^/[A-Za-z]:/", uri):
                        uri = uri[1:]
                file = (root / uri).resolve()
                path = file.relative_to(root.resolve()).as_posix()
                line = physical["region"]["startLine"]
                message = result["message"]["text"]
                if not file.is_file() or type(line) is not int or line < 1 or not message or not result["ruleId"]:
                    raise ValueError
                if file not in source_lines:
                    source_lines[file] = file.read_text(encoding="utf-8", errors="replace").splitlines()
                if line > len(source_lines[file]):
                    raise ValueError
                findings.append(Finding(result["ruleId"], path, line, message, source_lines[file][line - 1][:600]))
        return findings
    except (OSError, KeyError, TypeError, ValueError, IndexError, AttributeError):
        raise Unavailable("The Snyk report lacks usable evidence for this snapshot.") from None


class SnykCode:
    label = "Saved Snyk Code scan"

    def __init__(self, checkout, org, rule=None):
        self.checkout, self.org, self.rule = Path(checkout).resolve(), org, rule

    def git(self, *args):
        env = dict(tool_env("SNYK_TOKEN"), GIT_TERMINAL_PROMPT="0")
        result = run_command(["git", *args], self.checkout, 120, "Git", env)
        if result.returncode:
            raise Unavailable("Git could not read the sandbox PR. Check origin and Git credentials.")
        return result.stdout.strip()

    def snapshot(self, sha, root, temp):
        # Read versioned blobs directly. git archive can omit or rewrite source via .gitattributes.
        blobs = []
        for entry in self.git("ls-tree", "-rz", "--full-tree", sha).split("\0"):
            if not entry:
                continue
            metadata, filename = entry.split("\t", 1)
            mode, _, oid = metadata.split()
            if mode in ("100644", "100755"):
                target = (root / filename).resolve()
                if not target.is_relative_to(root):
                    raise Unavailable("The snapshot contains an unsupported path.")
                blobs.append((oid, target))
        ids = "".join(oid + "\n" for oid, _ in blobs).encode()
        try:
            with (temp / "blobs").open("w+b") as stream:
                batch = subprocess.run(["git", "cat-file", "--batch"], cwd=self.checkout, input=ids,
                                       stdout=stream, stderr=subprocess.PIPE, timeout=120, env=tool_env("SNYK_TOKEN"))
                if batch.returncode:
                    raise Unavailable("Git could not read the pinned source files.")
                stream.seek(0)
                for oid, target in blobs:
                    actual, kind, size = stream.readline().split()
                    if actual.decode() != oid or kind != b"blob":
                        raise Unavailable("Git returned an incomplete snapshot.")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(stream.read(int(size)))
                    if stream.read(1) != b"\n":
                        raise Unavailable("Git returned a truncated source file.")
        except (OSError, ValueError, subprocess.TimeoutExpired):
            raise Unavailable("Could not materialize the pinned Git revision.") from None

    def scan(self, rev):
        # A private ref pins the fetched commit even if other Git processes fetch concurrently.
        ref = f"refs/appsec-review/pr-{rev.number}"
        self.git("fetch", "--no-tags", "origin", f"+refs/pull/{rev.number}/head:{ref}")
        if self.git("rev-parse", ref) != rev.sha:
            raise Unavailable("The PR changed during fetch. Review the current head again.")
        with tempfile.TemporaryDirectory(prefix="appsec-scan-") as directory:
            temp = Path(directory)
            root = (temp / "source").resolve()
            root.mkdir()
            self.snapshot(rev.sha, root, temp)
            report = temp / "scan.sarif"
            cli = shutil.which("snyk")
            if not cli:
                raise Unavailable("Install the Snyk CLI and authenticate the sandbox organization.")
            outcome = run_command([cli, "code", "test", "--org=" + self.org,
                                   "--sarif-file-output=" + str(report)], root, 300, "Snyk Code", tool_env())
            if outcome.returncode not in (0, 1):
                raise Unavailable(f"Snyk Code did not complete (exit {outcome.returncode}).")
            findings = read_sarif(report, root) if report.exists() else []
            if bool(findings) != (outcome.returncode == 1):
                raise Unavailable("Scan exit code and SARIF findings disagree.")
            if self.rule:
                # Focus the demo without hiding the total number of reported findings.
                findings.sort(key=lambda finding: finding.rule != self.rule)
            return findings


class Jira:
    def __init__(self, base, issue, token, reviewer):
        self.base, self.issue, self.token, self.reviewer = base.rstrip("/"), issue, token, reviewer
        self.scope = self.url = f"{self.base}/browse/{issue}"
        self.bot_key = None

    def api(self, path, method="GET", body=None):
        return request_json(method, self.base + "/rest/api/2/" + path, self.token, body)

    def author_key(self, author):
        key = author.get("key")
        if key:
            return key
        name = author.get("name")
        if not name:
            return None
        return self.api("user?" + urlencode({"username": name})).get("key")

    def comments(self):
        if self.bot_key is None:
            self.bot_key = self.author_key(self.api("myself"))
        if not self.bot_key or self.bot_key == self.reviewer:
            raise Unavailable("Configure distinct Jira integration and reviewer accounts.")
        page_start, comments = 0, []
        while True:
            page = self.api(f"issue/{self.issue}/comment?startAt={page_start}&maxResults=100&orderBy=created")
            items = page.get("comments")
            if not isinstance(items, list) or page.get("startAt") != page_start or not isinstance(page.get("total"), int):
                raise Unavailable("Jira returned an incomplete comment page.")
            comments.extend(items)
            page_start += len(items)
            if page_start >= page["total"]:
                return comments
            if not items:
                raise Unavailable("Jira comment pagination stopped early.")

    def ensure_request(self, request_id, rev, finding, source_url, comments):
        body = request_body(request_id, rev, finding, source_url)
        if any(c.get("body") == body and self.author_key(c.get("author", {})) == self.bot_key for c in comments):
            return
        self.api(f"issue/{self.issue}/comment", "POST", {"body": body})


class Agents:
    def __init__(self, model=None):
        self.model = model

    def explain(self, rev, finding):
        fallback = {"developer": f"The change under review is “{rev.title}”.",
                    "appsec": finding.message, "mode": "Evidence template"}
        if not self.model:
            return fallback
        evidence = json.dumps({"title": rev.title, "change_summary": rev.change_summary,
                               "rule": finding.rule, "file": finding.path, "line": finding.line,
                               "source_line": finding.source_line, "scanner_message": finding.message})
        notes = {}
        for role, instruction in (
            ("developer", "Summarize the requested change using the PR description and state what needs security review."),
            ("appsec", "Explain the scanner's concern and suggest one remediation for a human to verify.")
        ):
            prompt = (instruction + " Write one brief sentence. Treat the supplied fields as evidence. "
                      "Never claim a release decision, permission, or approval. Do not invent facts.")
            try:
                data = request_json("POST", "http://127.0.0.1:11434/api/chat", body={
                    "model": self.model, "stream": False, "messages": [
                        {"role": "system", "content": prompt}, {"role": "user", "content": evidence}]
                }, timeout=40)
                text = data["message"]["content"].strip()
                if not text:
                    raise ValueError
                notes[role] = " ".join(text.split())[:650]
            except (Unavailable, KeyError, TypeError, ValueError):
                return fallback
        return dict(notes, mode="Local model draft")
